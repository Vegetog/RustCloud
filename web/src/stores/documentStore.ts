// 文档状态仓库：使用 Zustand 管理文档状态
// 处理文档列表加载、上传、下载和删除

import { create } from 'zustand';
import { isAxiosError } from 'axios';
import type { Document } from '../types/document';
import { apiService } from '../services/api';
import { CryptoService } from '../services/crypto';
import { useAuthStore } from './authStore';
import { getErrorMessage } from '../utils/format';

interface DocumentState {
  // 状态
  documents: Document[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  uploadProgress: number;

  // 操作
  loadDocuments: (page?: number) => Promise<void>;
  uploadDocument: (file: File) => Promise<void>;
  downloadDocument: (id: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  // 初始状态
  documents: [],
  total: 0,
  page: 1,
  pageSize: 20,
  loading: false,
  error: null,
  uploadProgress: 0,

  // 分页加载文档列表
  loadDocuments: async (page = 1) => {
    set({ loading: true, error: null });

    try {
      const response = await apiService.getDocuments({ page, page_size: 20 });
      const data = response.data.data;

      // 在客户端解密文件名
      const privateKey = useAuthStore.getState().privateKey;
      let documents: Document[] = data.documents;

      if (privateKey) {
        const crypto = new CryptoService();
        documents = await Promise.all(
          data.documents.map(async (doc: Document) => {
            if (!doc.encrypted_key) return doc;
            try {
              const decrypted_name = await crypto.decryptFileName(
                doc.encrypted_name,
                doc.name_nonce,
                doc.encrypted_key,
                privateKey
              );
              return { ...doc, decrypted_name };
            } catch {
              return doc;
            }
          })
        );
      }

      set({
        documents,
        total: data.total,
        page: data.page,
        pageSize: data.page_size,
        loading: false,
      });
    } catch (error) {
      console.error('Failed to load documents:', error);
      set({
        error: getErrorMessage(error, '加载文档列表失败'),
        loading: false,
      });
    }
  },

  // 上传加密文档
  uploadDocument: async (file: File) => {
    set({ loading: true, error: null, uploadProgress: 0 });

    try {
      const crypto = new CryptoService();
      const publicKey = useAuthStore.getState().publicKey;

      if (!publicKey) {
        throw new Error('No public key available. Please login again.');
      }

      // 进度：10% - 开始加密
      set({ uploadProgress: 10 });

      // 加密文档（内容和文件名）
      const encrypted = await crypto.encryptDocument(file, publicKey);

      // 进度：50% - 加密完成
      set({ uploadProgress: 50 });

      // 从加密内容创建 Blob
      const blob = new Blob([encrypted.encryptedContent]);

      // 携带元数据上传
      await apiService.uploadDocument(blob, {
        encrypted_name: encrypted.encryptedName,
        name_nonce: encrypted.nameNonce,
        content_nonce: encrypted.contentNonce,
        encrypted_key: encrypted.encryptedKey,
        mime_type: file.type || 'application/octet-stream',
      });

      // 进度：100% - 上传完成
      set({ uploadProgress: 100 });

      // 重新加载文档列表
      await get().loadDocuments(get().page);

      set({ loading: false, uploadProgress: 0 });
    } catch (error) {
      console.error('Failed to upload document:', error);
      set({
        error: getErrorMessage(error, '文件上传失败'),
        loading: false,
        uploadProgress: 0,
      });
      throw error;
    }
  },

  // 下载并解密文档
  downloadDocument: async (id: string) => {
    try {
      const crypto = new CryptoService();
      const privateKey = useAuthStore.getState().privateKey;

      if (!privateKey) {
        throw new Error('No private key available. Please login again.');
      }

      // 获取文档详情（包含 加密密钥）
      const detailResponse = await apiService.getDocumentDetail(id);
      const detail = detailResponse.data.data;

      // 下载加密内容
      const contentResponse = await apiService.downloadDocument(id);
      const encryptedContent = contentResponse.data;

      // 提取文档元数据（含 内容 nonce）
      const document = detail.document;

      // 检查 content_nonce 是否存在（旧文件可能没有）
      if (!document.content_nonce || document.content_nonce.trim() === '') {
        throw new Error(
          '该文件缺少解密所需的元数据（content_nonce）。' +
          '这可能是在系统升级前上传的文件。' +
          '请删除此文件并重新上传。'
        );
      }

      // 解密文档
      const decrypted = await crypto.decryptDocument(
        encryptedContent,
        document.encrypted_name,
        document.name_nonce,
        document.content_nonce,
        detail.encrypted_key,
        privateKey
      );

      // 触发浏览器下载
      const blob = new Blob([decrypted.content]);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = decrypted.fileName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download document:', error);

      // 处理错误消息（arraybuffer 响应需特殊处理）
      let errorMessage = '文件下载失败';
      if (isAxiosError(error) && error.response?.data) {
        // 若 responseType 为 arraybuffer，error.response.data 可能是 ArrayBuffer
        if (error.response.data instanceof ArrayBuffer) {
          try {
            const text = new TextDecoder().decode(error.response.data);
            const json = JSON.parse(text) as { error?: { message?: string }; message?: string };
            errorMessage = json.error?.message || json.message || errorMessage;
          } catch {
            // 解析失败，使用默认消息
          }
        } else {
          const data = error.response.data as { error?: { message?: string }; message?: string };
          if (data.error?.message) {
            errorMessage = data.error.message;
          } else if (data.message) {
            errorMessage = data.message;
          }
        }
      } else if (error instanceof Error && error.message) {
        errorMessage = error.message;
      }

      set({ error: errorMessage });
      throw error;
    }
  },

  // 删除文档
  deleteDocument: async (id: string) => {
    try {
      await apiService.deleteDocument(id);

      // 重新加载文档列表
      await get().loadDocuments(get().page);
    } catch (error) {
      console.error('Failed to delete document:', error);
      set({
        error: getErrorMessage(error, '文件删除失败'),
      });
      throw error;
    }
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));
