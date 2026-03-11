// 身份相关的 TypeScript 类型定义

export interface Identity {
  id: string;
  name: string;
  description?: string;
  creator_id: string;
  user_count: number;
  created_at: string;
  updated_at: string;
}

export interface IdentityListResponse {
  identities: Identity[];
}

export interface IdentityUser {
  user_id: string;
  user_email: string;
  assigned_at: string;
}

export interface IdentityDetailResponse {
  identity: Identity;
  users: IdentityUser[];
}

export interface CreateIdentityRequest {
  name: string;
  description?: string;
}

export interface UpdateIdentityRequest {
  name?: string;
  description?: string | null;
}

export interface BatchAddUsersRequest {
  user_emails: string[];
}

export interface BatchRemoveUsersRequest {
  user_emails: string[];
}

export interface BatchOperationResponse {
  success_count: number;
  failed_emails: string[];
}
