//! 身份管理处理器

use axum::extract::{Path, State};
use uuid::Uuid;

use rustcloud_database::{
    CreateIdentity, CreateIdentityUser, IdentityRepository, IdentityRepositoryTrait,
    IdentityUserRepository, IdentityUserRepositoryTrait, UpdateIdentity, UserRepository,
    UserRepositoryTrait,
};

use crate::dto::{
    BatchAddUsersRequest, BatchOperationResponse, BatchRemoveUsersRequest,
    CreateIdentityRequest, GrantedIdentityListResponse, GrantedIdentityResponse,
    IdentityDetailResponse, IdentityListResponse, IdentityResponse, IdentityUserResponse,
    UpdateIdentityRequest,
};
use crate::error::ApiError;
use crate::extractors::{AuthUser, ValidatedJson};
use crate::response::{ApiResponse, NoContent};
use crate::state::AppState;

/// POST /api/v1/identities
///
/// 创建新身份
pub async fn create_identity(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    ValidatedJson(req): ValidatedJson<CreateIdentityRequest>,
) -> Result<ApiResponse<IdentityResponse>, ApiError> {
    let identity_repo = IdentityRepository::new(state.db.clone());

    let identity = identity_repo
        .create(CreateIdentity {
            name: req.name,
            description: req.description,
            creator_id: user.id,
        })
        .await
        .map_err(ApiError::from)?;

    tracing::info!("Identity created: {} by {}", identity.id, user.email);

    Ok(ApiResponse::success(IdentityResponse {
        id: identity.id,
        name: identity.name,
        description: identity.description,
        creator_id: identity.creator_id,
        user_count: 0,
        created_at: identity.created_at,
        updated_at: identity.updated_at,
    }))
}

