//! 文档处理器

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
    SortField, SortOrder, UpdateDocument, UserRepository, UserRepositoryTrait,
};

use crate::dto::{
    DocumentDetailResponse, DocumentListQuery, DocumentListResponse, DocumentResponse,
    GrantPermissionRequest, PermissionResponse, UpdateDocumentRequest, UploadMetadata,
};
use crate::error::ApiError;
use crate::extractors::{AuthUser, ValidatedJson};
use crate::response::{ApiResponse, NoContent};
use crate::state::AppState;

/// GET /api/v1/documents
///
/// 列出当前用户可访问的文档
pub async fn list_documents(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(query): Query<DocumentListQuery>,
) -> Result<ApiResponse<DocumentListResponse>, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // 构建列表参数
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

    // 获取用户可访问的文档
    let page = doc_repo
        .find_accessible(user.id, params.clone())
        .await
        .map_err(ApiError::from)?;

    // 转换为带权限级别的响应
    let mut documents = Vec::with_capacity(page.items.len());
    for doc in page.items {
        let key = key_repo
            .find_by_document_and_user(doc.id, user.id)
            .await
            .map_err(ApiError::from)?;

        let (permission_level, encrypted_key) = match key {
            Some(k) => (permission_to_string(k.permission_level), Some(k.encrypted_key)),
            None => ("none".to_string(), None),
        };

        documents.push(DocumentResponse {
            id: doc.id,
            encrypted_name: doc.encrypted_name,
            name_nonce: doc.name_nonce,
            content_nonce: doc.content_nonce,
            size: doc.size,
            mime_type: doc.mime_type,
            permission_level,
            version: doc.version,
            encrypted_key,
            locked_by: None, // 列表视图中不暴露锁信息
            locked_at: None,
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
/// 上传新文档（multipart/form-data）
pub async fn upload_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    mut multipart: Multipart,
) -> Result<ApiResponse<DocumentResponse>, ApiError> {
    let mut file_content: Option<Vec<u8>> = None;
    let mut metadata: Option<UploadMetadata> = None;

    // 解析 multipart 表单
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

                // 检查文件大小限制
                if data.len() > crate::state::MAX_FILE_SIZE {
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
    // 生成存储路径
    let doc_id = Uuid::new_v4();
    let storage_path = format!("documents/{}/{}", user.id, doc_id);

    // 存储加密文件
    let mime_type = metadata.mime_type.clone().unwrap_or_else(|| "application/octet-stream".to_string());
    state
        .storage
        .put(&storage_path, &file_content, &mime_type)
        .await
        .map_err(|e| {
            tracing::error!("Failed to store file: {}", e);
            ApiError::internal("Failed to store file")
        })?;

    // 创建文档记录
    let doc_repo = DocumentRepository::new(state.db.clone());
    let doc = doc_repo
        .create(CreateDocument {
            owner_id: user.id,
            encrypted_name: metadata.encrypted_name,
            name_nonce: metadata.name_nonce,
            content_nonce: metadata.content_nonce,
            storage_path: storage_path.clone(),
            size: file_content.len() as i64,
            mime_type: mime_type.clone(),
        })
        .await
        .map_err(|e| {
            // 存储失败时清理已存储的文件
            let storage = state.storage.clone();
            let path = storage_path.clone();
            tokio::spawn(async move {
                let _ = storage.delete(&path).await;
            });
            ApiError::from(e)
        })?;

    // 为所有者创建文档密钥
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
        permission_level: "owner".to_string(),
        version: doc.version,
        encrypted_key: None,
        locked_by: None,
        locked_at: None,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
    }))
}

/// GET /api/v1/documents/:id
///
/// 获取包含加密密钥的文档详情
pub async fn get_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<ApiResponse<DocumentDetailResponse>, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // 查找文档
    let doc = doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // 检查权限
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
            permission_level: permission_to_string(key.permission_level),
            version: doc.version,
            encrypted_key: None,
            locked_by: None, // 不暴露用户 ID，仅在获取锁时显示
            locked_at: doc.locked_at,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
        },
        encrypted_key: key.encrypted_key,
    }))
}

