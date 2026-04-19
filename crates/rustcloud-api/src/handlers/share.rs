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
    DocumentRepositoryTrait, FolderKeyRepository, FolderKeyRepositoryTrait, FolderRepository,
    FolderRepositoryTrait, PermissionLevel, ShareLinkRepository, ShareLinkRepositoryTrait,
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
/// 为文档或文件夹创建新的分享链接
pub async fn create_share(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    ValidatedJson(req): ValidatedJson<CreateShareRequest>,
) -> Result<ApiResponse<ShareLinkResponse>, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());

    let target_type = req.target_type.unwrap_or(0);

    let expires_at = req.expires_in.map(|secs| Utc::now() + Duration::seconds(secs));
    let access_token = generate_token();

    if target_type == 1 {
        // ===== 文件夹公开链接分享 =====
        let folder_id = req
            .folder_id
            .ok_or_else(|| ApiError::bad_request("folder_id is required for folder shares"))?;
        let ephemeral_pubkey = req
            .ephemeral_pubkey
            .ok_or_else(|| ApiError::bad_request("ephemeral_pubkey is required for folder shares"))?;
        let manifest = req
            .manifest
            .ok_or_else(|| ApiError::bad_request("manifest is required for folder shares"))?;

        // 校验文件夹存在且调用者是 owner
        let folder_repo = FolderRepository::new(state.db.clone());
        folder_repo
            .find_by_id(folder_id)
            .await
            .map_err(ApiError::from)?
            .ok_or_else(|| ApiError::not_found("Folder"))?;

        let key_repo = FolderKeyRepository::new(state.db.clone());
        let my_key = key_repo
            .find_by_folder_and_user(folder_id, user.id)
            .await
            .map_err(ApiError::from)?
            .ok_or_else(|| ApiError::forbidden("Folder access denied"))?;

        if my_key.permission_level != PermissionLevel::Owner {
            return Err(ApiError::forbidden("Owner permission required to share folder"));
        }

        let share = share_repo
            .create(CreateShareLink {
                target_type: 1,
                document_id: None,
                folder_id: Some(folder_id),
                creator_id: user.id,
                access_token: access_token.clone(),
                encrypted_key: String::new(),
                ephemeral_pubkey: Some(ephemeral_pubkey),
                manifest: Some(manifest),
                expires_at,
                max_access_count: req.max_access_count,
            })
            .await
            .map_err(ApiError::from)?;

        tracing::info!(
            "Folder share link created: {} for folder {} by {}",
            share.id,
            folder_id,
            user.email
        );

        Ok(ApiResponse::success(ShareLinkResponse {
            id: share.id,
            target_type: share.target_type,
            document_id: share.document_id,
            folder_id: share.folder_id,
            access_token: share.access_token,
            expires_at: share.expires_at,
            max_access_count: share.max_access_count,
            access_count: share.access_count,
            created_at: share.created_at,
        }))
    } else {
        // ===== 文档公开链接分享 =====
        let doc_id = req
            .document_id
            .ok_or_else(|| ApiError::bad_request("document_id is required for document shares"))?;
        let encrypted_key = req
            .encrypted_key
            .ok_or_else(|| ApiError::bad_request("encrypted_key is required for document shares"))?;

        let doc_repo = DocumentRepository::new(state.db.clone());
        let key_repo = DocumentKeyRepository::new(state.db.clone());

        // 验证文档是否存在
        doc_repo
            .find_by_id(doc_id)
            .await
            .map_err(ApiError::from)?
            .ok_or_else(|| ApiError::not_found("Document"))?;

        // 检查用户至少具有读取权限
        let key = key_repo
            .find_by_document_and_user(doc_id, user.id)
            .await
            .map_err(ApiError::from)?
            .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

        // 仅所有者和写入者可创建分享
        if key.permission_level == PermissionLevel::Read {
            return Err(ApiError::forbidden("Insufficient permissions to share"));
        }

        let share = share_repo
            .create(CreateShareLink {
                target_type: 0,
                document_id: Some(doc_id),
                folder_id: None,
                creator_id: user.id,
                access_token: access_token.clone(),
                encrypted_key,
                ephemeral_pubkey: None,
                manifest: None,
                expires_at,
                max_access_count: req.max_access_count,
            })
            .await
            .map_err(ApiError::from)?;

        tracing::info!(
            "Document share link created: {} for document {} by {}",
            share.id,
            doc_id,
            user.email
        );

        Ok(ApiResponse::success(ShareLinkResponse {
            id: share.id,
            target_type: share.target_type,
            document_id: share.document_id,
            folder_id: share.folder_id,
            access_token: share.access_token,
            expires_at: share.expires_at,
            max_access_count: share.max_access_count,
            access_count: share.access_count,
            created_at: share.created_at,
        }))
    }
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
            target_type: s.target_type,
            document_id: s.document_id,
            folder_id: s.folder_id,
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
/// 访问分享链接（公开接口，无需认证）
pub async fn access_share_get(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<ApiResponse<AccessShareResponse>, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());
    let doc_repo = DocumentRepository::new(state.db.clone());

    // 查找分享链接
    let share = share_repo
        .find_by_token(&token)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    // 验证过期时间和访问次数
    validate_share_access(&share)?;

    // 增加访问计数
    share_repo
        .increment_access_count(share.id)
        .await
        .map_err(ApiError::from)?;

    if share.target_type == 1 {
        // 文件夹分享：返回 manifest + ephemeral_pubkey
        let folder_id = share
            .folder_id
            .ok_or_else(|| ApiError::internal("Folder share missing folder_id"))?;
        let ephemeral_pubkey = share
            .ephemeral_pubkey
            .ok_or_else(|| ApiError::internal("Folder share missing ephemeral_pubkey"))?;
        let manifest = share
            .manifest
            .ok_or_else(|| ApiError::internal("Folder share missing manifest"))?;

        Ok(ApiResponse::success(AccessShareResponse {
            target_type: 1,
            document_id: None,
            encrypted_key: None,
            encrypted_name: None,
            name_nonce: None,
            content_nonce: None,
            size: None,
            mime_type: None,
            folder_id: Some(folder_id),
            ephemeral_pubkey: Some(ephemeral_pubkey),
            manifest: Some(manifest),
        }))
    } else {
        // 文档分享：返回文档元数据
        let doc_id = share
            .document_id
            .ok_or_else(|| ApiError::internal("Document share missing document_id"))?;
        let doc = doc_repo
            .find_by_id(doc_id)
            .await
            .map_err(ApiError::from)?
            .ok_or_else(|| ApiError::not_found("Document"))?;

        Ok(ApiResponse::success(AccessShareResponse {
            target_type: 0,
            document_id: Some(doc.id),
            encrypted_key: Some(share.encrypted_key),
            encrypted_name: Some(doc.encrypted_name),
            name_nonce: Some(doc.name_nonce),
            content_nonce: Some(doc.content_nonce),
            size: Some(doc.size),
            mime_type: Some(doc.mime_type),
            folder_id: None,
            ephemeral_pubkey: None,
            manifest: None,
        }))
    }
}

