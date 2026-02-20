// 认证状态仓库：使用 Zustand 管理认证状态
// 负责用户认证、JWT 令牌和加密密钥的管理
// 密钥持久化到 sessionStorage 以支持页面刷新（浏览器关闭时清除）

import { create } from 'zustand';
import { isAxiosError } from 'axios';
import type { User } from '../types/auth';
import { CryptoService } from '../services/crypto';
import { apiService } from '../services/api';

interface AuthState {
  // 状态
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  masterKey: CryptoKey | null; // 持久化到 sessionStorage（JWK 格式）
  privateKey: CryptoKey | null; // 持久化到 sessionStorage（JWK 格式）
  publicKey: CryptoKey | null;
  loading: boolean;
  error: string | null;

  // 操作
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
    return message || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // 初始状态
  isAuthenticated: false,
  user: null,
  accessToken: sessionStorage.getItem('accessToken'),
  refreshToken: sessionStorage.getItem('refreshToken'),
  masterKey: null,
  privateKey: null,
  publicKey: null,
  loading: false,
  error: null,

  // 登录操作
  login: async (email: string, password: string) => {
    set({ loading: true, error: null });

    try {
      const crypto = new CryptoService();

      // 1. 发送登录请求
      const response = await apiService.login(email, password);
      const data = response.data.data;

      // 2. 从密码和盐值派生主密钥
      const salt = crypto.base64ToArrayBuffer(data.salt);
      const masterKey = await crypto.deriveMasterKey(password, new Uint8Array(salt));

      // 3. 解密私钥
      const encryptedPrivateKeyBuffer = crypto.base64ToArrayBuffer(data.encrypted_private_key);
      const privateKeyNonceBuffer = crypto.base64ToArrayBuffer(data.private_key_nonce);
      const privateKey = await crypto.decryptPrivateKey(
        { ciphertext: encryptedPrivateKeyBuffer, nonce: new Uint8Array(privateKeyNonceBuffer) },
        masterKey
      );

      // 4. 导入公钥（extractable: true 用于会话持久化）
      const publicKeyBuffer = crypto.base64ToArrayBuffer(data.user.public_key);
      const publicKey = await window.crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['encrypt']
      );

      // 5. 将令牌保存到 sessionStorage
      sessionStorage.setItem('accessToken', data.access_token);
      sessionStorage.setItem('refreshToken', data.refresh_token);

      // 6. 导出密钥并保存到 sessionStorage，以便页面刷新后恢复
      const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', privateKey);
      const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', publicKey);
      const masterKeyRaw = await window.crypto.subtle.exportKey('raw', masterKey);
      sessionStorage.setItem('privateKeyJwk', JSON.stringify(privateKeyJwk));
      sessionStorage.setItem('publicKeyJwk', JSON.stringify(publicKeyJwk));
      sessionStorage.setItem('masterKeyRaw', crypto.arrayBufferToBase64(masterKeyRaw));
      sessionStorage.setItem('user', JSON.stringify(data.user));

      // 7. 更新状态
      set({
        isAuthenticated: true,
        user: data.user,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        masterKey,
        privateKey,
        publicKey,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Login failed:', error);
      set({
        loading: false,
        error: getErrorMessage(error, '登录失败，请检查邮箱和密码'),
      });
      throw error;
    }
  },

  // 注册操作
  register: async (email: string, password: string) => {
    set({ loading: true, error: null });

    try {
      const crypto = new CryptoService();

      // 1. 生成随机盐值（32 字节）
      const salt = window.crypto.getRandomValues(new Uint8Array(32));

      // 2. 派生主密钥
      const masterKey = await crypto.deriveMasterKey(password, salt);

      // 3. 生成 RSA 密钥对（可能耗时约 1 秒）
      const keyPair = await crypto.generateKeyPair();

      // 4. 使用主密钥加密私钥
      const encryptedPrivateKey = await crypto.encryptPrivateKey(
        keyPair.privateKey,
        masterKey
      );

      // 5. 导出公钥
      const publicKeyBuffer = await window.crypto.subtle.exportKey(
        'spki',
        keyPair.publicKey
      );

      // 6. 发送注册请求
      await apiService.register({
        email,
        password, // 后端将使用 Argon2id 进行哈希
        salt: crypto.arrayBufferToBase64(salt.buffer as ArrayBuffer),
        public_key: crypto.arrayBufferToBase64(publicKeyBuffer),
        encrypted_private_key: crypto.arrayBufferToBase64(encryptedPrivateKey.ciphertext),
        private_key_nonce: crypto.arrayBufferToBase64(encryptedPrivateKey.nonce.buffer as ArrayBuffer),
      });

      // 7. 注册成功后自动登录
      await get().login(email, password);
    } catch (error) {
      console.error('Registration failed:', error);
      set({
        loading: false,
        error: getErrorMessage(error, '注册失败，请稍后重试'),
      });
      throw error;
    }
  },

  // 注销操作
  logout: () => {
    // 发送注销请求（即发即忘）
    apiService.logout().catch(() => {});

    // 清除 sessionStorage 中的所有数据（令牌和密钥）
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('privateKeyJwk');
    sessionStorage.removeItem('publicKeyJwk');
    sessionStorage.removeItem('masterKeyRaw');
    sessionStorage.removeItem('user');

    // 清除所有状态（包括内存中的密钥）
    set({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      masterKey: null, // 密钥由垃圾回收器回收
      privateKey: null,
      publicKey: null,
      loading: false,
      error: null,
    });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));

// 初始化：页面刷新时从 sessionStorage 恢复密钥
async function initializeAuth() {
  const initState = useAuthStore.getState();

  // 检查是否存在令牌和已存储的密钥
  if (initState.accessToken && !initState.privateKey) {
    const privateKeyJwkStr = sessionStorage.getItem('privateKeyJwk');
    const publicKeyJwkStr = sessionStorage.getItem('publicKeyJwk');
    const masterKeyRawStr = sessionStorage.getItem('masterKeyRaw');
    const userStr = sessionStorage.getItem('user');

    if (privateKeyJwkStr && publicKeyJwkStr && masterKeyRawStr && userStr) {
      try {
        const crypto = new CryptoService();

        // 恢复私钥
        const privateKeyJwk = JSON.parse(privateKeyJwkStr);
        const privateKey = await window.crypto.subtle.importKey(
          'jwk',
          privateKeyJwk,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['decrypt']
        );

        // 恢复公钥
        const publicKeyJwk = JSON.parse(publicKeyJwkStr);
        const publicKey = await window.crypto.subtle.importKey(
          'jwk',
          publicKeyJwk,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['encrypt']
        );

        // 恢复主密钥
        const masterKeyRaw = crypto.base64ToArrayBuffer(masterKeyRawStr);
        const masterKey = await window.crypto.subtle.importKey(
          'raw',
          masterKeyRaw,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );

        // 恢复用户信息
        const user = JSON.parse(userStr);

        // 更新状态
        useAuthStore.setState({
          isAuthenticated: true,
          user,
          masterKey,
          privateKey,
          publicKey,
        });

        console.log('[Auth] Session restored from sessionStorage');
        return;
      } catch (error) {
        console.error('[Auth] Failed to restore session:', error);
      }
    }

    // 若恢复失败，清除所有数据
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('privateKeyJwk');
    sessionStorage.removeItem('publicKeyJwk');
    sessionStorage.removeItem('masterKeyRaw');
    sessionStorage.removeItem('user');
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
    console.log('[Auth] Session restoration failed, please re-login');
  }
}

// 执行初始化
initializeAuth();