/// GET /api/v1/identities
///
/// 列出当前用户创建的身份
pub async fn list_identities(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<ApiResponse<IdentityListResponse>, ApiError> {
    let identity_repo = IdentityRepository::new(state.db.clone());
    let iu_repo = IdentityUserRepository::new(state.db.clone());

    let identities = identity_repo
        .find_by_creator(user.id)
        .await
        .map_err(ApiError::from)?;

    let mut identity_responses = Vec::with_capacity(identities.len());
    for identity in identities {
        let users = iu_repo
            .find_by_identity(identity.id)
            .await
            .map_err(ApiError::from)?;

        identity_responses.push(IdentityResponse {
            id: identity.id,
            name: identity.name,
            description: identity.description,
            creator_id: identity.creator_id,
            user_count: users.len(),
            created_at: identity.created_at,
            updated_at: identity.updated_at,
        });
    }

    Ok(ApiResponse::success(IdentityListResponse {
        identities: identity_responses,
    }))
}

/// GET /api/v1/identities/:id
///
/// 获取身份详情（含用户列表）
pub async fn get_identity(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<ApiResponse<IdentityDetailResponse>, ApiError> {
    let identity_repo = IdentityRepository::new(state.db.clone());
    let iu_repo = IdentityUserRepository::new(state.db.clone());
    let user_repo = UserRepository::new(state.db.clone());

    let identity = identity_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Identity"))?;

    // 仅创建者可查看
    if identity.creator_id != user.id {
        return Err(ApiError::forbidden("Only creator can view this identity"));
    }

    let identity_users = iu_repo
        .find_by_identity(id)
        .await
        .map_err(ApiError::from)?;

    let user_ids: Vec<Uuid> = identity_users.iter().map(|iu| iu.user_id).collect();
    let users = user_repo
        .find_by_ids(user_ids)
        .await
        .map_err(ApiError::from)?;

    let user_map: std::collections::HashMap<Uuid, _> =
        users.into_iter().map(|u| (u.id, u)).collect();

    let user_responses: Vec<IdentityUserResponse> = identity_users
        .iter()
        .filter_map(|iu| {
            user_map.get(&iu.user_id).map(|u| IdentityUserResponse {
                user_id: u.id,
                user_email: u.email.clone(),
                assigned_at: iu.assigned_at,
            })
        })
        .collect();

    Ok(ApiResponse::success(IdentityDetailResponse {
        identity: IdentityResponse {
            id: identity.id,
            name: identity.name,
            description: identity.description,
            creator_id: identity.creator_id,
            user_count: user_responses.len(),
            created_at: identity.created_at,
            updated_at: identity.updated_at,
        },
        users: user_responses,
    }))
}

/// PUT /api/v1/identities/:id
///
/// 更新身份
pub async fn update_identity(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<UpdateIdentityRequest>,
) -> Result<ApiResponse<IdentityResponse>, ApiError> {
    let identity_repo = IdentityRepository::new(state.db.clone());
    let iu_repo = IdentityUserRepository::new(state.db.clone());

    let identity = identity_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Identity"))?;

    // 仅创建者可更新
    if identity.creator_id != user.id {
        return Err(ApiError::forbidden("Only creator can update this identity"));
    }

    let updated = identity_repo
        .update(
            id,
            UpdateIdentity {
                name: req.name,
                description: req.description,
            },
        )
        .await
        .map_err(ApiError::from)?;

    let users = iu_repo
        .find_by_identity(id)
        .await
        .map_err(ApiError::from)?;

    tracing::info!("Identity updated: {} by {}", id, user.email);

    Ok(ApiResponse::success(IdentityResponse {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        creator_id: updated.creator_id,
        user_count: users.len(),
        created_at: updated.created_at,
        updated_at: updated.updated_at,
    }))
}

/// DELETE /api/v1/identities/:id
///
/// 删除身份
pub async fn delete_identity(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<NoContent, ApiError> {
    let identity_repo = IdentityRepository::new(state.db.clone());

    let identity = identity_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Identity"))?;

    // 仅创建者可删除
    if identity.creator_id != user.id {
        return Err(ApiError::forbidden("Only creator can delete this identity"));
    }

    identity_repo.delete(id).await.map_err(ApiError::from)?;

    tracing::info!("Identity deleted: {} by {}", id, user.email);

    Ok(NoContent)
}

/// POST /api/v1/identities/:id/users
///
/// 批量添加用户到身份
pub async fn batch_add_users(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<BatchAddUsersRequest>,
) -> Result<ApiResponse<BatchOperationResponse>, ApiError> {
    let identity_repo = IdentityRepository::new(state.db.clone());
    let iu_repo = IdentityUserRepository::new(state.db.clone());
    let user_repo = UserRepository::new(state.db.clone());

    let identity = identity_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Identity"))?;

    // 仅创建者可添加用户
    if identity.creator_id != user.id {
        return Err(ApiError::forbidden(
            "Only creator can add users to this identity",
        ));
    }

    let mut success_count = 0;
    let mut failed_emails = Vec::new();

    for email in &req.user_emails {
        // 查找用户
        match user_repo.find_by_email(email).await {
            Ok(Some(target_user)) => {
                // 检查是否已存在
                match iu_repo
                    .find_by_identity_and_user(id, target_user.id)
                    .await
                {
                    Ok(Some(_)) => {
                        // 已存在，跳过
                        failed_emails.push(email.clone());
                    }
                    Ok(None) => {
                        // 创建关联
                        match iu_repo
                            .create(CreateIdentityUser {
                                identity_id: id,
                                user_id: target_user.id,
                            })
                            .await
                        {
                            Ok(_) => success_count += 1,
                            Err(_) => failed_emails.push(email.clone()),
                        }
                    }
                    Err(_) => failed_emails.push(email.clone()),
                }
            }
            _ => {
                failed_emails.push(email.clone());
            }
        }
    }

    tracing::info!(
        "Batch add users to identity {}: {} succeeded, {} failed, by {}",
        id,
        success_count,
        failed_emails.len(),
        user.email
    );

    Ok(ApiResponse::success(BatchOperationResponse {
        success_count,
        failed_emails,
    }))
}

/// DELETE /api/v1/identities/:id/users
///
/// 批量移除身份中的用户
pub async fn batch_remove_users(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<BatchRemoveUsersRequest>,
) -> Result<ApiResponse<BatchOperationResponse>, ApiError> {
    let identity_repo = IdentityRepository::new(state.db.clone());
    let iu_repo = IdentityUserRepository::new(state.db.clone());
    let user_repo = UserRepository::new(state.db.clone());

    let identity = identity_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Identity"))?;

    // 仅创建者可移除用户
    if identity.creator_id != user.id {
        return Err(ApiError::forbidden(
            "Only creator can remove users from this identity",
        ));
    }

    let mut success_count = 0;
    let mut failed_emails = Vec::new();

    for email in &req.user_emails {
        match user_repo.find_by_email(email).await {
            Ok(Some(target_user)) => {
                match iu_repo
                    .delete_by_identity_and_user(id, target_user.id)
                    .await
                {
                    Ok(_) => success_count += 1,
                    Err(_) => failed_emails.push(email.clone()),
                }
            }
            _ => {
                failed_emails.push(email.clone());
            }
        }
    }

    tracing::info!(
        "Batch remove users from identity {}: {} succeeded, {} failed, by {}",
        id,
        success_count,
        failed_emails.len(),
        user.email
    );

    Ok(ApiResponse::success(BatchOperationResponse {
        success_count,
        failed_emails,
    }))
}

/// GET /api/v1/identities/:id/users
///
/// 列出身份下的所有用户
pub async fn list_identity_users(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<ApiResponse<Vec<IdentityUserResponse>>, ApiError> {
    let identity_repo = IdentityRepository::new(state.db.clone());
    let iu_repo = IdentityUserRepository::new(state.db.clone());
    let user_repo = UserRepository::new(state.db.clone());

    let identity = identity_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Identity"))?;

    // 仅创建者可查看用户列表
    if identity.creator_id != user.id {
        return Err(ApiError::forbidden(
            "Only creator can view identity users",
        ));
    }

    let identity_users = iu_repo
        .find_by_identity(id)
        .await
        .map_err(ApiError::from)?;

    let user_ids: Vec<Uuid> = identity_users.iter().map(|iu| iu.user_id).collect();
    let users = user_repo
        .find_by_ids(user_ids)
        .await
        .map_err(ApiError::from)?;

    let user_map: std::collections::HashMap<Uuid, _> =
        users.into_iter().map(|u| (u.id, u)).collect();

    let user_responses: Vec<IdentityUserResponse> = identity_users
        .iter()
        .filter_map(|iu| {
            user_map.get(&iu.user_id).map(|u| IdentityUserResponse {
                user_id: u.id,
                user_email: u.email.clone(),
                assigned_at: iu.assigned_at,
            })
        })
        .collect();

    Ok(ApiResponse::success(user_responses))
}

/// GET /api/v1/identities/granted
///
/// 列出当前用户被授予的身份
pub async fn list_granted_identities(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<ApiResponse<GrantedIdentityListResponse>, ApiError> {
    let identity_repo = IdentityRepository::new(state.db.clone());
    let iu_repo = IdentityUserRepository::new(state.db.clone());

    let identity_users = iu_repo
        .find_by_user(user.id)
        .await
        .map_err(ApiError::from)?;

    let identity_ids: Vec<Uuid> = identity_users.iter().map(|iu| iu.identity_id).collect();
    let identities = identity_repo
        .find_by_ids(identity_ids)
        .await
        .map_err(ApiError::from)?;

    let identity_map: std::collections::HashMap<Uuid, _> =
        identities.into_iter().map(|i| (i.id, i)).collect();

    let granted_identities: Vec<GrantedIdentityResponse> = identity_users
        .iter()
        .filter_map(|iu| {
            identity_map.get(&iu.identity_id).map(|identity| GrantedIdentityResponse {
                id: identity.id,
                name: identity.name.clone(),
                description: identity.description.clone(),
                creator_id: identity.creator_id,
                assigned_at: iu.assigned_at,
                created_at: identity.created_at,
                updated_at: identity.updated_at,
            })
        })
        .collect();

    Ok(ApiResponse::success(GrantedIdentityListResponse {
        identities: granted_identities,
    }))
}
