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

// ===== 文件夹快照（分享前的重加密数据源） =====

export interface FolderSnapshotItem {
  id: string;
  parent_id: string | null;
  /** 用 owner 公钥 RSA-OAEP 加密的文件夹名 */
  encrypted_name: string;
}

export interface DocumentSnapshotItem {
  id: string;
  folder_id: string | null;
  /** 用 owner 公钥 RSA-OAEP 加密的 DEK */
  encrypted_key: string;
}

export interface FolderSnapshotResponse {
  root_folder_id: string;
  folders: FolderSnapshotItem[];
  documents: DocumentSnapshotItem[];
}

// ===== 文件夹分享请求 =====

export interface ShareFolderKeyEntry {
  folder_id: string;
  /** 用目标用户公钥重加密的文件夹名 */
  encrypted_name: string;
}

export interface ShareDocumentKeyEntry {
  document_id: string;
  /** 用目标用户公钥重加密的 DEK */
  encrypted_key: string;
}

export interface ShareFolderRequest {
  target_email: string;
  permission_level: 'read' | 'write';
  folder_keys: ShareFolderKeyEntry[];
  document_keys: ShareDocumentKeyEntry[];
}
