//! Document DTOs

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ===== Requests =====

/// Document metadata for upload (extracted from multipart form)
#[derive(Debug, Deserialize, Validate)]
pub struct UploadMetadata {
    #[validate(length(min = 1, message = "Encrypted name is required"))]
    pub encrypted_name: String,

    #[validate(length(min = 1, message = "Name nonce is required"))]
    pub name_nonce: String,

    #[validate(length(min = 1, message = "Content nonce is required"))]
    pub content_nonce: String,

    #[validate(length(min = 1, message = "Content hash is required"))]
    pub content_hash: String,

    #[validate(length(min = 1, message = "Encrypted key is required"))]
    pub encrypted_key: String,

    pub mime_type: Option<String>,
}

/// Document list query parameters
#[derive(Debug, Deserialize, Default)]
pub struct DocumentListQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

/// Grant permission request
#[derive(Debug, Deserialize, Validate)]
pub struct GrantPermissionRequest {
    #[validate(email(message = "Invalid email format"))]
    pub user_email: String,

    #[validate(length(min = 1, message = "Encrypted key is required"))]
    pub encrypted_key: String,

    /// Permission level: "read" or "write"
    #[validate(length(min = 1, message = "Permission level is required"))]
    pub permission_level: String,
}

// ===== Responses =====

/// Document response
#[derive(Debug, Serialize)]
pub struct DocumentResponse {
    pub id: Uuid,
    pub encrypted_name: String,
    pub name_nonce: String,
    pub content_nonce: String,
    pub size: i64,
    pub mime_type: String,
    pub content_hash: String,
    pub permission_level: String,
    pub version: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locked_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Document list response
#[derive(Debug, Serialize)]
pub struct DocumentListResponse {
    pub documents: Vec<DocumentResponse>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
    pub total_pages: u32,
}

/// Document detail response (includes encrypted key)
#[derive(Debug, Serialize)]
pub struct DocumentDetailResponse {
    pub document: DocumentResponse,
    pub encrypted_key: String,
}

/// Permission entry response
#[derive(Debug, Serialize)]
pub struct PermissionResponse {
    pub user_id: Uuid,
    pub user_email: String,
    pub permission_level: String,
    pub granted_at: DateTime<Utc>,
}

/// Update document request
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateDocumentRequest {
    #[validate(length(min = 1, max = 1000))]
    pub encrypted_name: Option<String>,

    #[validate(length(min = 1, max = 200))]
    pub name_nonce: Option<String>,

    #[validate(length(min = 1, max = 200))]
    pub content_nonce: Option<String>,

    pub content_hash: Option<String>,
    pub storage_path: Option<String>,
    pub size: Option<i64>,

    /// Expected version for optimistic locking
    pub expected_version: i64,

    /// Lock ID to verify lock ownership
    #[validate(length(min = 1, message = "Lock ID is required"))]
    pub lock_id: String,
}
