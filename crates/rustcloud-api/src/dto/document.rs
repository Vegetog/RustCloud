//! 文档 DTO

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ===== 请求 =====

/// 上传文档的元数据（从 multipart 表单提取）
#[derive(Debug, Deserialize, Validate)]
pub struct UploadMetadata {
    #[validate(length(min = 1, message = "Encrypted name is required"))]
    pub encrypted_name: String,

    #[validate(length(min = 1, message = "Name nonce is required"))]
    pub name_nonce: String,

    #[validate(length(min = 1, message = "Content nonce is required"))]
    pub content_nonce: String,

    #[validate(length(min = 1, message = "Encrypted key is required"))]
    pub encrypted_key: String,

    pub mime_type: Option<String>,
}

/// 文档列表查询参数
#[derive(Debug, Deserialize, Default)]
pub struct DocumentListQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

/// 授权请求
#[derive(Debug, Deserialize, Validate)]
pub struct GrantPermissionRequest {
    #[validate(email(message = "Invalid email format"))]
    pub user_email: String,

    #[validate(length(min = 1, message = "Encrypted key is required"))]
    pub encrypted_key: String,

    /// 权限级别："read" 或 "write"
    #[validate(length(min = 1, message = "Permission level is required"))]
    pub permission_level: String,
}

// ===== 响应 =====

/// 文档响应
#[derive(Debug, Serialize)]
pub struct DocumentResponse {
    pub id: Uuid,
    pub encrypted_name: String,
    pub name_nonce: String,
    pub content_nonce: String,
    pub size: i64,
    pub mime_type: String,
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

/// 文档列表响应
#[derive(Debug, Serialize)]
pub struct DocumentListResponse {
    pub documents: Vec<DocumentResponse>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
    pub total_pages: u32,
}

/// 文档详情响应（包含加密密钥）
#[derive(Debug, Serialize)]
pub struct DocumentDetailResponse {
    pub document: DocumentResponse,
    pub encrypted_key: String,
}

/// 权限条目响应
#[derive(Debug, Serialize)]
pub struct PermissionResponse {
    pub user_id: Uuid,
    pub user_email: String,
    pub permission_level: String,
    pub granted_at: DateTime<Utc>,
}

/// 更新文档请求
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateDocumentRequest {
    #[validate(length(min = 1, max = 1000))]
    pub encrypted_name: Option<String>,

    #[validate(length(min = 1, max = 200))]
    pub name_nonce: Option<String>,

    #[validate(length(min = 1, max = 200))]
    pub content_nonce: Option<String>,

    pub storage_path: Option<String>,
    pub size: Option<i64>,

    /// 用于乐观锁的预期版本号（协同编辑模式下可省略）
    pub expected_version: Option<i64>,

    /// 用于校验锁归属的锁 ID（协同编辑模式下可省略）
    pub lock_id: Option<String>,
}
