// Authentication-related TypeScript type definitions

export interface User {
  id: string;
  email: string;
  public_key: string; // base64 (注意: API返回的是snake_case)
  created_at: string;
}

export interface LoginResponse {
  access_token: string; // 注意: API返回的是snake_case
  refresh_token: string;
  expires_in: number;
  user: User;
  salt: string; // base64
  encrypted_private_key: string; // base64
  private_key_nonce: string; // base64
}

export interface RegisterRequest {
  email: string;
  password: string;
  salt: string;
  public_key: string; // 注意: API期望的是snake_case
  encrypted_private_key: string;
  private_key_nonce: string;
}
