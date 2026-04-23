import { useState, useEffect, useRef } from 'react';
import { isAxiosError } from 'axios';
import { X, Loader2, Save, Code2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { CryptoService } from '../services/crypto';
import type { CollaboratorInfo } from '../services/yjsWsProvider';
import { EncryptedYjsWsProvider, generateUserColor } from '../services/yjsWsProvider';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { onDocumentSaved as ragOnDocumentSaved } from '../rag/ragIntegration';

interface DocumentEditorModalProps {
  documentId: string;
  fileName: string;
  encryptedKey: string;
  encryptedName: string;
  nameNonce: string;
  contentNonce: string;
  permissionLevel?: 'owner' | 'write' | 'read';
  onClose: () => void;
  onSuccess: () => void;
}

export function DocumentEditorModal({
  documentId,
  fileName,
  encryptedKey,
  encryptedName,
  nameNonce,
  contentNonce,
  permissionLevel = 'write',
  onClose,
  onSuccess,
}: DocumentEditorModalProps) {
  const { privateKey, masterKey, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 协同编辑状态
  const [onlineUsers, setOnlineUsers] = useState<CollaboratorInfo[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  // Yjs 相关 refs
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<EncryptedYjsWsProvider | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const canWrite = permissionLevel === 'owner' || permissionLevel === 'write';

  // 从文件名推断语言
  const getLanguage = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
      'py': 'python', 'rs': 'rust', 'go': 'go', 'java': 'java', 'c': 'c', 'cpp': 'cpp',
      'h': 'c', 'hpp': 'cpp', 'cs': 'csharp', 'php': 'php', 'rb': 'ruby',
      'sh': 'shell', 'bash': 'shell', 'json': 'json', 'xml': 'xml', 'html': 'html',
      'css': 'css', 'scss': 'scss', 'md': 'markdown', 'yaml': 'yaml', 'yml': 'yaml',
      'toml': 'toml', 'sql': 'sql', 'txt': 'plaintext',
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  // 初始化：解密文档内容 + 建立 WebSocket 协同连接
  useEffect(() => {
    if (!privateKey || !encryptedKey) return;

    async function initCollaboration() {
      try {
        setLoading(true);
        setError(null);

        const crypto = new CryptoService();

        // 1. 用私钥解密 DEK
        const encryptedKeyBuffer = crypto.base64ToArrayBuffer(encryptedKey);
        const dekRaw = await window.crypto.subtle.decrypt(
          { name: 'RSA-OAEP' },
          privateKey!,
          encryptedKeyBuffer
        );

        // 2. 下载并解密文件初始内容
        const response = await apiService.downloadDocument(documentId);
        const decrypted = await crypto.decryptDocument(
          response.data,
          encryptedName,
          nameNonce,
          contentNonce,
          encryptedKey,
          privateKey!
        );
        const initialText = new TextDecoder('utf-8').decode(decrypted.content);

        // 3. 创建空 Y.Doc（内容由 Provider 根据房间状态决定何时填入）
        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        // 4. 获取访问令牌
        const accessToken = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken') || '';

        // 5. 初始化加密 WS Provider，传入初始内容由 Provider 管理
        const provider = new EncryptedYjsWsProvider(ydoc, {
          documentId,
          accessToken,
          dekRaw,
          initialContent: initialText,
          onUsersChange: setOnlineUsers,
          onConnectionChange: setWsConnected,
        });
        providerRef.current = provider;

        // 6. 设置当前用户感知信息（用于协作光标）
        provider.setLocalAwareness({
          name: user?.email || 'Unknown',
          color: generateUserColor(user?.id || ''),
        });

        // 7. 文件下载/解密完成，立即显示编辑器（不等待 WS 同步完成）
        //    内容会在 Provider 就绪后通过 MonacoBinding 自动填入
        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize collaboration:', err);
        setError('加载文档失败：' + (err instanceof Error ? err.message : '未知错误'));
        setLoading(false);
      }
    }

    initCollaboration();

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
      providerRef.current?.destroy();
      providerRef.current = null;
      ydocRef.current?.destroy();
      ydocRef.current = null;
    };
  }, [privateKey, encryptedKey, documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 动态注入远程光标颜色和用户名标签的 CSS
  useEffect(() => {
    const awareness = providerRef.current?.getAwareness();
    if (!awareness) return;

    const styleId = 'yjs-cursor-styles';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    const updateStyles = () => {
      const rules: string[] = [];
      awareness.getStates().forEach((state, clientID) => {
        if (clientID === providerRef.current?.getAwareness().doc.clientID) return;
        const u = state.user as { name?: string; color?: string } | undefined;
        if (!u?.color) return;
        const color = u.color;
        const name = u.name || '';
        // 选区背景色（半透明）
        rules.push(`.yRemoteSelection-${clientID} { background-color: ${color}40; }`);
        // 光标竖线颜色
        rules.push(`.yRemoteSelectionHead-${clientID} { border-left: 2px solid ${color}; }`);
        // 光标顶端用户名标签
        rules.push(`.yRemoteSelectionHead-${clientID}::after { content: "${name}"; background-color: ${color}; color: #fff; font-size: 11px; font-weight: 600; padding: 1px 4px; border-radius: 3px 3px 3px 0; position: absolute; top: -1.4em; left: -1px; white-space: nowrap; pointer-events: none; z-index: 10; }`);
      });
      if (styleEl) {
        styleEl.textContent = rules.join('\n');
      }
    };

    awareness.on('change', updateStyles);
    updateStyles();

    return () => {
      awareness.off('change', updateStyles);
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [wsConnected]); // 当连接状态变化时重新绑定

  // Monaco 编辑器挂载回调
  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
    if (ydocRef.current && providerRef.current) {
      _bindMonaco(editor, ydocRef.current, providerRef.current);
    }
    if (!canWrite) {
      editor.updateOptions({ readOnly: true });
    }
  };

  function _bindMonaco(
    editor: Parameters<OnMount>[0],
    ydoc: Y.Doc,
    provider: EncryptedYjsWsProvider
  ) {
    if (bindingRef.current) return; // 已绑定
    const yText = ydoc.getText('content');
    const model = editor.getModel();
    if (!model) return;

    // 关键：先将 model 内容设为 yText 当前值
    // MonacoBinding 构造函数内部会调用 model.setValue(ytext.toString())
    // 如果 model 内容已经匹配，Monaco 不会触发 onDidChangeContent
    // 从而避免内容被回写到 yText 导致重复
    model.setValue(yText.toString());

    bindingRef.current = new MonacoBinding(
      yText,
      model,
      new Set([editor]),
      provider.getAwareness()
    );
  }

  // 保存文档（从 yText 获取当前内容，加密后上传）
  const handleSave = async () => {
    if (!canWrite) return;
    const ydoc = ydocRef.current;
    if (!ydoc || !privateKey) return;

    setSaving(true);
    setError(null);

    try {
      const crypto = new CryptoService();
      const yText = ydoc.getText('content');
      const currentText = yText.toString();

      // 1. 用私钥解密 DEK
      const encryptedKeyBuffer = crypto.base64ToArrayBuffer(encryptedKey);
      const dekRaw = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        encryptedKeyBuffer
      );

      // 2. 导入 DEK 为 AES 加密密钥
      const documentKey = await window.crypto.subtle.importKey(
        'raw',
        dekRaw,
        'AES-GCM',
        false,
        ['encrypt']
      );

      // 3. 加密文件内容（新 nonce）
      const contentBuffer = new TextEncoder().encode(currentText);
      const newContentNonce = window.crypto.getRandomValues(new Uint8Array(12));
      const encryptedContent = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: newContentNonce },
        documentKey,
        contentBuffer
      );

      // 4. 上传加密文件
      const blob = new Blob([encryptedContent]);
      const uploadResponse = await apiService.uploadFile(blob, 'encrypted');
      const newStoragePath = uploadResponse.data.data.storage_path;

      // 5. 更新文档元数据（协同模式，不传 lock_id 和 expected_version）
      await apiService.updateDocument(documentId, {
        content_nonce: crypto.arrayBufferToBase64(newContentNonce.buffer as ArrayBuffer),
        storage_path: newStoragePath,
        size: blob.size,
      });

      // 触发 RAG 索引（防抖 30s，fire-and-forget，不阻塞保存）
      if (masterKey) {
        ragOnDocumentSaved(documentId, fileName, currentText, masterKey);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save document:', err);
      const message = isAxiosError(err)
        ? ((err.response?.data as { error?: { message?: string } } | undefined)?.error?.message || err.message)
        : err instanceof Error
          ? err.message
          : '未知错误';
      setError('保存失败：' + message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">编辑文档</h2>
              <p className="text-sm text-slate-500">{fileName}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* WS 连接状态 */}
            <div className="flex items-center space-x-1.5">
              {wsConnected ? (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-green-600 font-medium">实时协同</span>
                  <Wifi className="w-4 h-4 text-green-500" />
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-orange-400 rounded-full" />
                  <span className="text-xs text-orange-500 font-medium">连接中</span>
                  <WifiOff className="w-4 h-4 text-orange-400" />
                </>
              )}
            </div>

            {/* 在线协作者头像列表 */}
            {onlineUsers.length > 0 && (
              <div className="flex items-center -space-x-1">
                {onlineUsers.slice(0, 5).map((u) => (
                  <div
                    key={u.userId}
                    title={`${u.userEmail} (${u.permissionLevel})`}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-bold border-2 border-white"
                    style={{ backgroundColor: generateUserColor(u.userId) }}
                  >
                    {u.userEmail.charAt(0).toUpperCase()}
                  </div>
                ))}
                {onlineUsers.length > 5 && (
                  <div className="w-7 h-7 rounded-full bg-slate-400 flex items-center justify-center text-xs text-white font-bold border-2 border-white">
                    +{onlineUsers.length - 5}
                  </div>
                )}
              </div>
            )}

            {!canWrite && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">只读</span>
            )}

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {/* 编辑器 */}
        <div className="flex-1 overflow-hidden p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <Editor
              height="100%"
              language={getLanguage(fileName)}
              theme="vs-light"
              onMount={handleEditorDidMount}
              options={{
                fontSize: 14,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                readOnly: !canWrite,
              }}
            />
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex space-x-3 p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {canWrite ? '取消' : '关闭'}
          </button>
          {canWrite && (
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>保存</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
