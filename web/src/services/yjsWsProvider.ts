/**
 * EncryptedYjsWsProvider
 *
 * 将 Yjs CRDT 与 WebSocket 和 E2EE（AES-GCM）桥接。
 * 所有 Yjs 增量更新在发送前用文档 DEK 加密，接收后解密，
 * 服务端仅作为密文中继，不持有明文 DEK。
 *
 * CRDT 同步策略：
 * - 第一个进入房间的用户：将解密后的文件内容插入 Y.Doc，并通过 WS 广播
 * - 后续用户：创建空 Y.Doc，等待已有用户发送完整状态后同步
 * - 当有新用户加入时，已有用户主动发送自己的完整 Y.Doc 状态
 */

import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';

export interface CollaboratorInfo {
  userId: string;
  userEmail: string;
  permissionLevel: string;
}

export interface EncryptedProviderOptions {
  documentId: string;
  /** 访问令牌（JWT），通过 query param 传给 WS 端点 */
  accessToken: string;
  /** 明文 DEK（32字节 ArrayBuffer），调用方负责 RSA-OAEP 解密后传入 */
  dekRaw: ArrayBuffer;
  /** 解密后的文件内容，由 Provider 决定何时插入 Y.Doc */
  initialContent?: string;
  /** WebSocket 基础 URL，默认自动推断 */
  wsBaseUrl?: string;
  onUsersChange?: (users: CollaboratorInfo[]) => void;
  onConnectionChange?: (connected: boolean) => void;
  /** 当 Y.Doc 内容就绪时回调（第一个用户插入内容后 / 后续用户同步完成后） */
  onReady?: () => void;
}

/** 服务端下行消息类型 */
interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

export class EncryptedYjsWsProvider {
  private ws: WebSocket | null = null;
  private ydoc: Y.Doc;
  private awareness: awarenessProtocol.Awareness;
  private aesKey: CryptoKey | null = null;
  private options: EncryptedProviderOptions;
  private connected = false;
  private destroyed = false;
  private _ready = false;
  private onlineUsers: Map<string, CollaboratorInfo> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** 消息处理队列，确保 async 消息按顺序处理（避免并发解密乱序） */
  private _messageQueue: Promise<void> = Promise.resolve();

  constructor(ydoc: Y.Doc, options: EncryptedProviderOptions) {
    this.ydoc = ydoc;
    this.options = options;
    this.awareness = new awarenessProtocol.Awareness(ydoc);
    this._init();
  }

  private async _init() {
    // 导入 DEK 为 AES-GCM CryptoKey
    this.aesKey = await window.crypto.subtle.importKey(
      'raw',
      this.options.dekRaw,
      'AES-GCM',
      false,
      ['encrypt', 'decrypt']
    );
    this._connect();
    this.ydoc.on('update', this._handleLocalUpdate);
    this.awareness.on('update', this._handleAwarenessUpdate);
  }

