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
        content_nonce: encrypted.contentNonce,
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

      // Extract document metadata including content nonce
      const document = detail.document;

      // Check if content_nonce is available (older files might not have it)
      if (!document.content_nonce || document.content_nonce.trim() === '') {
        throw new Error(
          '该文件缺少解密所需的元数据（content_nonce）。' +
          '这可能是在系统升级前上传的文件。' +
          '请删除此文件并重新上传。'
        );
      }

      // Decrypt document
      const decrypted = await crypto.decryptDocument(
        encryptedContent,
        document.encrypted_name,
        document.name_nonce,
        document.content_nonce,
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

      // Handle error message (special handling for arraybuffer responses)
      let errorMessage = '文件下载失败';
      if (error.response?.data) {
        // If responseType was arraybuffer, error.response.data might be ArrayBuffer
        if (error.response.data instanceof ArrayBuffer) {
          try {
            const text = new TextDecoder().decode(error.response.data);
            const json = JSON.parse(text);
            errorMessage = json.error?.message || json.message || errorMessage;
          } catch {
            // Failed to parse, use default message
          }
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.error?.message) {
          errorMessage = error.response.data.error.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      set({ error: errorMessage });
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
