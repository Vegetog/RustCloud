//! 认证 DTO

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ===== 请求 =====

/// 用户注册请求
#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,

    #[validate(length(min = 1, message = "Public key is required"))]
    pub public_key: String,

    #[validate(length(min = 1, message = "Encrypted private key is required"))]
    pub encrypted_private_key: String,

    #[validate(length(min = 1, message = "Private key nonce is required"))]
    pub private_key_nonce: String,

    #[validate(length(min = 1, message = "Salt is required"))]
    pub salt: String,
}

/// 用户登录请求
#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 1, message = "Password is required"))]
    pub password: String,
}

/// 令牌刷新请求
#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

// ===== 响应 =====

/// 用户信息响应
#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub public_key: String,
    pub created_at: DateTime<Utc>,
}

/// 注册响应
#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    pub user: UserResponse,
}

/// 登录响应
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub token_type: String,
    pub user: UserResponse,
    /// 用于客户端解密的加密私钥
    pub encrypted_private_key: String,
    pub private_key_nonce: String,
    pub salt: String,
}

/// 令牌刷新响应
#[derive(Debug, Serialize)]
pub struct RefreshResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub token_type: String,
}

/// 当前用户响应（用于 GET /me）
#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub user: UserResponse,
}

/// 公钥响应（用于 GET /users/:email/public-key）
#[derive(Debug, Serialize)]
pub struct PublicKeyResponse {
    pub user_id: Uuid,
    pub email: String,
    pub public_key: String,
}
