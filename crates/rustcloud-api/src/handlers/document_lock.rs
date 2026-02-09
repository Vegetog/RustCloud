use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::ApiError,
    extractors::AuthUser,
    response::{ApiResponse, ApiResponseWithStatus},
    services::DocumentLockManager,
    state::AppState,
};
use rustcloud_database::repositories::{DocumentRepository, DocumentRepositoryTrait};

#[derive(Debug, Serialize)]
pub struct AcquireLockResponse {
    pub locked: bool,
    pub lock_id: Option<String>,
    pub version: Option<i64>,
    pub locked_by: Option<String>,
    pub locked_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HeartbeatRequest {
    pub lock_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ReleaseLockRequest {
    pub lock_id: String,
}

/// GET /api/v1/documents/:id/lock
///
/// Try to acquire editing lock for a document
pub async fn acquire_lock(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    tracing::info!(
        "Acquire lock handler called: doc_id={}, user={}",
        id,
        user.email
    );

    // 1. Verify user has access to the document
    let doc_repo = DocumentRepository::new(state.db.clone());
    let doc = doc_repo
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("Document"))?;

    // 2. Try to acquire lock
    let lock_manager = DocumentLockManager::new(state.redis.clone());

    match lock_manager.acquire_lock(id, user.id, user.email.clone()).await {
        Ok(lock_info) => {
            tracing::info!(
                "Lock acquired: doc_id={}, user={}, lock_id={}",
                id,
                user.email,
                lock_info.lock_id
            );

            Ok(ApiResponse::success(AcquireLockResponse {
                locked: true,
                lock_id: Some(lock_info.lock_id),
                version: Some(doc.version),
                locked_by: None,
                locked_at: None,
            })
            .into_response())
        }
        Err(crate::services::LockError::LockHeld) => {
            // Lock is held by another user
            let lock_info = lock_manager
                .get_lock_info(id)
                .await
                .map_err(|e| ApiError::internal(format!("Failed to get lock info: {}", e)))?
                .ok_or_else(|| ApiError::internal("Lock info not found"))?;

            tracing::warn!(
                "Lock conflict: doc_id={}, requested_by={}, held_by={}",
                id,
                user.email,
                lock_info.user_email
            );

            // Return 409 Conflict with lock holder information
            Ok(ApiResponseWithStatus::new(
                StatusCode::CONFLICT,
                AcquireLockResponse {
                    locked: false,
                    lock_id: None,
                    version: None,
                    locked_by: Some(lock_info.user_email),
                    locked_at: Some(lock_info.acquired_at.to_rfc3339()),
                },
            )
            .into_response())
        }
        Err(e) => {
            tracing::error!("Failed to acquire lock: {}", e);
            Err(ApiError::internal(format!("Failed to acquire lock: {}", e)))
        }
    }
}

/// POST /api/v1/documents/:id/lock/heartbeat
///
/// Extend lock TTL (heartbeat)
pub async fn extend_lock(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<HeartbeatRequest>,
) -> Result<ApiResponse<()>, ApiError> {
    let lock_manager = DocumentLockManager::new(state.redis.clone());

    lock_manager
        .heartbeat(id, &req.lock_id)
        .await
        .map_err(|e| match e {
            crate::services::LockError::InvalidLockId => {
                ApiError::forbidden("Invalid lock ID")
            }
            crate::services::LockError::LockNotFound => {
                ApiError::not_found("Lock not found or expired")
            }
            _ => ApiError::internal(format!("Heartbeat failed: {}", e)),
        })?;

    Ok(ApiResponse::success(()))
}

/// DELETE /api/v1/documents/:id/lock
///
/// Release editing lock
pub async fn release_lock(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<ReleaseLockRequest>,
) -> Result<ApiResponse<()>, ApiError> {
    let lock_manager = DocumentLockManager::new(state.redis.clone());

    lock_manager
        .release_lock(id, &req.lock_id)
        .await
        .map_err(|e| match e {
            crate::services::LockError::InvalidLockId => {
                ApiError::forbidden("Invalid lock ID")
            }
            _ => ApiError::internal(format!("Failed to release lock: {}", e)),
        })?;

    Ok(ApiResponse::success(()))
}