/// GET /api/v1/shares/access/:token/download
///
/// 下载分享文档（单文档公开接口）
pub async fn download_shared_document(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Response, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());
    let doc_repo = DocumentRepository::new(state.db.clone());

    let share = share_repo
        .find_by_token(&token)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    validate_share_access(&share)?;

    let doc_id = share
        .document_id
        .ok_or_else(|| ApiError::bad_request("Not a document share"))?;

    let doc = doc_repo
        .find_by_id(doc_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    let storage_object = state
        .storage
        .get(&doc.storage_path)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get file from storage: {}", e);
            ApiError::internal("Failed to retrieve file")
        })?;

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

/// GET /api/v1/shares/access/:token/documents/:doc_id/download
///
/// 下载文件夹分享中的指定文档（公开接口，无需认证）
/// 校验 doc_id 在该分享的 manifest 中，防止越权访问
pub async fn download_folder_share_document(
    State(state): State<AppState>,
    Path((token, doc_id)): Path<(String, Uuid)>,
) -> Result<Response, ApiError> {
    let share_repo = ShareLinkRepository::new(state.db.clone());
    let doc_repo = DocumentRepository::new(state.db.clone());

    let share = share_repo
        .find_by_token(&token)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Share link"))?;

    validate_share_access(&share)?;

    // 必须是文件夹分享
    if share.target_type != 1 {
        return Err(ApiError::bad_request("Not a folder share"));
    }

    // 校验 doc_id 在 manifest 内（防止通过此端点越权访问其它文档）
    let manifest_str = share
        .manifest
        .as_deref()
        .ok_or_else(|| ApiError::internal("Folder share missing manifest"))?;

    // 解析 manifest 并检查 doc_id 是否存在
    let manifest: serde_json::Value = serde_json::from_str(manifest_str)
        .map_err(|_| ApiError::internal("Invalid manifest format"))?;

    let doc_id_str = doc_id.to_string();
    let found = manifest
        .get("documents")
        .and_then(|docs| docs.as_array())
        .map(|arr| arr.iter().any(|item| item.get("id").and_then(|v| v.as_str()) == Some(&doc_id_str)))
        .unwrap_or(false);

    if !found {
        return Err(ApiError::forbidden("Document not in this share"));
    }

    let doc = doc_repo
        .find_by_id(doc_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    let storage_object = state
        .storage
        .get(&doc.storage_path)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get file from storage: {}", e);
            ApiError::internal("Failed to retrieve file")
        })?;

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

    fn make_share(
        target_type: i16,
        max_access_count: Option<i32>,
        access_count: i32,
        expires_at: Option<chrono::DateTime<Utc>>,
    ) -> ShareLinkModel {
        ShareLinkModel {
            id: Uuid::new_v4(),
            target_type,
            document_id: if target_type == 0 { Some(Uuid::new_v4()) } else { None },
            folder_id: if target_type == 1 { Some(Uuid::new_v4()) } else { None },
            creator_id: Uuid::new_v4(),
            access_token: "token123".to_string(),
            encrypted_key: "enc_key".to_string(),
            ephemeral_pubkey: None,
            manifest: None,
            password_hash: None,
            expires_at,
            max_access_count,
            access_count,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn validate_share_access_rejects_when_max_access_reached() {
        let share = make_share(0, Some(3), 3, None);
        let result = validate_share_access(&share);
        assert!(result.is_err());
    }

    #[test]
    fn validate_share_access_allows_when_below_max_access() {
        let share = make_share(0, Some(3), 2, None);
        let result = validate_share_access(&share);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_share_access_rejects_when_expired() {
        let share = make_share(0, None, 0, Some(Utc::now() - Duration::seconds(1)));
        let result = validate_share_access(&share);
        assert!(result.is_err());
    }
}
