//! Authentication types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Token pair returned after successful authentication
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPair {
    /// JWT access token
    pub access_token: String,
    /// JWT refresh token
    pub refresh_token: String,
    /// Access token expiration time
    pub access_expires_at: DateTime<Utc>,
    /// Refresh token expiration time
    pub refresh_expires_at: DateTime<Utc>,
    /// Token type (always "Bearer")
    pub token_type: String,
}

impl TokenPair {
    pub fn new(
        access_token: String,
        refresh_token: String,
        access_expires_at: DateTime<Utc>,
        refresh_expires_at: DateTime<Utc>,
    ) -> Self {
        Self {
            access_token,
            refresh_token,
            access_expires_at,
            refresh_expires_at,
            token_type: "Bearer".to_string(),
        }
    }
}

/// User information extracted from valid token
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticatedUser {
    /// User ID
    pub id: Uuid,
    /// User email
    pub email: String,
    /// Token ID (jti)
    pub token_id: String,
}

/// Session information stored in Redis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    /// Session ID
    pub id: String,
    /// User ID
    pub user_id: Uuid,
    /// Current refresh token ID (jti)
    pub refresh_token_id: String,
    /// Token family for replay detection
    pub token_family: String,
    /// Client IP address
    pub ip_address: String,
    /// Client user agent
    pub user_agent: String,
    /// Session creation time
    pub created_at: DateTime<Utc>,
    /// Last activity time
    pub last_active_at: DateTime<Utc>,
}

impl Session {
    pub fn new(
        user_id: Uuid,
        token_family: String,
        refresh_token_id: String,
        ip_address: String,
        user_agent: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            user_id,
            refresh_token_id,
            token_family,
            ip_address,
            user_agent,
            created_at: now,
            last_active_at: now,
        }
    }
}

/// Password validation result
#[derive(Debug, Clone)]
pub struct PasswordValidation {
    /// Whether the password meets all requirements
    pub is_valid: bool,
    /// List of validation errors (empty if valid)
    pub errors: Vec<PasswordError>,
}

/// Password validation error types
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PasswordError {
    /// Password is too short
    TooShort { min: usize, actual: usize },
    /// Missing uppercase letter
    MissingUppercase,
    /// Missing lowercase letter
    MissingLowercase,
    /// Missing digit
    MissingDigit,
}

impl std::fmt::Display for PasswordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PasswordError::TooShort { min, actual } => {
                write!(
                    f,
                    "Password must be at least {} characters (got {})",
                    min, actual
                )
            }
            PasswordError::MissingUppercase => {
                write!(f, "Password must contain at least one uppercase letter")
            }
            PasswordError::MissingLowercase => {
                write!(f, "Password must contain at least one lowercase letter")
            }
            PasswordError::MissingDigit => {
                write!(f, "Password must contain at least one digit")
            }
        }
    }
}

impl PasswordValidation {
    /// Get all error messages as a single string
    pub fn error_message(&self) -> String {
        self.errors
            .iter()
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
            .join("; ")
    }
}
