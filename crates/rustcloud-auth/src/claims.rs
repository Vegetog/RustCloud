//! JWT token claims definitions

use serde::{Deserialize, Serialize};

/// Claims for Access Token (short-lived, ~1 hour)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    /// Subject - user ID (UUID string)
    pub sub: String,
    /// User email
    pub email: String,
    /// Expiration time (Unix timestamp)
    pub exp: i64,
    /// Issued at (Unix timestamp)
    pub iat: i64,
    /// JWT ID - unique token identifier for revocation
    pub jti: String,
}

/// Claims for Refresh Token (long-lived, ~7 days)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshTokenClaims {
    /// Subject - user ID (UUID string)
    pub sub: String,
    /// Expiration time (Unix timestamp)
    pub exp: i64,
    /// Issued at (Unix timestamp)
    pub iat: i64,
    /// JWT ID - unique token identifier
    pub jti: String,
    /// Token family ID - for replay detection
    pub family: String,
}
