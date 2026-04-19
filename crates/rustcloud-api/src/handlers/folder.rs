use axum::extract::{Path, Query, State};
use uuid::Uuid;

use rustcloud_database::{
    CreateDocumentKey, CreateFolder, CreateFolderKey, DocumentKeyRepository,
    DocumentKeyRepositoryTrait, DocumentRepository, DocumentRepositoryTrait, FolderKeyRepository,
    FolderKeyRepositoryTrait, FolderRepository, FolderRepositoryTrait, PermissionLevel,
    UpdateFolder, UserRepository, UserRepositoryTrait,
};

use crate::dto::folder::{
    CreateFolderRequest, DocumentSnapshotItem, FolderChildrenQuery, FolderChildrenResponse,
    FolderResponse, FolderSnapshotItem, FolderSnapshotResponse, MoveFolderRequest,
    RenameFolderRequest, ShareFolderRequest,
};
use crate::error::ApiError;
use crate::extractors::{AuthUser, ValidatedJson};
use crate::response::{ApiResponse, ApiResponseWithStatus, NoContent};
use crate::state::AppState;

/// POST /api/v1/folders
pub async fn create_folder(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    ValidatedJson(req): ValidatedJson<CreateFolderRequest>,
) -> Result<ApiResponseWithStatus<FolderResponse>, ApiError> {
    // 如果有 parent_id，校验该 folder 属于当前用户
    if let Some(parent_id) = req.parent_id {
        let folder_repo = FolderRepository::new(state.db.clone());
        let parent = folder_repo
            .find_by_id(parent_id)
            .await
            .map_err(ApiError::from)?
            .ok_or_else(|| ApiError::not_found("Folder"))?;

        if parent.owner_id != user.id {
            return Err(ApiError::forbidden("Cannot create folder in another user's folder"));
        }
    }

    let folder_repo = FolderRepository::new(state.db.clone());
    let folder = folder_repo
        .create(CreateFolder {
            owner_id: user.id,
            parent_id: req.parent_id,
            encrypted_name: req.encrypted_name,
        })
        .await
        .map_err(ApiError::from)?;

    Ok(ApiResponseWithStatus::created(FolderResponse {
        id: folder.id,
        owner_id: folder.owner_id,
        parent_id: folder.parent_id,
        encrypted_name: folder.encrypted_name,
        permission_level: "owner".to_string(),
        created_at: folder.created_at,
        updated_at: folder.updated_at,
    }))
}

