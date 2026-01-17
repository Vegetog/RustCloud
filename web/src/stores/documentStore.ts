// DocumentStore: Document management state using Zustand
// Handles document listing, uploading, downloading, and deletion

import { create } from 'zustand';
import type { Document } from '../types/document';
import { apiService } from '../services/api';
import { CryptoService } from '../services/crypto';
import { useAuthStore } from './authStore';

interface DocumentState {
  // State
  documents: Document[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  uploadProgress: number;

  // Actions
  loadDocuments: (page?: number) => Promise<void>;
  uploadDocument: (file: File) => Promise<void>;
  downloadDocument: (id: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  // Initial state
  documents: [],
  total: 0,
  page: 1,
  pageSize: 20,
  loading: false,
  error: null,
  uploadProgress: 0,

  // Load documents with pagination
  loadDocuments: async (page = 1) => {
    set({ loading: true, error: null });

    try {
      const response = await apiService.getDocuments({ page, pageSize: 20 });
      const data = response.data.data;

      set({
        documents: data.documents,
        total: data.total,
        page: data.page,
        pageSize: data.page_size,
        loading: false,
      });
    } catch (error: any) {
      console.error('Failed to load documents:', error);
      set({
        error: error.response?.data?.message || '加载文档列表失败',
        loading: false,
      });
    }
  },

  // Upload encrypted document
  uploadDocument: async (file: File) => {
    set({ loading: true, error: null, uploadProgress: 0 });

    try {
      const crypto = new CryptoService();
      const publicKey = useAuthStore.getState().publicKey;

      if (!publicKey) {
        throw new Error('No public key available. Please login again.');
      }

      // Progress: 10% - Starting encryption
      set({ uploadProgress: 10 });

      // Encrypt document (content + filename)
      const encrypted = await crypto.encryptDocument(file, publicKey);

      // Progress: 50% - Encryption complete
      set({ uploadProgress: 50 });

      // Create blob from encrypted content
      const blob = new Blob([encrypted.encryptedContent]);

      // Upload with metadata
      await apiService.uploadDocument(blob, {
        encrypted_name: encrypted.encryptedName,
        name_nonce: encrypted.nameNonce,
        encrypted_key: encrypted.encryptedKey,
        content_hash: encrypted.contentHash,
        mime_type: file.type || 'application/octet-stream',
      });

      // Progress: 100% - Upload complete
      set({ uploadProgress: 100 });

      // Reload document list
      await get().loadDocuments(get().page);

      set({ loading: false, uploadProgress: 0 });
    } catch (error: any) {
      console.error('Failed to upload document:', error);
      set({
        error: error.response?.data?.message || '文件上传失败',
        loading: false,
        uploadProgress: 0,
      });
      throw error;
    }
  },

  // Download and decrypt document
  downloadDocument: async (id: string) => {
    try {
      const crypto = new CryptoService();
      const privateKey = useAuthStore.getState().privateKey;

      if (!privateKey) {
        throw new Error('No private key available. Please login again.');
      }

      // Get document details (includes encrypted_key)
      const detailResponse = await apiService.getDocumentDetail(id);
      const detail = detailResponse.data.data;

      // Download encrypted content
      const contentResponse = await apiService.downloadDocument(id);
      const encryptedContent = contentResponse.data;

      // Extract content nonce from document metadata
      // Note: The backend should return this in the response headers or document detail
      // For now, we'll assume it's in the detail response
      // TODO: Verify the actual API response structure
      const document = detail.document;

      // Decrypt document
      const decrypted = await crypto.decryptDocument(
        encryptedContent,
        document.encrypted_name,
        document.name_nonce,
        '', // content_nonce - TODO: get from API response
        detail.encrypted_key,
        privateKey
      );

      // Trigger browser download
      const blob = new Blob([decrypted.content]);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = decrypted.fileName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Failed to download document:', error);
      set({
        error: error.response?.data?.message || '文件下载失败',
      });
      throw error;
    }
  },

  // Delete document
  deleteDocument: async (id: string) => {
    try {
      await apiService.deleteDocument(id);

      // Reload document list
      await get().loadDocuments(get().page);
    } catch (error: any) {
      console.error('Failed to delete document:', error);
      set({
        error: error.response?.data?.message || '文件删除失败',
      });
      throw error;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));
