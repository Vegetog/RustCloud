//! Document handlers

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::Response,
};
use uuid::Uuid;

use rustcloud_database::{
    CreateDocument, CreateDocumentKey, DocumentKeyRepository, DocumentKeyRepositoryTrait,
    DocumentListParams, DocumentRepository, DocumentRepositoryTrait, PermissionLevel,
    SortField, SortOrder, UserRepository, UserRepositoryTrait,
};

use crate::dto::{
    DocumentDetailResponse, DocumentListQuery, DocumentListResponse, DocumentResponse,
    GrantPermissionRequest, PermissionResponse, UploadMetadata,
};
use crate::error::ApiError;
use crate::extractors::{AuthUser, ValidatedJson};
use crate::response::{ApiResponse, NoContent};
use crate::state::AppState;

/// GET /api/v1/documents
///
/// List documents accessible to the current user
pub async fn list_documents(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(query): Query<DocumentListQuery>,
) -> Result<ApiResponse<DocumentListResponse>, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // Build list params
    let params = DocumentListParams {
        owner_id: None,
        sort_by: match query.sort_by.as_deref() {
            Some("updated_at") => SortField::UpdatedAt,
            Some("size") => SortField::Size,
            _ => SortField::CreatedAt,
        },
        sort_order: match query.sort_order.as_deref() {
            Some("asc") => SortOrder::Asc,
            _ => SortOrder::Desc,
        },
        page: query.page.unwrap_or(1),
        page_size: query.page_size.unwrap_or(20).min(100),
    };

    // Get documents accessible to user
    let page = doc_repo
        .find_accessible(user.id, params.clone())
        .await
        .map_err(ApiError::from)?;

    // Convert to response with permission levels
    let mut documents = Vec::with_capacity(page.items.len());
    for doc in page.items {
        let key = key_repo
            .find_by_document_and_user(doc.id, user.id)
            .await
            .map_err(ApiError::from)?;

        let permission_level = key
            .map(|k| permission_to_string(k.permission_level))
            .unwrap_or_else(|| "none".to_string());

        documents.push(DocumentResponse {
            id: doc.id,
            encrypted_name: doc.encrypted_name,
            name_nonce: doc.name_nonce,
            content_nonce: doc.content_nonce,
            size: doc.size,
            mime_type: doc.mime_type,
            content_hash: doc.content_hash,
            permission_level,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
        });
    }

    Ok(ApiResponse::success(DocumentListResponse {
        documents,
        total: page.total,
        page: page.page,
        page_size: page.page_size,
        total_pages: page.total_pages,
    }))
}

/// POST /api/v1/documents
///
/// Upload a new document (multipart/form-data)
pub async fn upload_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    mut multipart: Multipart,
) -> Result<ApiResponse<DocumentResponse>, ApiError> {
    let mut file_content: Option<Vec<u8>> = None;
    let mut metadata: Option<UploadMetadata> = None;

    // Parse multipart form
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::bad_request(format!("Invalid multipart form: {}", e)))?
    {
        let name = field.name().map(|s| s.to_string());

        match name.as_deref() {
            Some("file") => {
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| ApiError::bad_request(format!("Failed to read file: {}", e)))?;

                // Check file size limit (100MB)
                if data.len() > 100 * 1024 * 1024 {
                    return Err(ApiError::bad_request("File too large (max 100MB)"));
                }

                file_content = Some(data.to_vec());
            }
            Some("metadata") => {
                let json = field
                    .text()
                    .await
                    .map_err(|e| ApiError::bad_request(format!("Failed to read metadata: {}", e)))?;

                metadata = Some(
                    serde_json::from_str(&json)
                        .map_err(|e| ApiError::bad_request(format!("Invalid metadata JSON: {}", e)))?,
                );
            }
            _ => {}
        }
    }

    let file_content = file_content.ok_or_else(|| ApiError::bad_request("Missing file"))?;
    let metadata = metadata.ok_or_else(|| ApiError::bad_request("Missing metadata"))?;

    // Generate storage path
    let doc_id = Uuid::new_v4();
    let storage_path = format!("documents/{}/{}", user.id, doc_id);

    // Store encrypted file
    let mime_type = metadata.mime_type.clone().unwrap_or_else(|| "application/octet-stream".to_string());
    state
        .storage
        .put(&storage_path, &file_content, &mime_type)
        .await
        .map_err(|e| {
            tracing::error!("Failed to store file: {}", e);
            ApiError::internal("Failed to store file")
        })?;

    // Create document record
    let doc_repo = DocumentRepository::new(state.db.clone());
    let doc = doc_repo
        .create(CreateDocument {
            owner_id: user.id,
            encrypted_name: metadata.encrypted_name,
            name_nonce: metadata.name_nonce,
            content_nonce: metadata.content_nonce,
            content_hash: metadata.content_hash,
            storage_path: storage_path.clone(),
            size: file_content.len() as i64,
            mime_type: mime_type.clone(),
        })
        .await
        .map_err(|e| {
            // Clean up stored file on failure
            let storage = state.storage.clone();
            let path = storage_path.clone();
            tokio::spawn(async move {
                let _ = storage.delete(&path).await;
            });
            ApiError::from(e)
        })?;

    // Create document key for owner
    let key_repo = DocumentKeyRepository::new(state.db.clone());
    key_repo
        .create(CreateDocumentKey {
            document_id: doc.id,
            user_id: user.id,
            encrypted_key: metadata.encrypted_key,
            permission_level: PermissionLevel::Owner,
        })
        .await
        .map_err(ApiError::from)?;

    tracing::info!("Document uploaded: {} by user {}", doc.id, user.email);

    Ok(ApiResponse::success(DocumentResponse {
        id: doc.id,
        encrypted_name: doc.encrypted_name,
        name_nonce: doc.name_nonce,
        content_nonce: doc.content_nonce,
        size: doc.size,
        mime_type: doc.mime_type,
        content_hash: doc.content_hash,
        permission_level: "owner".to_string(),
        created_at: doc.created_at,
        updated_at: doc.updated_at,
    }))
}

