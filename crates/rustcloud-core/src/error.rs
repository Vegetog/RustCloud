//! RustCloud 错误类型定义

use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    // 认证错误
    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("Token expired")]
    TokenExpired,

    #[error("Invalid token")]
    InvalidToken,

    #[error("Unauthorized")]
    Unauthorized,

    // 用户错误
    #[error("User not found")]
    UserNotFound,

    #[error("User already exists")]
    UserAlreadyExists,

    #[error("Invalid password: {0}")]
    InvalidPassword(String),

    // 文档错误
    #[error("Document not found")]
    DocumentNotFound,

    #[error("Document access denied")]
    DocumentAccessDenied,

    // 分享链接错误
    #[error("Share link not found")]
    ShareLinkNotFound,

    #[error("Share link expired")]
    ShareLinkExpired,

    #[error("Invalid share password")]
    InvalidSharePassword,

    // 加密错误
    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Key derivation failed: {0}")]
    KeyDerivationFailed(String),

    // 存储错误
    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("File not found")]
    FileNotFound,

    // 数据库错误
    #[error("数据库错误: {0}")]
    DatabaseError(String),

    // 校验错误
    #[error("校验错误: {0}")]
    ValidationError(String),

    // 配置错误
    #[error("配置 error: {0}")]
    ConfigError(String),

    // 请求频率限制
    #[error("Too many requests")]
    RateLimitExceeded,

    // 内部错误
    #[error("Internal error: {0}")]
    Internal(String),
}

impl Error {
    pub fn status_code(&self) -> u16 {
        match self {
            Error::InvalidCredentials | Error::InvalidPassword(_) | Error::InvalidSharePassword => {
                400
            }
            Error::TokenExpired | Error::InvalidToken | Error::Unauthorized => 401,
            Error::DocumentAccessDenied => 403,
            Error::UserNotFound
            | Error::DocumentNotFound
            | Error::ShareLinkNotFound
            | Error::FileNotFound => 404,
            Error::UserAlreadyExists => 409,
            Error::ShareLinkExpired => 410,
            Error::RateLimitExceeded => 429,
            _ => 500,
        }
    }
}
