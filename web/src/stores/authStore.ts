// AuthStore: Authentication state management using Zustand
// Manages user authentication, JWT tokens, and cryptographic keys
// Keys are persisted in sessionStorage for page refresh support (cleared on browser close)

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
  masterKey: CryptoKey | null; // Persisted in sessionStorage (JWK format)
  privateKey: CryptoKey | null; // Persisted in sessionStorage (JWK format)
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

      // 4. Import public key (extractable: true for session persistence)
      const publicKeyBuffer = crypto.base64ToArrayBuffer(data.user.public_key);
      const publicKey = await window.crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['encrypt']
      );

      // 5. Save tokens to sessionStorage
      sessionStorage.setItem('accessToken', data.access_token);
      sessionStorage.setItem('refreshToken', data.refresh_token);

      // 6. Export and save keys to sessionStorage for persistence across refresh
      const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', privateKey);
      const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', publicKey);
      const masterKeyRaw = await window.crypto.subtle.exportKey('raw', masterKey);
      sessionStorage.setItem('privateKeyJwk', JSON.stringify(privateKeyJwk));
      sessionStorage.setItem('publicKeyJwk', JSON.stringify(publicKeyJwk));
      sessionStorage.setItem('masterKeyRaw', crypto.arrayBufferToBase64(masterKeyRaw));
      sessionStorage.setItem('user', JSON.stringify(data.user));

      // 7. Update state
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
        error: error.response?.data?.error?.message || '登录失败，请检查邮箱和密码',
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
        error: error.response?.data?.error?.message || '注册失败，请稍后重试',
      });
      throw error;
    }
  },

  // Logout action
  logout: () => {
    // Send logout request (fire and forget)
    apiService.logout().catch(() => {});

    // Clear all from sessionStorage (tokens + keys)
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('privateKeyJwk');
    sessionStorage.removeItem('publicKeyJwk');
    sessionStorage.removeItem('masterKeyRaw');
    sessionStorage.removeItem('user');

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

// Initialize: Restore keys from sessionStorage on page refresh
async function initializeAuth() {
  const initState = useAuthStore.getState();

  // Check if we have tokens and stored keys
  if (initState.accessToken && !initState.privateKey) {
    const privateKeyJwkStr = sessionStorage.getItem('privateKeyJwk');
    const publicKeyJwkStr = sessionStorage.getItem('publicKeyJwk');
    const masterKeyRawStr = sessionStorage.getItem('masterKeyRaw');
    const userStr = sessionStorage.getItem('user');

    if (privateKeyJwkStr && publicKeyJwkStr && masterKeyRawStr && userStr) {
      try {
        const crypto = new CryptoService();

        // Restore private key
        const privateKeyJwk = JSON.parse(privateKeyJwkStr);
        const privateKey = await window.crypto.subtle.importKey(
          'jwk',
          privateKeyJwk,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['decrypt']
        );

        // Restore public key
        const publicKeyJwk = JSON.parse(publicKeyJwkStr);
        const publicKey = await window.crypto.subtle.importKey(
          'jwk',
          publicKeyJwk,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['encrypt']
        );

        // Restore master key
        const masterKeyRaw = crypto.base64ToArrayBuffer(masterKeyRawStr);
        const masterKey = await window.crypto.subtle.importKey(
          'raw',
          masterKeyRaw,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );

        // Restore user
        const user = JSON.parse(userStr);

        // Update state
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

    // If restoration failed, clear everything
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

// Run initialization
initializeAuth();
