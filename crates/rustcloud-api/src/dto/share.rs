//! 分享 DTO

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ===== 请求 =====

/// 创建分享链接请求
#[derive(Debug, Deserialize, Validate)]
pub struct CreateShareRequest {
    pub document_id: Uuid,

    #[validate(length(min = 1, message = "Encrypted key is required"))]
    pub encrypted_key: String,

    /// 从当前时间起的可选过期秒数
    pub expires_in: Option<i64>,

    /// 可选最大访问次数
    pub max_access_count: Option<i32>,
}

// ===== 响应 =====

/// 分享链接响应
#[derive(Debug, Serialize)]
pub struct ShareLinkResponse {
    pub id: Uuid,
    pub document_id: Uuid,
    pub access_token: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_access_count: Option<i32>,
    pub access_count: i32,
    pub created_at: DateTime<Utc>,
}

/// 分享列表响应
#[derive(Debug, Serialize)]
pub struct ShareListResponse {
    pub shares: Vec<ShareLinkResponse>,
}

/// 访问分享响应（用于匿名访问）
#[derive(Debug, Serialize)]
pub struct AccessShareResponse {
    pub document_id: Uuid,
    pub encrypted_key: String,
    pub encrypted_name: String,
    pub name_nonce: String,
    pub content_nonce: String,
    pub size: i64,
    pub mime_type: String,
}
