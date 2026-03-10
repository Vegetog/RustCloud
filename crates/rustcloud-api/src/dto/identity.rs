//! 身份 DTO

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ===== 请求 =====

/// 创建身份请求
#[derive(Debug, Deserialize, Validate)]
pub struct CreateIdentityRequest {
    #[validate(length(min = 1, max = 255, message = "Identity name is required"))]
    pub name: String,

    pub description: Option<String>,
}

/// 更新身份请求
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateIdentityRequest {
    #[validate(length(min = 1, max = 255, message = "Identity name must not be empty"))]
    pub name: Option<String>,

    pub description: Option<Option<String>>,
}

/// 批量添加用户到身份请求
#[derive(Debug, Deserialize, Validate)]
pub struct BatchAddUsersRequest {
    #[validate(length(min = 1, message = "At least one user email is required"))]
    pub user_emails: Vec<String>,
}

/// 批量移除用户请求
#[derive(Debug, Deserialize, Validate)]
pub struct BatchRemoveUsersRequest {
    #[validate(length(min = 1, message = "At least one user email is required"))]
    pub user_emails: Vec<String>,
}

// ===== 响应 =====

/// 身份响应
#[derive(Debug, Serialize)]
pub struct IdentityResponse {
    pub id: Uuid,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub creator_id: Uuid,
    pub user_count: usize,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 身份列表响应
#[derive(Debug, Serialize)]
pub struct IdentityListResponse {
    pub identities: Vec<IdentityResponse>,
}

/// 身份用户信息响应
#[derive(Debug, Serialize)]
pub struct IdentityUserResponse {
    pub user_id: Uuid,
    pub user_email: String,
    pub assigned_at: DateTime<Utc>,
}

/// 身份详情响应（包含用户列表）
#[derive(Debug, Serialize)]
pub struct IdentityDetailResponse {
    pub identity: IdentityResponse,
    pub users: Vec<IdentityUserResponse>,
}

/// 批量操作响应
#[derive(Debug, Serialize)]
pub struct BatchOperationResponse {
    pub success_count: usize,
    pub failed_emails: Vec<String>,
}
