// API Service: HTTP client for backend communication
// Handles authentication, documents, and shares endpoints

import axios, { type AxiosInstance, AxiosError } from 'axios';
import type { RegisterRequest, LoginResponse } from '../types/auth';
import type { DocumentListResponse, DocumentDetailResponse, CreateShareRequest } from '../types/document';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor: Add JWT token
    this.client.interceptors.request.use((config) => {
      const token = sessionStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log('[API] Request with token:', config.method?.toUpperCase(), config.url);
      } else {
        console.warn('[API] Request WITHOUT token:', config.method?.toUpperCase(), config.url);
      }
      return config;
    });

    // Response interceptor: Handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config;

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && originalRequest) {
          // Try to refresh token
          const refreshToken = sessionStorage.getItem('refreshToken');
          if (refreshToken) {
            try {
              const response = await this.refreshToken(refreshToken);
              const { access_token, refresh_token } = response.data.data;

              // Update tokens
              sessionStorage.setItem('accessToken', access_token);
              sessionStorage.setItem('refreshToken', refresh_token);

              // Retry original request with new token
              originalRequest.headers.Authorization = `Bearer ${access_token}`;
              return this.client.request(originalRequest);
            } catch (refreshError) {
              // Refresh failed, clear tokens and redirect to login
              sessionStorage.removeItem('accessToken');
              sessionStorage.removeItem('refreshToken');
              window.location.href = '/login';
            }
          } else {
            // No refresh token, redirect to login
            window.location.href = '/login';
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // ===== Authentication API =====

  /**
   * Register a new user
   */
  async register(data: RegisterRequest) {
    return this.client.post<{ success: boolean; data: { user: any } }>(
      '/auth/register',
      data
    );
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string) {
    return this.client.post<{ success: boolean; data: LoginResponse }>(
      '/auth/login',
      { email, password }
    );
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string) {
    return this.client.post<{
      success: boolean;
      data: { access_token: string; refresh_token: string };
    }>('/auth/refresh', { refresh_token: refreshToken });
  }

  /**
   * Logout current user
   */
  async logout() {
    return this.client.post('/auth/logout');
  }

  /**
   * Get current user info
   */
  async getMe() {
    return this.client.get<{ success: boolean; data: { user: any } }>('/auth/me');
  }

  // ===== Documents API =====

  /**
   * Get paginated list of documents
   */
  async getDocuments(params?: { page?: number; pageSize?: number }) {
    return this.client.get<{ success: boolean; data: DocumentListResponse }>(
      '/documents',
      { params }
    );
  }

  /**
   * Upload encrypted document
   */
  async uploadDocument(file: Blob, metadata: any) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));

    return this.client.post<{ success: boolean; data: any }>(
      '/documents',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
  }

  /**
   * Get document details (includes encrypted_key)
   */
  async getDocumentDetail(id: string) {
    return this.client.get<{ success: boolean; data: DocumentDetailResponse }>(
      `/documents/${id}`
    );
  }

  /**
   * Download encrypted document content
   */
  async downloadDocument(id: string) {
    return this.client.get(`/documents/${id}/download`, {
      responseType: 'arraybuffer',
    });
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string) {
    return this.client.delete(`/documents/${id}`);
  }

  /**
   * Grant permission to another user
   */
  async grantPermission(
    docId: string,
    data: { user_email: string; permission_level: string; encrypted_key: string }
  ) {
    return this.client.post(`/documents/${docId}/permissions`, data);
  }

  /**
   * Revoke permission from a user
   */
  async revokePermission(docId: string, userId: string) {
    return this.client.delete(`/documents/${docId}/permissions/${userId}`);
  }

  // ===== Shares API =====

  /**
   * Create a share link
   */
  async createShare(data: CreateShareRequest) {
    return this.client.post<{ success: boolean; data: any }>('/shares', data);
  }

  /**
   * Get all share links for current user
   */
  async getShares() {
    return this.client.get<{ success: boolean; data: any[] }>('/shares');
  }

  /**
   * Access a share link (public, no auth required)
   */
  async accessShare(token: string, password?: string) {
    return this.client.get<{ success: boolean; data: any }>(`/shares/access/${token}`, {
      params: password ? { password } : undefined,
    });
  }

  /**
   * Delete a share link
   */
  async deleteShare(id: string) {
    return this.client.delete(`/shares/${id}`);
  }
}

// Export singleton instance
export const apiService = new ApiService();
