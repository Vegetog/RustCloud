//! 分享 DTO

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ===== 请求 =====

/// 创建分享链接请求（统一支持文档和文件夹）
#[derive(Debug, Deserialize, Validate)]
pub struct CreateShareRequest {
    /// 分享目标类型：0 = 文档（默认），1 = 文件夹
    pub target_type: Option<i16>,

    /// 文档 ID（文档分享必填）
    pub document_id: Option<Uuid>,

    /// 文件夹 ID（文件夹分享必填）
    pub folder_id: Option<Uuid>,

    /// 加密的文档 DEK（文档分享必填）
    pub encrypted_key: Option<String>,

    /// 临时 RSA 公钥 Base64（文件夹分享必填）
    pub ephemeral_pubkey: Option<String>,

    /// 文件夹分享清单 JSON（文件夹分享必填）
    pub manifest: Option<String>,

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
    pub target_type: i16,
    pub document_id: Option<Uuid>,
    pub folder_id: Option<Uuid>,
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

/// 访问分享响应（target_type=0 时为文档分享，target_type=1 时为文件夹分享）
#[derive(Debug, Serialize)]
pub struct AccessShareResponse {
    /// 0 = 文档分享，1 = 文件夹分享
    pub target_type: i16,

    // ===== 文档分享字段 =====
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name_nonce: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_nonce: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,

    // ===== 文件夹分享字段 =====
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ephemeral_pubkey: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<String>,
}
