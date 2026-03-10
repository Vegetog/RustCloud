//! 数据库操作数据传输对象

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::entities::document_key::PermissionLevel;

// ========== 用户 DTO ==========

/// 创建新用户所需数据
#[derive(Debug, Clone)]
pub struct CreateUser {
    pub email: String,
    pub password_hash: String,
    pub salt: String,
    pub public_key: String,
    pub encrypted_private_key: String,
    pub private_key_nonce: String,
}

// ========== 文档 DTO ==========

/// 创建新文档所需数据
#[derive(Debug, Clone)]
pub struct CreateDocument {
    pub owner_id: Uuid,
    pub encrypted_name: String,
    pub name_nonce: String,
    pub content_nonce: String,
    pub storage_path: String,
    pub size: i64,
    pub mime_type: String,
}

/// 更新现有文档所需数据
#[derive(Debug, Clone, Default)]
pub struct UpdateDocument {
    pub encrypted_name: Option<String>,
    pub name_nonce: Option<String>,
    pub content_nonce: Option<String>,
    pub storage_path: Option<String>,
    pub size: Option<i64>,
    pub version: Option<i64>,
    pub locked_by: Option<Option<Uuid>>,
    pub locked_at: Option<Option<DateTime<Utc>>>,
}

// ========== 文档密钥 DTO ==========

/// 创建新文档密钥所需数据
#[derive(Debug, Clone)]
pub struct CreateDocumentKey {
    pub document_id: Uuid,
    pub user_id: Uuid,
    pub encrypted_key: String,
    pub permission_level: PermissionLevel,
}

// ========== 分享链接 DTO ==========

/// 创建新分享链接所需数据
#[derive(Debug, Clone)]
pub struct CreateShareLink {
    pub document_id: Uuid,
    pub creator_id: Uuid,
    pub access_token: String,
    pub encrypted_key: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_access_count: Option<i32>,
}

// ========== 查询参数 ==========

/// 文档列表查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentListParams {
    pub owner_id: Option<Uuid>,
    pub sort_by: SortField,
    pub sort_order: SortOrder,
    pub page: u32,
    pub page_size: u32,
}

impl Default for DocumentListParams {
    fn default() -> Self {
        Self {
            owner_id: None,
            sort_by: SortField::CreatedAt,
            sort_order: SortOrder::Desc,
            page: 1,
            page_size: 20,
        }
    }
}

impl DocumentListParams {
    /// 计算分页偏移量
    pub fn offset(&self) -> u64 {
        ((self.page.saturating_sub(1)) * self.page_size) as u64
    }

    /// 获取分页限制数量
    pub fn limit(&self) -> u64 {
        self.page_size as u64
    }
}

/// 排序字段选项
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SortField {
    #[default]
    CreatedAt,
    UpdatedAt,
    Size,
}

/// 排序顺序选项
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    Asc,
    #[default]
    Desc,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_list_params_default() {
        let params = DocumentListParams::default();
        assert_eq!(params.page, 1);
        assert_eq!(params.page_size, 20);
        assert_eq!(params.sort_by, SortField::CreatedAt);
        assert_eq!(params.sort_order, SortOrder::Desc);
    }

    #[test]
    fn test_document_list_params_offset() {
        let mut params = DocumentListParams {
            page: 1,
            page_size: 10,
            ..Default::default()
        };
        assert_eq!(params.offset(), 0);

        params.page = 2;
        assert_eq!(params.offset(), 10);

        params.page = 3;
        assert_eq!(params.offset(), 20);
    }

    #[test]
    fn test_document_list_params_offset_underflow() {
        let params = DocumentListParams {
            page: 0,
            page_size: 10,
            ..Default::default()
        };
        assert_eq!(params.offset(), 0);
    }
}