  private _connect() {
    if (this.destroyed) return;

    const wsBase =
      this.options.wsBaseUrl ||
      (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
        window.location.host;
    const url = `${wsBase}/api/v1/documents/${this.options.documentId}/ws?token=${encodeURIComponent(this.options.accessToken)}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this.options.onConnectionChange?.(true);
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        // 将消息排入队列，确保按顺序处理（async 解密不会乱序）
        this._messageQueue = this._messageQueue.then(() =>
          this._handleServerMessage(msg).catch((e) =>
            console.error('[YjsWsProvider] Message handling error:', e)
          )
        );
      } catch {
        // 忽略无法解析的消息
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.options.onConnectionChange?.(false);
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this._connect(), 3000);
      }
    };

    this.ws.onerror = () => {
      // onclose 会随后触发，由 onclose 处理重连
    };
  }

  private async _handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'presence': {
        type RawUser = { user_id: string; user_email: string; permission_level: string };
        const rawUsers = (msg.users as RawUser[]) || [];
        this.onlineUsers.clear();
        rawUsers.forEach((u) => {
          const mapped: CollaboratorInfo = {
            userId: u.user_id,
            userEmail: u.user_email,
            permissionLevel: u.permission_level,
          };
          this.onlineUsers.set(mapped.userId, mapped);
        });
        this.options.onUsersChange?.([...this.onlineUsers.values()]);

        // 决定是否作为第一个用户初始化内容
        if (!this._ready && this.options.initialContent !== undefined) {
          if (rawUsers.length === 0) {
            // 房间空，我是第一个用户：插入文件内容到 Y.Doc
            const yText = this.ydoc.getText('content');
            yText.insert(0, this.options.initialContent);
            this._markReady();
          }
          // 房间非空：服务端已通过 sync_step2 发送累积更新，
          // 同时已有用户也会通过 user_joined 事件发送完整状态。
          // 如果 3 秒内仍未就绪，使用本地 initialContent 兜底
          if (rawUsers.length > 0) {
            setTimeout(() => {
              if (!this._ready && !this.destroyed && this.options.initialContent !== undefined) {
                console.warn('[YjsWsProvider] Sync timeout, falling back to local content');
                const yText = this.ydoc.getText('content');
                if (yText.length === 0) {
                  yText.insert(0, this.options.initialContent!);
                }
                this._markReady();
              }
            }, 3000);
          }
        }
        break;
      }
      case 'user_joined': {
        const u: CollaboratorInfo = {
          userId: msg.user_id as string,
          userEmail: msg.user_email as string,
          permissionLevel: msg.permission_level as string,
        };
        this.onlineUsers.set(u.userId, u);
        this.options.onUsersChange?.([...this.onlineUsers.values()]);

        // 有新用户加入，主动发送完整 Y.Doc 状态帮助其同步
        if (this._ready) {
          this._sendFullState();
        }
        break;
      }
      case 'user_left': {
        this.onlineUsers.delete(msg.user_id as string);
        this.options.onUsersChange?.([...this.onlineUsers.values()]);
        break;
      }
      case 'yjs_update': {
        const decrypted = await this._decrypt(
          msg.payload as string,
          msg.nonce as string
        );
        if (decrypted) {
          Y.applyUpdate(this.ydoc, new Uint8Array(decrypted), 'remote');
          // 非第一个用户收到完整状态后变为 ready
          this._markReady();
        }
        break;
      }
      case 'sync_step2': {
        const decrypted = await this._decrypt(
          msg.payload as string,
          msg.nonce as string
        );
        if (decrypted) {
          Y.applyUpdate(this.ydoc, new Uint8Array(decrypted), 'sync');
          this._markReady();
        }
        break;
      }
      case 'awareness': {
        const decrypted = await this._decrypt(
          msg.payload as string,
          msg.nonce as string
        );
        if (decrypted) {
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            new Uint8Array(decrypted),
            'remote'
          );
        }
        break;
      }
      case 'error': {
        console.error('[YjsWsProvider] Server error:', msg.message);
        break;
      }
    }
  }

  private _markReady() {
    if (!this._ready) {
      this._ready = true;
      this.options.onReady?.();
    }
  }

  /** 将完整 Y.Doc 状态加密后发送（用于帮助新加入用户同步） */
  private async _sendFullState() {
    if (!this.connected || !this.ws || !this.aesKey) return;
    try {
      const fullState = Y.encodeStateAsUpdate(this.ydoc);
      const { ciphertext, nonce } = await this._encrypt(fullState);
      this._sendJson({
        type: 'yjs_update',
        payload: this._toBase64(new Uint8Array(ciphertext)),
        nonce: this._toBase64(nonce),
      });
    } catch (e) {
      console.error('[YjsWsProvider] Failed to send full state:', e);
    }
  }

  private _handleLocalUpdate = async (update: Uint8Array, origin: unknown) => {
    // 忽略远端来源的更新，防止回环
    if (origin === 'remote' || origin === 'sync') return;
    if (!this.connected || !this.ws || !this.aesKey) return;

    try {
      const { ciphertext, nonce } = await this._encrypt(update);
      this._sendJson({
        type: 'yjs_update',
        payload: this._toBase64(new Uint8Array(ciphertext)),
        nonce: this._toBase64(nonce),
      });
    } catch (e) {
      console.error('[YjsWsProvider] Encrypt error:', e);
    }
  };

  private _handleAwarenessUpdate = async ({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) => {
    if (!this.connected || !this.ws || !this.aesKey) return;
    const changed = [...added, ...updated, ...removed];
    const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
      this.awareness,
      changed
    );
    try {
      const { ciphertext, nonce } = await this._encrypt(awarenessUpdate);
      this._sendJson({
        type: 'awareness',
        payload: this._toBase64(new Uint8Array(ciphertext)),
        nonce: this._toBase64(nonce),
      });
    } catch (e) {
      console.error('[YjsWsProvider] Awareness encrypt error:', e);
    }
  };

  private async _encrypt(data: Uint8Array): Promise<{ ciphertext: ArrayBuffer; nonce: Uint8Array }> {
    const nonce = window.crypto.getRandomValues(new Uint8Array(12));
    const safeData = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      this.aesKey!,
      safeData
    );
    return { ciphertext, nonce };
  }

  private async _decrypt(
    payloadBase64: string,
    nonceBase64: string
  ): Promise<ArrayBuffer | null> {
    try {
      const payload = this._fromBase64(payloadBase64);
      const nonce = this._fromBase64(nonceBase64);
      const safePayload = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer;
      const safeNonce = nonce.buffer.slice(nonce.byteOffset, nonce.byteOffset + nonce.byteLength) as ArrayBuffer;
      return await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: safeNonce },
        this.aesKey!,
        safePayload
      );
    } catch (e) {
      console.error('[YjsWsProvider] Decrypt error:', e);
      return null;
    }
  }

  private _sendJson(obj: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  // ===== 公开方法 =====

  /** 设置当前用户的 awareness 信息（用于显示协作光标） */
  setLocalAwareness(data: { name: string; color: string; cursor?: unknown }) {
    this.awareness.setLocalStateField('user', data);
  }

  getAwareness(): awarenessProtocol.Awareness {
    return this.awareness;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get isReady(): boolean {
    return this._ready;
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    this.ydoc.off('update', this._handleLocalUpdate);
    this.awareness.off('update', this._handleAwarenessUpdate);
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.ydoc.clientID],
      'destroy'
    );
    this.ws?.close();
    this.ws = null;
  }

  // ===== 工具函数 =====

  private _toBase64(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  private _fromBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

/** 根据 userId 哈希生成固定颜色（用于区分协作者光标） */
export function generateUserColor(userId: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#DDA0DD', '#98FB98', '#F0A500', '#6C9BCF',
  ];
  let hash = 0;
  for (let i = 0; i < (userId || '').length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}
