// API 服务：与后端通信的 HTTP 客户端
// 处理认证、文档和分享相关接口

import axios, { type AxiosInstance, AxiosError } from 'axios';
import type { RegisterRequest, LoginResponse } from '../types/auth';
import type {
  DocumentListResponse,
  DocumentDetailResponse,
  CreateShareRequest,
  UploadMetadata,
  ShareLink,
} from '../types/document';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器：添加 JWT 令牌
    this.client.interceptors.request.use((config) => {
      const token = sessionStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // 响应拦截器：处理令牌刷新
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config;

        // 处理 401 未授权
        if (error.response?.status === 401 && originalRequest) {
          // 尝试刷新令牌
          const refreshToken = sessionStorage.getItem('refreshToken');
          if (refreshToken) {
            try {
              const response = await this.refreshToken(refreshToken);
              const { access_token, refresh_token } = response.data.data;

              // 更新令牌
              sessionStorage.setItem('accessToken', access_token);
              sessionStorage.setItem('refreshToken', refresh_token);

              // 使用新令牌重试原请求
              originalRequest.headers.Authorization = `Bearer ${access_token}`;
              return this.client.request(originalRequest);
            } catch {
              // 刷新失败，清除令牌并跳转到登录页
              sessionStorage.removeItem('accessToken');
              sessionStorage.removeItem('refreshToken');
              window.location.href = '/login';
            }
          } else {
            // 无刷新令牌，跳转到登录页
            window.location.href = '/login';
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // ===== 认证 API =====

  /**
   * 注册新用户
   */
  async register(data: RegisterRequest) {
    return this.client.post<{ success: boolean; data: { user: LoginResponse['user'] } }>(
      '/auth/register',
      data
    );
  }

  /**
   * 使用邮箱和密码登录
   */
  async login(email: string, password: string) {
    return this.client.post<{ success: boolean; data: LoginResponse }>(
      '/auth/login',
      { email, password }
    );
  }

  /**
   * 刷新访问令牌
   */
  async refreshToken(refreshToken: string) {
    return this.client.post<{
      success: boolean;
      data: { access_token: string; refresh_token: string };
    }>('/auth/refresh', { refresh_token: refreshToken });
  }

  /**
   * 注销当前用户
   */
  async logout() {
    return this.client.post('/auth/logout');
  }

  /**
   * 获取当前用户信息
   */
  async getMe() {
    return this.client.get<{ success: boolean; data: { user: LoginResponse['user'] } }>('/auth/me');
  }

  /**
   * 通过邮箱获取用户公钥
   */
  async getUserPublicKey(email: string) {
    return this.client.get<{
      success: boolean;
      data: { user_id: string; email: string; public_key: string };
    }>(`/auth/users/${encodeURIComponent(email)}/public-key`);
  }

  // ===== 文档 API =====

  /**
   * 获取文档分页列表
   */
  async getDocuments(params?: { page?: number; page_size?: number }) {
    return this.client.get<{ success: boolean; data: DocumentListResponse }>(
      '/documents',
      { params }
    );
  }

  /**
   * 上传加密文档
   */
  async uploadDocument(file: Blob, metadata: UploadMetadata) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));

    return this.client.post<{ success: boolean; data: DocumentDetailResponse['document'] }>(
      '/documents',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
  }

  /**
   * 获取文档详情（包含 encrypted_key）
   */
  async getDocumentDetail(id: string) {
    return this.client.get<{ success: boolean; data: DocumentDetailResponse }>(
      `/documents/${id}`
    );
  }

  /**
   * 下载加密文档内容
   */
  async downloadDocument(id: string) {
    return this.client.get(`/documents/${id}/download`, {
      responseType: 'arraybuffer',
    });
  }

  /**
   * 删除文档
   */
  async deleteDocument(id: string) {
    return this.client.delete(`/documents/${id}`);
  }

  /**
   * 更新文档元数据
   */
  async updateDocument(
    docId: string,
    data: {
      encrypted_name?: string;
      name_nonce?: string;
      content_nonce?: string;
      storage_path?: string;
      size?: number;
      expected_version?: number;
      lock_id?: string;
    }
  ) {
    return this.client.patch<{
      success: boolean;
      data: {
        id: string;
        encrypted_name: string;
        name_nonce: string;
        content_nonce: string;
        mime_type: string;
        size: number;
        storage_path: string;
        owner_id: string;
        created_at: string;
        updated_at: string;
      };
    }>(`/documents/${docId}`, data);
  }

  /**
   * 授予其他用户权限
   */
  async grantPermission(
    docId: string,
    data: { user_email: string; permission_level: string; encrypted_key: string }
  ) {
    return this.client.post(`/documents/${docId}/permissions`, data);
  }

  /**
   * 撤销用户权限
   */
  async revokePermission(docId: string, userId: string) {
    return this.client.delete(`/documents/${docId}/permissions/${userId}`);
  }

  /**
   * 获取文档权限列表（有访问权限的用户列表）
   */
  async getDocumentPermissions(docId: string) {
    return this.client.get<{
      success: boolean;
      data: Array<{
        user_id: string;
        user_email: string;
        permission_level: string;
        granted_at: string;
      }>;
    }>(`/documents/${docId}/permissions`);
  }

  // ===== 文档锁 API =====

  /**
   * 获取文档编辑锁
   */
  async acquireLock(docId: string) {
    return this.client.get<{
      success: boolean;
      data: {
        locked: boolean;
        lock_id?: string;
        version?: number;
        locked_by?: string;
        locked_at?: string;
      };
    }>(`/documents/${docId}/lock`);
  }

  /**
   * 续期锁的 TTL（心跳）
   */
  async extendLock(docId: string, lockId: string) {
    return this.client.post(`/documents/${docId}/lock/heartbeat`, {
      lock_id: lockId,
    });
  }

  /**
   * 释放编辑锁
   */
  async releaseLock(docId: string, lockId: string) {
    return this.client.delete(`/documents/${docId}/lock`, {
      data: { lock_id: lockId },
    });
  }

  // ===== 存储 API =====

  /**
   * 上传文件到存储
   */
  async uploadFile(file: Blob, fileName?: string) {
    const formData = new FormData();
    formData.append('file', file, fileName || 'encrypted');

    // 移除 Content-Type 请求头，让 Axios 自动设置（含 boundary 参数）
    return this.client.post<{
      success: boolean;
      data: { storage_path: string };
    }>('/storage/upload', formData, {
      headers: {
        'Content-Type': undefined,
      },
    });
  }

  // ===== 分享 API =====

  /**
   * 创建分享链接
   */
  async createShare(data: CreateShareRequest) {
    return this.client.post<{ success: boolean; data: ShareLink }>('/shares', data);
  }

  /**
   * 访问分享链接（公开访问，无需认证）
   */
  async accessShare(token: string) {
    return this.client.get<{
      success: boolean;
      data: {
        document_id: string;
        encrypted_key: string;
        encrypted_name: string;
        name_nonce: string;
        content_nonce: string;
        size: number;
        mime_type: string;
      };
    }>(`/shares/access/${token}`);
  }

}

// 导出单例
export const apiService = new ApiService();