/// GET /api/v1/documents/:id/download
///
/// 下载加密文档内容
pub async fn download_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // 查找文档
    let doc = doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // 检查权限
    key_repo
        .find_by_document_and_user(id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    // 从存储获取文件
    let storage_object = state
        .storage
        .get(&doc.storage_path)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get file from storage: {}", e);
            ApiError::internal("Failed to retrieve file")
        })?;

    // 构建带正确头部的响应
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
/// 删除文档（仅所有者）
pub async fn delete_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<NoContent, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // 查找文档
    let doc = doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // 检查所有者权限
    let key = key_repo
        .find_by_document_and_user(id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    if key.permission_level != PermissionLevel::Owner {
        return Err(ApiError::forbidden("Only owner can delete document"));
    }

    // 从存储删除文件
    state
        .storage
        .delete(&doc.storage_path)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete file from storage: {}", e);
            ApiError::internal("Failed to delete file")
        })?;

    // 从数据库删除（级联删除密钥和分享）
    doc_repo.delete(id).await.map_err(ApiError::from)?;

    tracing::info!("Document deleted: {} by user {}", id, user.email);

    Ok(NoContent)
}

/// PATCH /api/v1/documents/:id
///
/// 更新文档（元数据或内容）
///
/// 权限：
/// - Write：可更新文档内容
/// - Owner：可更新文档内容
pub async fn update_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<UpdateDocumentRequest>,
) -> Result<ApiResponse<DocumentResponse>, ApiError> {
    tracing::info!(
        "Update document handler called: doc_id={}, user={}, data={:?}",
        id,
        user.email,
        req
    );

    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // 1. 检查文档访问权限
    let my_key = key_repo
        .find_by_document_and_user(id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    // 2. 仅写入者或所有者可编辑
    if my_key.permission_level == PermissionLevel::Read {
        return Err(ApiError::forbidden("Read-only users cannot edit document"));
    }

    // 3. 验证锁的归属（协同编辑模式下 lock_id 为 None，跳过锁检查）
    use crate::services::DocumentLockManager;
    let lock_manager = DocumentLockManager::new(state.redis.clone());

    let current_doc = doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    if let Some(ref lock_id) = req.lock_id {
        // 独占锁模式：验证锁归属
        let lock_info = lock_manager.get_lock_info(id).await
            .map_err(|e| ApiError::internal(format!("Failed to get lock info: {}", e)))?;

        if lock_info.is_none() || lock_info.unwrap().lock_id != *lock_id {
            return Err(ApiError::conflict("You don't own the editing lock"));
        }

        // 4a. 验证版本号（乐观锁）
        if let Some(expected_version) = req.expected_version {
            if current_doc.version != expected_version {
                return Err(ApiError::conflict(
                    "Document was modified by another user. Please refresh and retry."
                ));
            }
        }
    }
    // 协同编辑模式（lock_id 为 None）：跳过锁和版本检查，直接保存（最后写入胜出）

    // 5. 更新数据库中的文档并递增版本号
    let update_data = UpdateDocument {
        encrypted_name: req.encrypted_name,
        name_nonce: req.name_nonce,
        content_nonce: req.content_nonce,
        storage_path: req.storage_path,
        size: req.size,
        version: Some(current_doc.version + 1),
        locked_by: Some(None), // 清除锁信息
        locked_at: Some(None),
    };

    let updated_doc = doc_repo.update(id, update_data).await.map_err(ApiError::from)?;

    // 6. 保存成功后释放锁（仅独占锁模式）
    if let Some(ref lock_id) = req.lock_id {
        lock_manager.release_lock(id, lock_id).await.ok();
    }

    tracing::info!(
        "Document updated: {} by user {} ({:?})",
        id,
        user.email,
        my_key.permission_level
    );

    // 7. 返回更新后的文档
    Ok(ApiResponse::success(DocumentResponse {
        id: updated_doc.id,
        encrypted_name: updated_doc.encrypted_name,
        name_nonce: updated_doc.name_nonce,
        content_nonce: updated_doc.content_nonce,
        mime_type: updated_doc.mime_type,
        size: updated_doc.size,
        permission_level: permission_to_string(my_key.permission_level),
        version: updated_doc.version,
        encrypted_key: None,
        locked_by: None,
        locked_at: None,
        created_at: updated_doc.created_at,
        updated_at: updated_doc.updated_at,
    }))
}

/// POST /api/v1/documents/:id/permissions
///
/// 向其他用户授予权限
pub async fn grant_permission(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<GrantPermissionRequest>,
) -> Result<ApiResponse<PermissionResponse>, ApiError> {
    let doc_repo = DocumentRepository::new(state.db.clone());
    let key_repo = DocumentKeyRepository::new(state.db.clone());
    let user_repo = UserRepository::new(state.db.clone());

    // 查找文档
    doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // 检查所有者/写入权限
    let my_key = key_repo
        .find_by_document_and_user(id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    if my_key.permission_level == PermissionLevel::Read {
        return Err(ApiError::forbidden("Insufficient permissions"));
    }

    // 查找目标用户
    let target_user = user_repo
        .find_by_email(&req.user_email)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("User"))?;

    // 解析权限级别
    let permission_level = match req.permission_level.as_str() {
        "read" => PermissionLevel::Read,
        "write" => PermissionLevel::Write,
        _ => return Err(ApiError::bad_request("Invalid permission level")),
    };

    // 检查密钥是否已存在
    if key_repo
        .find_by_document_and_user(id, target_user.id)
        .await
        .map_err(ApiError::from)?
        .is_some()
    {
        return Err(ApiError::conflict("User already has access to this document"));
    }

    // 为目标用户创建文档密钥
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

/// GET /api/v1/documents/:id/permissions
///
/// 列出拥有文档访问权限的所有用户
pub async fn list_permissions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<ApiResponse<Vec<PermissionResponse>>, ApiError> {
    let key_repo = DocumentKeyRepository::new(state.db.clone());
    let user_repo = UserRepository::new(state.db.clone());

    // 验证用户对该文档的访问权限
    key_repo
        .find_by_document_and_user(id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    // 获取该文档的所有密钥
    let keys = key_repo
        .find_by_document(id)
        .await
        .map_err(ApiError::from)?;

    // 构建权限列表
    let mut permissions = Vec::with_capacity(keys.len());
    for key in keys {
        let target_user = user_repo
            .find_by_id(key.user_id)
            .await
            .map_err(ApiError::from)?
            .ok_or_else(|| ApiError::internal("User not found"))?;

        permissions.push(PermissionResponse {
            user_id: target_user.id,
            user_email: target_user.email,
            permission_level: permission_to_string(key.permission_level),
            granted_at: key.created_at,
        });
    }

    tracing::debug!("Listed {} permissions for document {}", permissions.len(), id);

    Ok(ApiResponse::success(permissions))
}

/// DELETE /api/v1/documents/:id/permissions/:user_id
///
/// 撤销用户权限
pub async fn revoke_permission(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((doc_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<NoContent, ApiError> {
    let key_repo = DocumentKeyRepository::new(state.db.clone());

    // 检查所有者权限
    let my_key = key_repo
        .find_by_document_and_user(doc_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    if my_key.permission_level != PermissionLevel::Owner {
        return Err(ApiError::forbidden("Only owner can revoke permissions"));
    }

    // 不能撤销所有者自身的权限
    if target_user_id == user.id {
        return Err(ApiError::bad_request("Cannot revoke your own permission"));
    }

    // 查找目标密钥
    let target_key = key_repo
        .find_by_document_and_user(doc_id, target_user_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Permission"))?;

    // 删除密钥
    key_repo.delete(target_key.id).await.map_err(ApiError::from)?;

    tracing::info!(
        "Permission revoked: user {} from document {} by {}",
        target_user_id,
        doc_id,
        user.email
    );

    Ok(NoContent)
}

// ===== 辅助函数 =====

fn permission_to_string(level: PermissionLevel) -> String {
    match level {
        PermissionLevel::Read => "read".to_string(),
        PermissionLevel::Write => "write".to_string(),
        PermissionLevel::Owner => "owner".to_string(),
    }
}
