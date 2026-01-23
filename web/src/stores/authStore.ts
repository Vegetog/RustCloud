// AuthStore: Authentication state management using Zustand
// Manages user authentication, JWT tokens, and cryptographic keys (in-memory only)

import { create } from 'zustand';
import type { User } from '../types/auth';
import { CryptoService } from '../services/crypto';
import { apiService } from '../services/api';

interface AuthState {
  // State
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  masterKey: CryptoKey | null; // NEVER persisted, in-memory only
  privateKey: CryptoKey | null; // NEVER persisted, in-memory only
  publicKey: CryptoKey | null;
  loading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  user: null,
  accessToken: sessionStorage.getItem('accessToken'),
  refreshToken: sessionStorage.getItem('refreshToken'),
  masterKey: null,
  privateKey: null,
  publicKey: null,
  loading: false,
  error: null,

  // Login action
  login: async (email: string, password: string) => {
    set({ loading: true, error: null });

    try {
      const crypto = new CryptoService();

      // 1. Send login request
      const response = await apiService.login(email, password);
      const data = response.data.data;

      // 2. Derive master key from password + salt
      const salt = crypto.base64ToArrayBuffer(data.salt);
      const masterKey = await crypto.deriveMasterKey(password, new Uint8Array(salt));

      // 3. Decrypt private key
      const encryptedPrivateKeyBuffer = crypto.base64ToArrayBuffer(data.encrypted_private_key);
      const privateKeyNonceBuffer = crypto.base64ToArrayBuffer(data.private_key_nonce);
      const privateKey = await crypto.decryptPrivateKey(
        { ciphertext: encryptedPrivateKeyBuffer, nonce: new Uint8Array(privateKeyNonceBuffer) },
        masterKey
      );

      // 4. Import public key
      const publicKeyBuffer = crypto.base64ToArrayBuffer(data.user.public_key);
      const publicKey = await window.crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      );

      // 5. Save tokens to sessionStorage
      sessionStorage.setItem('accessToken', data.access_token);
      sessionStorage.setItem('refreshToken', data.refresh_token);

      // 6. Update state
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
    } catch (error: any) {
      console.error('Login failed:', error);
      set({
        loading: false,
        error: error.response?.data?.message || '登录失败，请检查邮箱和密码',
      });
      throw error;
    }
  },

  // Register action
  register: async (email: string, password: string) => {
    set({ loading: true, error: null });

    try {
      const crypto = new CryptoService();

      // 1. Generate random salt (32 bytes)
      const salt = window.crypto.getRandomValues(new Uint8Array(32));

      // 2. Derive master key
      const masterKey = await crypto.deriveMasterKey(password, salt);

      // 3. Generate RSA key pair (this may take ~1s)
      const keyPair = await crypto.generateKeyPair();

      // 4. Encrypt private key with master key
      const encryptedPrivateKey = await crypto.encryptPrivateKey(
        keyPair.privateKey,
        masterKey
      );

      // 5. Export public key
      const publicKeyBuffer = await window.crypto.subtle.exportKey(
        'spki',
        keyPair.publicKey
      );

      // 6. Send registration request
      await apiService.register({
        email,
        password, // Backend will hash with Argon2id
        salt: crypto.arrayBufferToBase64(salt.buffer as ArrayBuffer),
        public_key: crypto.arrayBufferToBase64(publicKeyBuffer),
        encrypted_private_key: crypto.arrayBufferToBase64(encryptedPrivateKey.ciphertext),
        private_key_nonce: crypto.arrayBufferToBase64(encryptedPrivateKey.nonce.buffer as ArrayBuffer),
      });

      // 7. Auto-login after successful registration
      await get().login(email, password);
    } catch (error: any) {
      console.error('Registration failed:', error);
      set({
        loading: false,
        error: error.response?.data?.message || '注册失败，请稍后重试',
      });
      throw error;
    }
  },

  // Logout action
  logout: () => {
    // Send logout request (fire and forget)
    apiService.logout().catch(() => {});

    // Clear tokens from sessionStorage
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');

    // Clear all state (including in-memory keys)
    set({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      masterKey: null, // Keys are garbage collected
      privateKey: null,
      publicKey: null,
      loading: false,
      error: null,
    });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

// Initialize: Check if we have tokens but no keys (page refresh scenario)
// In zero-knowledge architecture, keys are in-memory only, so refresh = re-login
const initState = useAuthStore.getState();
if (initState.accessToken && !initState.privateKey) {
  // Clear orphaned tokens
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
  });
  console.log('[Auth] Page refreshed: Keys lost, please re-login (zero-knowledge security)');
}
