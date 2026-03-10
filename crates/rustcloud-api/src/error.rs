//! API 错误类型与转换

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use rustcloud_core::Error as CoreError;

/// API 错误响应体
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub success: bool,
    pub error: ErrorDetail,
}

/// 错误详情结构
#[derive(Debug, Serialize)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
}

/// API 错误类型
#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: String,
    pub message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            status,
            code: code.into(),
            message: message.into(),
        }
    }

    // ===== 便捷构造函数 =====

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "AUTH_UNAUTHORIZED", message)
    }

    pub fn invalid_token() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "AUTH_INVALID_TOKEN", "Invalid token")
    }

    pub fn token_expired() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "AUTH_TOKEN_EXPIRED", "Token has expired")
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "AUTH_FORBIDDEN", message)
    }

    pub fn not_found(resource: &str) -> Self {
        Self::new(StatusCode::NOT_FOUND, "NOT_FOUND", format!("{} not found", resource))
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, "CONFLICT", message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", message)
    }

    pub fn rate_limited() -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many requests")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ErrorResponse {
            success: false,
            error: ErrorDetail {
                code: self.code,
                message: self.message,
            },
        };
        (self.status, Json(body)).into_response()
    }
}

/// 从 rustcloud_core::Error 转换
impl From<CoreError> for ApiError {
    fn from(error: CoreError) -> Self {
        match error {
            CoreError::InvalidCredentials => {
                Self::new(StatusCode::BAD_REQUEST, "AUTH_INVALID_CREDENTIALS", "Invalid credentials")
            }
            CoreError::TokenExpired => Self::token_expired(),
            CoreError::InvalidToken => Self::invalid_token(),
            CoreError::Unauthorized => Self::unauthorized("Unauthorized"),
            CoreError::UserNotFound => Self::not_found("User"),
            CoreError::UserAlreadyExists => Self::conflict("User already exists"),
            CoreError::InvalidPassword(msg) => Self::bad_request(msg),
            CoreError::DocumentNotFound => Self::not_found("Document"),
            CoreError::DocumentAccessDenied => Self::forbidden("Document access denied"),
            CoreError::ShareLinkNotFound => Self::not_found("Share link"),
            CoreError::ShareLinkExpired => {
                Self::new(StatusCode::GONE, "SHARE_EXPIRED", "Share link has expired")
            }
            CoreError::RateLimitExceeded => Self::rate_limited(),
            CoreError::ValidationError(msg) => Self::bad_request(msg),
            CoreError::DatabaseError(msg) => {
                tracing::error!("数据库错误: {}", msg);
                Self::internal("数据库错误")
            }
            CoreError::StorageError(msg) => {
                tracing::error!("Storage error: {}", msg);
                Self::internal("Storage error")
            }
            CoreError::EncryptionFailed(msg) => {
                tracing::error!("Encryption failed: {}", msg);
                Self::internal("Encryption error")
            }
            CoreError::DecryptionFailed(msg) => {
                tracing::error!("Decryption failed: {}", msg);
                Self::internal("Decryption error")
            }
            _ => {
                tracing::error!("Internal error: {:?}", error);
                Self::internal("Internal server error")
            }
        }
    }
}

/// 从数据库错误转换
impl From<rustcloud_database::DatabaseError> for ApiError {
    fn from(error: rustcloud_database::DatabaseError) -> Self {
        let core_error: CoreError = error.into();
        core_error.into()
    }
}

/// 从 Redis 错误转换
impl From<redis::RedisError> for ApiError {
    fn from(error: redis::RedisError) -> Self {
        tracing::error!("Redis error: {}", error);
        Self::internal("Session service error")
    }
}
