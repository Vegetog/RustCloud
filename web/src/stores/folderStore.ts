// 文件夹状态仓库：管理当前文件夹、子文件夹列表和面包屑

import { create } from 'zustand';
import type { Folder } from '../types/folder';
import { apiService } from '../services/api';
import { CryptoService } from '../services/crypto';
import { useAuthStore } from './authStore';
import { getErrorMessage } from '../utils/format';

interface FolderState {
  // 当前目录下的文件夹列表
  folders: Folder[];
  // 当前所在文件夹（null = 根目录）
  currentFolder: Folder | null;
  // 从根到当前文件夹的父级列表（不含 currentFolder 本身）
  ancestors: Folder[];
  loading: boolean;
  error: string | null;

  // 加载指定父目录的子文件夹
  loadFolders: (parentId?: string | null) => Promise<void>;
  // 加载当前文件夹详情及完整祖先链（用于面包屑）
  loadCurrentFolder: (folderId: string) => Promise<void>;
  // 创建文件夹
  createFolder: (name: string, parentId?: string | null) => Promise<void>;
  // 删除文件夹
  deleteFolder: (id: string, parentId?: string | null) => Promise<void>;
  // 清除错误
  clearError: () => void;
  // 重置（离开文件夹时）
  reset: () => void;
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  currentFolder: null,
  ancestors: [],
  loading: false,
  error: null,

  loadFolders: async (parentId = null) => {
    set({ loading: true, error: null });
    try {
      const response = await apiService.getFolders(parentId);
      const data = response.data.data;

      const privateKey = useAuthStore.getState().privateKey;
      const crypto = new CryptoService();

      // 解密文件夹名
      const folders = await Promise.all(
        data.folders.map(async (folder: Folder) => {
          if (!privateKey) return folder;
          try {
            const decrypted_name = await crypto.rsaDecryptFolderName(
              folder.encrypted_name,
              privateKey
            );
            return { ...folder, decrypted_name };
          } catch {
            return folder;
          }
        })
      );

      set({ folders, loading: false });
    } catch (error) {
      console.error('Failed to load folders:', error);
      set({ error: getErrorMessage(error, '加载文件夹列表失败'), loading: false });
    }
  },

  loadCurrentFolder: async (folderId: string) => {
    // 立即清空，避免显示旧数据
    set({ currentFolder: null, ancestors: [] });
    try {
      const privateKey = useAuthStore.getState().privateKey;
      const crypto = new CryptoService();

      /** 获取单个文件夹并解密名称 */
      const fetchAndDecrypt = async (id: string): Promise<Folder> => {
        const response = await apiService.getFolderDetail(id);
        const folder = response.data.data.folder;
        if (privateKey) {
          try {
            const decrypted_name = await crypto.rsaDecryptFolderName(
              folder.encrypted_name,
              privateKey
            );
            return { ...folder, decrypted_name };
          } catch {
            // 解密失败，返回原始数据
          }
        }
        return folder;
      };

      // 获取当前文件夹
      const current = await fetchAndDecrypt(folderId);

      // 沿 parent_id 向上追溯，构建祖先链（从根到父级）
      const ancestors: Folder[] = [];
      let parentId = current.parent_id;
      while (parentId) {
        const ancestor = await fetchAndDecrypt(parentId);
        ancestors.unshift(ancestor); // 前插保持根→父的顺序
        parentId = ancestor.parent_id;
      }

      set({ currentFolder: current, ancestors });
    } catch (error) {
      console.error('Failed to load current folder:', error);
      set({ currentFolder: null, ancestors: [] });
    }
  },

  createFolder: async (name: string, parentId?: string | null) => {
    set({ loading: true, error: null });
    try {
      const publicKey = useAuthStore.getState().publicKey;
      if (!publicKey) throw new Error('No public key available. Please login again.');

      const crypto = new CryptoService();
      const encrypted_name = await crypto.rsaEncryptFolderName(name, publicKey);

      await apiService.createFolder({
        encrypted_name,
        parent_id: parentId ?? undefined,
      });

      // 重新加载当前目录
      await get().loadFolders(parentId);
    } catch (error) {
      console.error('Failed to create folder:', error);
      set({ error: getErrorMessage(error, '创建文件夹失败'), loading: false });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  deleteFolder: async (id: string, parentId?: string | null) => {
    try {
      await apiService.deleteFolder(id);
      // 重新加载当前目录
      await get().loadFolders(parentId);
    } catch (error) {
      console.error('Failed to delete folder:', error);
      set({ error: getErrorMessage(error, '删除文件夹失败') });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({ folders: [], currentFolder: null, ancestors: [], error: null }),
}));
