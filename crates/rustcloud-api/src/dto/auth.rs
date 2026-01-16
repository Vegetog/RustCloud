//! Authentication DTOs

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ===== Requests =====

/// User registration request
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

/// User login request
#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 1, message = "Password is required"))]
    pub password: String,
}

/// Token refresh request
#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

/// Password change request
#[derive(Debug, Deserialize, Validate)]
pub struct ChangePasswordRequest {
    #[validate(length(min = 1, message = "Current password is required"))]
    pub current_password: String,

    #[validate(length(min = 8, message = "New password must be at least 8 characters"))]
    pub new_password: String,

    #[validate(length(min = 1, message = "Public key is required"))]
    pub public_key: String,

    #[validate(length(min = 1, message = "Encrypted private key is required"))]
    pub encrypted_private_key: String,

    #[validate(length(min = 1, message = "Private key nonce is required"))]
    pub private_key_nonce: String,

    #[validate(length(min = 1, message = "Salt is required"))]
    pub salt: String,
}

// ===== Responses =====

/// User information response
#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub public_key: String,
    pub created_at: DateTime<Utc>,
}

/// Registration response
#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    pub user: UserResponse,
}

/// Login response
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub token_type: String,
    pub user: UserResponse,
    /// Encrypted private key for client-side decryption
    pub encrypted_private_key: String,
    pub private_key_nonce: String,
    pub salt: String,
}

/// Token refresh response
#[derive(Debug, Serialize)]
pub struct RefreshResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub token_type: String,
}

/// Current user response (for GET /me)
#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub user: UserResponse,
}
