//! Share DTOs

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ===== Requests =====

/// Create share link request
#[derive(Debug, Deserialize, Validate)]
pub struct CreateShareRequest {
    pub document_id: Uuid,

    #[validate(length(min = 1, message = "Encrypted key is required"))]
    pub encrypted_key: String,

    /// Optional password for the share link
    pub password: Option<String>,

    /// Optional expiration time in seconds from now
    pub expires_in: Option<i64>,

    /// Optional maximum access count
    pub max_access_count: Option<i32>,
}

/// Access share with password request
#[derive(Debug, Deserialize)]
pub struct AccessShareRequest {
    pub password: Option<String>,
}

// ===== Responses =====

/// Share link response
#[derive(Debug, Serialize)]
pub struct ShareLinkResponse {
    pub id: Uuid,
    pub document_id: Uuid,
    pub access_token: String,
    pub has_password: bool,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_access_count: Option<i32>,
    pub access_count: i32,
    pub created_at: DateTime<Utc>,
}

/// Share list response
#[derive(Debug, Serialize)]
pub struct ShareListResponse {
    pub shares: Vec<ShareLinkResponse>,
}

/// Access share response (for anonymous access)
#[derive(Debug, Serialize)]
pub struct AccessShareResponse {
    pub document_id: Uuid,
    pub encrypted_key: String,
    pub encrypted_name: String,
    pub name_nonce: String,
    pub content_hash: String,
    pub size: i64,
    pub mime_type: String,
}
