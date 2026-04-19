// 文档相关的 TypeScript 类型定义

export interface Document {
  id: string;
  encrypted_name: string; // 注意: API返回的是snake_case
  name_nonce: string;
  content_nonce: string;
  size: number;
  mime_type: string;
  folder_id?: string | null;
  permission_level: 'owner' | 'write' | 'read';
  encrypted_key?: string;
  decrypted_name?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
  page: number;
  page_size: number; // 注意: API返回的是snake_case
  total_pages: number;
}

export interface DocumentDetailResponse {
  document: Document;
  encrypted_key: string; // base64，RSA 加密的文档密钥
}

export interface UploadMetadata {
  encrypted_name: string;
  name_nonce: string;
  content_nonce: string;
  encrypted_key: string;
  mime_type: string;
  folder_id?: string | null;
}

export interface ShareLink {
  id: string;
  document_id: string;
  access_token: string;
  encrypted_key: string;
  expires_at: string | null;
  max_access_count: number | null;
  access_count: number;
  created_at: string;
}

export interface CreateShareRequest {
  document_id: string;
  encrypted_key: string;
  expires_in?: number | null;
  max_access_count?: number | null;
}
