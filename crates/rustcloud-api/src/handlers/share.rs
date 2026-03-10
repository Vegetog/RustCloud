//! 分享链接处理器

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::Response,
};
use chrono::{Duration, Utc};
use uuid::Uuid;

use rustcloud_core::utils::generate_token;
use rustcloud_database::{
    CreateShareLink, DocumentKeyRepository, DocumentKeyRepositoryTrait, DocumentRepository,
    DocumentRepositoryTrait, PermissionLevel, ShareLinkRepository, ShareLinkRepositoryTrait,
};

use crate::dto::{
    AccessShareResponse, CreateShareRequest, ShareLinkResponse, ShareListResponse,
};
use crate::error::ApiError;
use crate::extractors::{AuthUser, ValidatedJson};
use crate::response::{ApiResponse, NoContent};
use crate::state::AppState;

use rustcloud_database::entities::share_link::Model as ShareLinkModel;

/// 验证分享链接的过期时间和访问次数
fn validate_share_access(share: &ShareLinkModel) -> Result<(), ApiError> {
    // 检查是否已过期
    if let Some(expires_at) = share.expires_at {
        if expires_at < Utc::now() {
            return Err(ApiError::new(
                StatusCode::GONE,
                "SHARE_EXPIRED",
                "Share link has expired",
            ));
        }
    }

    // 检查访问次数
    if let Some(max_count) = share.max_access_count {
        if share.access_count >= max_count {
            return Err(ApiError::new(
                StatusCode::GONE,
                "SHARE_MAX_ACCESS",
                "Maximum access count reached",
            ));
        }
    }

    Ok(())
}

/// POST /api/v1/shares
///
/// 为文档创建新的分享链接
pub async fn create_share(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    ValidatedJson(req): ValidatedJson<CreateShareRequest>,
) -> Result<ApiResponse<ShareLinkResponse>, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());
    let share_repo = ShareLinkRepository::new(state.db.clone());

    // 验证文档是否存在
    doc_repo
        .find_by_id(req.document_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // 检查用户至少具有读取权限
    let key = key_repo
        .find_by_document_and_user(req.document_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    // 仅所有者和写入者可创建分享
    if key.permission_level == PermissionLevel::Read {
        return Err(ApiError::forbidden("Insufficient permissions to share"));
    }

    // 生成访问令牌
    let access_token = generate_token();

    // 计算过期时间
    let expires_at = req.expires_in.map(|secs| Utc::now() + Duration::seconds(secs));

    // 创建分享链接
    let share = share_repo
        .create(CreateShareLink {
            document_id: req.document_id,
            creator_id: user.id,
            access_token: access_token.clone(),
            encrypted_key: req.encrypted_key,
            expires_at,
            max_access_count: req.max_access_count,
        })
        .await
        .map_err(ApiError::from)?;

    tracing::info!(
        "Share link created: {} for document {} by {}",
        share.id,
        req.document_id,
        user.email
    );

    Ok(ApiResponse::success(ShareLinkResponse {
        id: share.id,
        document_id: share.document_id,
        access_token: share.access_token,
        expires_at: share.expires_at,
        max_access_count: share.max_access_count,
        access_count: share.access_count,
        created_at: share.created_at,
    }))
}

/// GET /api/v1/shares
///
/// 列出当前用户创建的分享链接
pub async fn list_shares(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<ApiResponse<ShareListResponse>, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());

    let shares = share_repo
        .find_by_creator(user.id)
        .await
        .map_err(ApiError::from)?;

    let share_responses: Vec<ShareLinkResponse> = shares
        .into_iter()
        .map(|s| ShareLinkResponse {
            id: s.id,
            document_id: s.document_id,
            access_token: s.access_token,
            expires_at: s.expires_at,
            max_access_count: s.max_access_count,
            access_count: s.access_count,
            created_at: s.created_at,
        })
        .collect();

    Ok(ApiResponse::success(ShareListResponse {
        shares: share_responses,
    }))
}

/// DELETE /api/v1/shares/:id
///
/// 删除分享链接
pub async fn delete_share(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<NoContent, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());

    // 查找分享链接
    let share = share_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    // 仅创建者可删除
    if share.creator_id != user.id {
        return Err(ApiError::forbidden("Only creator can delete share link"));
    }

    share_repo.delete(id).await.map_err(ApiError::from)?;

    tracing::info!("Share link deleted: {} by {}", id, user.email);

    Ok(NoContent)
}

/// GET /api/v1/shares/access/:token
///
/// 访问分享文档（公开接口，无需认证）
pub async fn access_share_get(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<ApiResponse<AccessShareResponse>, ApiError> {
    access_share_internal(state, token).await
}

/// 处理分享访问的内部函数
async fn access_share_internal(
    state: AppState,
    token: String,
) -> Result<ApiResponse<AccessShareResponse>, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());
    let doc_repo = DocumentRepository::new(state.db.clone());

    // 查找分享链接 by token
    let share = share_repo
        .find_by_token(&token)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    // 验证过期时间和访问次数
    validate_share_access(&share)?;

    // 访问分享元数据成功后增加访问次数（受前端去重保护，避免重复消耗）
    share_repo
        .increment_access_count(share.id)
        .await
        .map_err(ApiError::from)?;

    // 获取文档详情
    let doc = doc_repo
        .find_by_id(share.document_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    Ok(ApiResponse::success(AccessShareResponse {
        document_id: doc.id,
        encrypted_key: share.encrypted_key,
        encrypted_name: doc.encrypted_name,
        name_nonce: doc.name_nonce,
        content_nonce: doc.content_nonce,
        size: doc.size,
        mime_type: doc.mime_type,
    }))
}

/// GET /api/v1/shares/access/:token/download
///
/// 下载分享文档（公开接口）
pub async fn download_shared_document(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Response, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());
    let doc_repo = DocumentRepository::new(state.db.clone());

    // 查找分享链接 by token
    let share = share_repo
        .find_by_token(&token)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    // 验证过期时间和访问次数
    validate_share_access(&share)?;

    // 获取文档
    let doc = doc_repo
        .find_by_id(share.document_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // 从存储中获取文件
    let storage_object = state
        .storage
        .get(&doc.storage_path)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get file from storage: {}", e);
            ApiError::internal("Failed to retrieve file")
        })?;

    // 构建响应并设置响应头
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, &doc.mime_type)
        .header(header::CONTENT_LENGTH, storage_object.content.len())
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", doc.id),
        )
        .body(Body::from(storage_object.content))
        .map_err(|e| ApiError::internal(format!("Failed to build response: {}", e)))?;

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_share(max_access_count: Option<i32>, access_count: i32, expires_at: Option<chrono::DateTime<Utc>>) -> ShareLinkModel {
        ShareLinkModel {
            id: Uuid::new_v4(),
            document_id: Uuid::new_v4(),
            creator_id: Uuid::new_v4(),
            access_token: "token123".to_string(),
            encrypted_key: "enc_key".to_string(),
            password_hash: None,
            expires_at,
            max_access_count,
            access_count,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn validate_share_access_rejects_when_max_access_reached() {
        let share = make_share(Some(3), 3, None);
        let result = validate_share_access(&share);
        assert!(result.is_err());
    }

    #[test]
    fn validate_share_access_allows_when_below_max_access() {
        let share = make_share(Some(3), 2, None);
        let result = validate_share_access(&share);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_share_access_rejects_when_expired() {
        let share = make_share(None, 0, Some(Utc::now() - Duration::seconds(1)));
        let result = validate_share_access(&share);
        assert!(result.is_err());
    }
}
