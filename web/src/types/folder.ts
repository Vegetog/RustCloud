// 文件夹相关的 TypeScript 类型定义

export interface Folder {
  id: string;
  owner_id: string;
  parent_id: string | null;
  /** RSA-OAEP 加密的文件夹名（Base64） */
  encrypted_name: string;
  /** 客户端解密后的明文名 */
  decrypted_name?: string;
  permission_level: 'owner' | 'write' | 'read';
  created_at: string;
  updated_at: string;
}

export interface FolderListResponse {
  folders: Folder[];
  total_folders: number;
}

export interface FolderDetailResponse {
  folder: Folder;
}

export interface CreateFolderRequest {
  encrypted_name: string;
  parent_id?: string;
}
