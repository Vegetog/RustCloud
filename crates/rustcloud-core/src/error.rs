//! Error types for RustCloud

use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    // Authentication errors
    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("Token expired")]
    TokenExpired,

    #[error("Invalid token")]
    InvalidToken,

    #[error("Unauthorized")]
    Unauthorized,

    // User errors
    #[error("User not found")]
    UserNotFound,

    #[error("User already exists")]
    UserAlreadyExists,

    #[error("Invalid password: {0}")]
    InvalidPassword(String),

    // Document errors
    #[error("Document not found")]
    DocumentNotFound,

    #[error("Document access denied")]
    DocumentAccessDenied,

    // Share errors
    #[error("Share link not found")]
    ShareLinkNotFound,

    #[error("Share link expired")]
    ShareLinkExpired,

    #[error("Invalid share password")]
    InvalidSharePassword,

    // Cryptographic errors
    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Key derivation failed: {0}")]
    KeyDerivationFailed(String),

    // Storage errors
    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("File not found")]
    FileNotFound,

    // Database errors
    #[error("Database error: {0}")]
    DatabaseError(String),

    // Validation errors
    #[error("Validation error: {0}")]
    ValidationError(String),

    // Configuration errors
    #[error("Configuration error: {0}")]
    ConfigError(String),

    // Rate limiting
    #[error("Too many requests")]
    RateLimitExceeded,

    // Internal errors
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