/// GET /api/v1/documents/:id
///
/// Get document details with encrypted key
pub async fn get_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<ApiResponse<DocumentDetailResponse>, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // Find document
    let doc = doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // Check permission
    let key = key_repo
        .find_by_document_and_user(id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    Ok(ApiResponse::success(DocumentDetailResponse {
        document: DocumentResponse {
            id: doc.id,
            encrypted_name: doc.encrypted_name,
            name_nonce: doc.name_nonce,
            content_nonce: doc.content_nonce,
            size: doc.size,
            mime_type: doc.mime_type,
            content_hash: doc.content_hash,
            permission_level: permission_to_string(key.permission_level),
            created_at: doc.created_at,
            updated_at: doc.updated_at,
        },
        encrypted_key: key.encrypted_key,
    }))
}

/// GET /api/v1/documents/:id/download
///
/// Download encrypted document content
pub async fn download_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // Find document
    let doc = doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // Check permission
    key_repo
        .find_by_document_and_user(id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    // Get file from storage
    let storage_object = state
        .storage
        .get(&doc.storage_path)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get file from storage: {}", e);
            ApiError::internal("Failed to retrieve file")
        })?;

    // Build response with proper headers
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

/// DELETE /api/v1/documents/:id
///
/// Delete a document (owner only)
pub async fn delete_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<NoContent, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // Find document
    let doc = doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // Check owner permission
    let key = key_repo
        .find_by_document_and_user(id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    if key.permission_level != PermissionLevel::Owner {
        return Err(ApiError::forbidden("Only owner can delete document"));
    }

    // Delete from storage
    state
        .storage
        .delete(&doc.storage_path)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete file from storage: {}", e);
            ApiError::internal("Failed to delete file")
        })?;

    // Delete from database (cascades to keys and shares)
    doc_repo.delete(id).await.map_err(ApiError::from)?;

    tracing::info!("Document deleted: {} by user {}", id, user.email);

    Ok(NoContent)
}

/// POST /api/v1/documents/:id/permissions
///
/// Grant permission to another user
pub async fn grant_permission(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<GrantPermissionRequest>,
) -> Result<ApiResponse<PermissionResponse>, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());
    let user_repo = UserRepository::new(state.db.clone());

    // Find document
    doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // Check owner/write permission
    let my_key = key_repo
        .find_by_document_and_user(id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    if my_key.permission_level == PermissionLevel::Read {
        return Err(ApiError::forbidden("Insufficient permissions"));
    }

    // Find target user
    let target_user = user_repo
        .find_by_email(&req.user_email)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("User"))?;

    // Parse permission level
    let permission_level = match req.permission_level.as_str() {
        "read" => PermissionLevel::Read,
        "write" => PermissionLevel::Write,
        _ => return Err(ApiError::bad_request("Invalid permission level")),
    };

    // Check if key already exists
    if key_repo
        .find_by_document_and_user(id, target_user.id)
        .await
        .map_err(ApiError::from)?
        .is_some()
    {
        return Err(ApiError::conflict("User already has access to this document"));
    }

    // Create document key for target user
    let key = key_repo
        .create(CreateDocumentKey {
            document_id: id,
            user_id: target_user.id,
            encrypted_key: req.encrypted_key,
            permission_level,
        })
        .await
        .map_err(ApiError::from)?;

    tracing::info!(
        "Permission granted: {} -> {} on document {}",
        user.email,
        target_user.email,
        id
    );

    Ok(ApiResponse::success(PermissionResponse {
        user_id: target_user.id,
        user_email: target_user.email,
        permission_level: permission_to_string(key.permission_level),
        granted_at: key.created_at,
    }))
}

/// DELETE /api/v1/documents/:id/permissions/:user_id
///
/// Revoke permission from a user
pub async fn revoke_permission(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((doc_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<NoContent, ApiError> {
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // Check owner permission
    let my_key = key_repo
        .find_by_document_and_user(doc_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    if my_key.permission_level != PermissionLevel::Owner {
        return Err(ApiError::forbidden("Only owner can revoke permissions"));
    }

    // Cannot revoke owner's own permission
    if target_user_id == user.id {
        return Err(ApiError::bad_request("Cannot revoke your own permission"));
    }

    // Find target key
    let target_key = key_repo
        .find_by_document_and_user(doc_id, target_user_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Permission"))?;

    // Delete the key
    key_repo.delete(target_key.id).await.map_err(ApiError::from)?;

    tracing::info!(
        "Permission revoked: user {} from document {} by {}",
        target_user_id,
        doc_id,
        user.email
    );

    Ok(NoContent)
}

// ===== Helper functions =====

fn permission_to_string(level: PermissionLevel) -> String {
    match level {
        PermissionLevel::Read => "read".to_string(),
        PermissionLevel::Write => "write".to_string(),
        PermissionLevel::Owner => "owner".to_string(),
    }
}
