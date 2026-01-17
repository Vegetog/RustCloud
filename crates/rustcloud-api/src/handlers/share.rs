//! Share handlers

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{Duration, Utc};
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

/// POST /api/v1/shares
///
/// Create a new share link for a document
pub async fn create_share(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    ValidatedJson(req): ValidatedJson<CreateShareRequest>,
) -> Result<ApiResponse<ShareLinkResponse>, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());
    let share_repo = ShareLinkRepository::new(state.db.clone());

    // Verify document exists
    doc_repo
        .find_by_id(req.document_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // Check user has at least read permission
    let key = key_repo
        .find_by_document_and_user(req.document_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    // Only owner and write users can create shares
    if key.permission_level == PermissionLevel::Read {
        return Err(ApiError::forbidden("Insufficient permissions to share"));
    }

    // Generate access token
    let access_token = generate_token();

    // Hash password if provided
    let password_hash = match &req.password {
        Some(pwd) if !pwd.is_empty() => Some(
            create_password_hash(pwd)
                .map_err(|e| ApiError::internal(format!("Failed to hash password: {}", e)))?,
        ),
        _ => None,
    };

    // Calculate expiration
    let expires_at = req.expires_in.map(|secs| Utc::now() + Duration::seconds(secs));

    // Create share link
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
/// List share links created by current user
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
/// Delete a share link
pub async fn delete_share(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<NoContent, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());

    // Find share link
    let share = share_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    // Only creator can delete
    if share.creator_id != user.id {
        return Err(ApiError::forbidden("Only creator can delete share link"));
    }

    share_repo.delete(id).await.map_err(ApiError::from)?;

    tracing::info!("Share link deleted: {} by {}", id, user.email);

    Ok(NoContent)
}

/// GET /api/v1/shares/access/:token
///
/// Access a shared document (public, no auth required)
pub async fn access_share_get(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<ApiResponse<AccessShareResponse>, ApiError> {
    access_share_internal(state, token, None).await
}

/// POST /api/v1/shares/access/:token
///
/// Access a shared document with password (public, no auth required)
pub async fn access_share_post(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(req): Json<AccessShareRequest>,
) -> Result<ApiResponse<AccessShareResponse>, ApiError> {
    access_share_internal(state, token, req.password).await
}

/// Internal function to handle share access
async fn access_share_internal(
    state: AppState,
    token: String,
    password: Option<String>,
) -> Result<ApiResponse<AccessShareResponse>, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());
    let doc_repo = DocumentRepository::new(state.db.clone());

    // Find share link by token
    let share = share_repo
        .find_by_token(&token)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    // Check expiration
    if let Some(expires_at) = share.expires_at {
        if expires_at < Utc::now() {
            return Err(ApiError::new(
                axum::http::StatusCode::GONE,
                "SHARE_EXPIRED",
                "Share link has expired",
            ));
        }
    }

    // Check access count
    if let Some(max_count) = share.max_access_count {
        if share.access_count >= max_count {
            return Err(ApiError::new(
                axum::http::StatusCode::GONE,
                "SHARE_MAX_ACCESS",
                "Maximum access count reached",
            ));
        }
    }

    // Verify password if required
    if let Some(ref password_hash) = share.password_hash {
        let provided_password = password.ok_or_else(|| ApiError::unauthorized("Password required"))?;
        let valid = check_password(&provided_password, password_hash)
            .map_err(|e| ApiError::internal(format!("Password verification failed: {}", e)))?;
        if !valid {
            return Err(ApiError::unauthorized("Invalid password"));
        }
    }

    // Increment access count
    share_repo
        .increment_access_count(share.id)
        .await
        .map_err(ApiError::from)?;

    // Get document details
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
        content_hash: doc.content_hash,
        size: doc.size,
        mime_type: doc.mime_type,
    }))
}