/// GET /api/v1/folders/:id
pub async fn get_folder(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(folder_id): Path<Uuid>,
) -> Result<ApiResponse<FolderResponse>, ApiError> {
    let folder_repo = FolderRepository::new(state.db.clone());
    let key_repo = FolderKeyRepository::new(state.db.clone());

    let folder = folder_repo
        .find_by_id(folder_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Folder"))?;

    let key = key_repo
        .find_by_folder_and_user(folder_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("Folder access denied"))?;

    Ok(ApiResponse::success(FolderResponse {
        id: folder.id,
        owner_id: folder.owner_id,
        parent_id: folder.parent_id,
        encrypted_name: key.encrypted_name,
        permission_level: key.permission_level.to_string(),
        created_at: folder.created_at,
        updated_at: folder.updated_at,
    }))
}

/// GET /api/v1/folders?parent_id=<uuid|root>
pub async fn list_folder_children(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(query): Query<FolderChildrenQuery>,
) -> Result<ApiResponse<FolderChildrenResponse>, ApiError> {
    // parent_id: None/"root" = 顶层，UUID 字符串 = 指定文件夹
    let parent_id: Option<Uuid> = match query.parent_id.as_deref() {
        None | Some("root") => None,
        Some(id) => Some(
            Uuid::parse_str(id)
                .map_err(|_| ApiError::bad_request("Invalid folder id"))?,
        ),
    };

    let folder_repo = FolderRepository::new(state.db.clone());
    let key_repo = FolderKeyRepository::new(state.db.clone());

    // 当有指定 parent_id 时，校验用户有访问权限
    if let Some(pid) = parent_id {
        key_repo
            .find_by_folder_and_user(pid, user.id)
            .await
            .map_err(ApiError::from)?
            .ok_or_else(|| ApiError::forbidden("Folder access denied"))?;
    }

    // 只列出用户 own 的子文件夹（快照分享下的 folder 通过 folder_keys 访问）
    // 此处先返回 owner 所有的子文件夹；被分享的文件夹需要通过 folder_keys join 查询
    let folders = folder_repo
        .find_children(user.id, parent_id)
        .await
        .map_err(ApiError::from)?;

    let total = folders.len() as u64;

    let mut folder_responses = Vec::with_capacity(folders.len());
    for f in folders {
        let key = key_repo
            .find_by_folder_and_user(f.id, user.id)
            .await
            .map_err(ApiError::from)?;

        let (perm, enc_name) = match key {
            Some(k) => (k.permission_level.to_string(), k.encrypted_name),
            None => ("owner".to_string(), f.encrypted_name.clone()),
        };

        folder_responses.push(FolderResponse {
            id: f.id,
            owner_id: f.owner_id,
            parent_id: f.parent_id,
            encrypted_name: enc_name,
            permission_level: perm,
            created_at: f.created_at,
            updated_at: f.updated_at,
        });
    }

    Ok(ApiResponse::success(FolderChildrenResponse {
        folders: folder_responses,
        total_folders: total,
    }))
}

/// PATCH /api/v1/folders/:id
pub async fn rename_folder(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(folder_id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<RenameFolderRequest>,
) -> Result<ApiResponse<FolderResponse>, ApiError> {
    let folder_repo = FolderRepository::new(state.db.clone());
    let key_repo = FolderKeyRepository::new(state.db.clone());

    // 权限检查：必须是 Owner 或 Write
    let my_key = key_repo
        .find_by_folder_and_user(folder_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("Folder access denied"))?;

    if my_key.permission_level == PermissionLevel::Read {
        return Err(ApiError::forbidden("Write permission required to rename"));
    }

    // 取自己的新 encrypted_name 并更新 folders 表
    let my_entry = req
        .encrypted_names
        .iter()
        .find(|e| e.user_id == user.id)
        .ok_or_else(|| ApiError::bad_request("Missing encrypted_name for current user"))?;

    let folder = folder_repo
        .update(
            folder_id,
            UpdateFolder {
                encrypted_name: Some(my_entry.encrypted_name.clone()),
                parent_id: None,
            },
        )
        .await
        .map_err(ApiError::from)?;

    // 批量更新所有成员的 folder_key.encrypted_name
    for entry in &req.encrypted_names {
        if let Some(key) = key_repo
            .find_by_folder_and_user(folder_id, entry.user_id)
            .await
            .map_err(ApiError::from)?
        {
            use rustcloud_database::CreateFolderKey;
            key_repo
                .upsert(CreateFolderKey {
                    folder_id,
                    user_id: entry.user_id,
                    encrypted_name: entry.encrypted_name.clone(),
                    permission_level: key.permission_level,
                })
                .await
                .map_err(ApiError::from)?;
        }
    }

    Ok(ApiResponse::success(FolderResponse {
        id: folder.id,
        owner_id: folder.owner_id,
        parent_id: folder.parent_id,
        encrypted_name: my_entry.encrypted_name.clone(),
        permission_level: my_key.permission_level.to_string(),
        created_at: folder.created_at,
        updated_at: folder.updated_at,
    }))
}

/// POST /api/v1/folders/:id/move
pub async fn move_folder(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(folder_id): Path<Uuid>,
    axum::Json(req): axum::Json<MoveFolderRequest>,
) -> Result<ApiResponse<FolderResponse>, ApiError> {
    let folder_repo = FolderRepository::new(state.db.clone());
    let key_repo = FolderKeyRepository::new(state.db.clone());

    // 校验当前用户是 owner
    let my_key = key_repo
        .find_by_folder_and_user(folder_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("Folder access denied"))?;

    if my_key.permission_level != PermissionLevel::Owner {
        return Err(ApiError::forbidden("Owner permission required to move folder"));
    }

    // 防止循环：目标 parent 不能是自己或自己的后代
    if let Some(new_parent) = req.new_parent_id {
        if new_parent == folder_id {
            return Err(ApiError::bad_request("Cannot move folder into itself"));
        }
        let descendants = folder_repo
            .find_descendants(folder_id)
            .await
            .map_err(ApiError::from)?;
        if descendants.iter().any(|d| d.id == new_parent) {
            return Err(ApiError::bad_request("Cannot move folder into its own descendant"));
        }
    }

    let folder = folder_repo
        .update(
            folder_id,
            UpdateFolder {
                encrypted_name: None,
                parent_id: Some(req.new_parent_id),
            },
        )
        .await
        .map_err(ApiError::from)?;

    Ok(ApiResponse::success(FolderResponse {
        id: folder.id,
        owner_id: folder.owner_id,
        parent_id: folder.parent_id,
        encrypted_name: my_key.encrypted_name,
        permission_level: my_key.permission_level.to_string(),
        created_at: folder.created_at,
        updated_at: folder.updated_at,
    }))
}

/// DELETE /api/v1/folders/:id
pub async fn delete_folder(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(folder_id): Path<Uuid>,
) -> Result<NoContent, ApiError> {
    let folder_repo = FolderRepository::new(state.db.clone());
    let key_repo = FolderKeyRepository::new(state.db.clone());

    // 仅 owner 可删除
    let my_key = key_repo
        .find_by_folder_and_user(folder_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("Folder access denied"))?;

    if my_key.permission_level != PermissionLevel::Owner {
        return Err(ApiError::forbidden("Owner permission required to delete folder"));
    }

    // DB CASCADE 会删除 folder_keys 和子 folder；documents.folder_id 设为 NULL
    folder_repo
        .delete(folder_id)
        .await
        .map_err(ApiError::from)?;

    Ok(NoContent)
}

/// GET /api/v1/folders/:id/snapshot
///
/// 返回文件夹子树快照（owner 专用），供前端批量重加密后提交分享请求。
/// 返回的 encrypted_name / encrypted_key 均为调用者自己的 RSA 加密版本。
pub async fn get_folder_snapshot(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(folder_id): Path<Uuid>,
) -> Result<ApiResponse<FolderSnapshotResponse>, ApiError> {
    let folder_repo = FolderRepository::new(state.db.clone());
    let fkey_repo = FolderKeyRepository::new(state.db.clone());
    let doc_repo = DocumentRepository::new(state.db.clone());
    let doc_key_repo = DocumentKeyRepository::new(state.db.clone());

    // 必须是 owner
    let my_key = fkey_repo
        .find_by_folder_and_user(folder_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("Folder access denied"))?;

    if my_key.permission_level != PermissionLevel::Owner {
        return Err(ApiError::forbidden("Owner permission required for snapshot"));
    }

    let root_folder = folder_repo
        .find_by_id(folder_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Folder"))?;

    // 获取所有后代文件夹（BFS）
    let descendants = folder_repo
        .find_descendants(folder_id)
        .await
        .map_err(ApiError::from)?;

    let all_folder_ids: Vec<Uuid> = std::iter::once(folder_id)
        .chain(descendants.iter().map(|f| f.id))
        .collect();

    // 构建文件夹快照列表
    let mut folder_items = vec![FolderSnapshotItem {
        id: root_folder.id,
        parent_id: root_folder.parent_id,
        encrypted_name: my_key.encrypted_name,
    }];

    for desc in &descendants {
        let enc_name = fkey_repo
            .find_by_folder_and_user(desc.id, user.id)
            .await
            .map_err(ApiError::from)?
            .map(|k| k.encrypted_name)
            .unwrap_or_else(|| desc.encrypted_name.clone());

        folder_items.push(FolderSnapshotItem {
            id: desc.id,
            parent_id: desc.parent_id,
            encrypted_name: enc_name,
        });
    }

    // 查询这些文件夹中所有 owner 拥有的文档
    let docs = doc_repo
        .find_in_folders(user.id, all_folder_ids)
        .await
        .map_err(ApiError::from)?;

    let doc_ids: Vec<Uuid> = docs.iter().map(|d| d.id).collect();
    let doc_keys = doc_key_repo
        .find_by_user_and_documents(user.id, doc_ids)
        .await
        .map_err(ApiError::from)?;

    let key_map: std::collections::HashMap<Uuid, String> = doc_keys
        .into_iter()
        .map(|k| (k.document_id, k.encrypted_key))
        .collect();

    let document_items: Vec<DocumentSnapshotItem> = docs
        .into_iter()
        .filter_map(|doc| {
            key_map.get(&doc.id).map(|key| DocumentSnapshotItem {
                id: doc.id,
                folder_id: doc.folder_id,
                encrypted_key: key.clone(),
                encrypted_name: doc.encrypted_name,
                name_nonce: doc.name_nonce,
                content_nonce: doc.content_nonce,
                size: doc.size,
                mime_type: doc.mime_type,
            })
        })
        .collect();

    Ok(ApiResponse::success(FolderSnapshotResponse {
        root_folder_id: folder_id,
        folders: folder_items,
        documents: document_items,
    }))
}

/// POST /api/v1/folders/:id/share
///
/// 用户间文件夹分享（快照式）。
/// 前端已在客户端完成全部重加密，此处仅校验合法性并写入 DB。
pub async fn share_folder(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(folder_id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<ShareFolderRequest>,
) -> Result<NoContent, ApiError> {
    let folder_repo = FolderRepository::new(state.db.clone());
    let fkey_repo = FolderKeyRepository::new(state.db.clone());
    let doc_key_repo = DocumentKeyRepository::new(state.db.clone());
    let user_repo = UserRepository::new(state.db.clone());

    // 校验调用者是 owner
    let my_key = fkey_repo
        .find_by_folder_and_user(folder_id, user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::forbidden("Folder access denied"))?;

    if my_key.permission_level != PermissionLevel::Owner {
        return Err(ApiError::forbidden("Owner permission required to share folder"));
    }

    // 构建子树 ID 集合用于校验
    let descendants = folder_repo
        .find_descendants(folder_id)
        .await
        .map_err(ApiError::from)?;

    let allowed_folder_ids: std::collections::HashSet<Uuid> = std::iter::once(folder_id)
        .chain(descendants.iter().map(|f| f.id))
        .collect();

    // 校验请求中所有 folder_id 均在子树内
    for entry in &req.folder_keys {
        if !allowed_folder_ids.contains(&entry.folder_id) {
            return Err(ApiError::forbidden("Folder is not in the subtree"));
        }
    }

    // 校验文档归属：批量查 document_key，确保 caller 拥有每个文档的 key
    if !req.document_keys.is_empty() {
        let doc_ids: Vec<Uuid> = req.document_keys.iter().map(|e| e.document_id).collect();
        let owned = doc_key_repo
            .find_by_user_and_documents(user.id, doc_ids.clone())
            .await
            .map_err(ApiError::from)?;
        if owned.len() != doc_ids.len() {
            return Err(ApiError::forbidden("Some documents are not owned by you"));
        }
    }

    // 查找目标用户
    let target_user = user_repo
        .find_by_email(&req.target_email)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("User"))?;

    let permission_level = match req.permission_level.as_str() {
        "read" => PermissionLevel::Read,
        "write" => PermissionLevel::Write,
        _ => return Err(ApiError::bad_request("Invalid permission level")),
    };

    // 为目标用户写入文件夹密钥（upsert 保证幂等）
    for entry in &req.folder_keys {
        fkey_repo
            .upsert(CreateFolderKey {
                folder_id: entry.folder_id,
                user_id: target_user.id,
                encrypted_name: entry.encrypted_name.clone(),
                permission_level,
            })
            .await
            .map_err(ApiError::from)?;
    }

    // 为目标用户写入文档密钥
    for entry in &req.document_keys {
        doc_key_repo
            .upsert(CreateDocumentKey {
                document_id: entry.document_id,
                user_id: target_user.id,
                encrypted_key: entry.encrypted_key.clone(),
                permission_level,
            })
            .await
            .map_err(ApiError::from)?;
    }

    tracing::info!(
        "Folder {} shared with {} by {}",
        folder_id,
        target_user.email,
        user.email
    );

    Ok(NoContent)
}
