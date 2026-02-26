//! 分享链接处理器

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use chrono::{Duration, Utc};
use serde::Deserialize;
use uuid::Uuid;

use rustcloud_auth::{check_password, create_password_hash};
use rustcloud_core::utils::generate_token;
use rustcloud_database::{
    CreateShareLink, DocumentKeyRepository, DocumentKeyRepositoryTrait, DocumentRepository,
    DocumentRepositoryTrait, PermissionLevel, ShareLinkRepository, ShareLinkRepositoryTrait,
};

use crate::dto::{
    AccessShareRequest, AccessShareResponse, CreateShareRequest, ShareLinkResponse, ShareListResponse,
};
use crate::error::ApiError;
use crate::extractors::{AuthUser, ValidatedJson};
use crate::response::{ApiResponse, NoContent};
use crate::state::AppState;

use rustcloud_database::entities::share_link::Model as ShareLinkModel;

/// 验证分享链接的过期时间、访问次数和密码
fn validate_share_access(
    share: &ShareLinkModel,
    password: &Option<String>,
) -> Result<(), ApiError> {
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

    // 若需要密码则进行验证
    if let Some(ref password_hash) = share.password_hash {
        let provided_password = password
            .as_ref()
            .ok_or_else(|| ApiError::unauthorized("Password required"))?;
        let valid = check_password(provided_password, password_hash)
            .map_err(|e| ApiError::internal(format!("Password verification failed: {}", e)))?;
        if !valid {
            return Err(ApiError::unauthorized("Invalid password"));
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

    // 若提供了密码则进行哈希
    let password_hash = match &req.password {
        Some(pwd) if !pwd.is_empty() => Some(
            create_password_hash(pwd)
                .map_err(|e| ApiError::internal(format!("Failed to hash password: {}", e)))?,
        ),
        _ => None,
    };

    // 计算过期时间
    let expires_at = req.expires_in.map(|secs| Utc::now() + Duration::seconds(secs));

    // 创建分享链接
    let share = share_repo
        .create(CreateShareLink {
            document_id: req.document_id,
            creator_id: user.id,
            access_token: access_token.clone(),
            encrypted_key: req.encrypted_key,
            password_hash: password_hash.clone(),
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
        has_password: password_hash.is_some(),
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
            has_password: s.password_hash.is_some(),
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
    access_share_internal(state, token, None).await
}

/// POST /api/v1/shares/access/:token
///
/// 使用密码访问分享文档（公开接口，无需认证）
pub async fn access_share_post(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(req): Json<AccessShareRequest>,
) -> Result<ApiResponse<AccessShareResponse>, ApiError> {
    access_share_internal(state, token, req.password).await
}

/// 处理分享访问的内部函数
async fn access_share_internal(
    state: AppState,
    token: String,
    password: Option<String>,
) -> Result<ApiResponse<AccessShareResponse>, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());
    let doc_repo = DocumentRepository::new(state.db.clone());

    // 查找分享链接 by token
    let share = share_repo
        .find_by_token(&token)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    // 验证过期时间、访问次数和密码
    validate_share_access(&share, &password)?;

    // 增加访问次数
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

#[derive(Debug, Deserialize)]
pub struct DownloadShareQuery {
    password: Option<String>,
}

/// GET /api/v1/shares/access/:token/download
///
/// 下载分享文档（公开接口）
pub async fn download_shared_document(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Query(query): Query<DownloadShareQuery>,
) -> Result<Response, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());
    let doc_repo = DocumentRepository::new(state.db.clone());

    // 查找分享链接 by token
    let share = share_repo
        .find_by_token(&token)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    // 验证过期时间、访问次数和密码
    validate_share_access(&share, &query.password)?;

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
