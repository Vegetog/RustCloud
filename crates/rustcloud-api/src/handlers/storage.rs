//! 文件上传存储处理器

use axum::{
    extract::{Multipart, State},
};
use uuid::Uuid;

use crate::ApiResponse;
use crate::error::ApiError;
use crate::extractors::AuthUser;
use crate::state::AppState;

/// 文件上传响应
#[derive(Debug, serde::Serialize)]
pub struct UploadResponse {
    pub storage_path: String,
}

/// 上传文件到存储
///
/// POST /api/v1/storage/upload
///
/// 这是一个用于更新文档内容的通用文件上传接口。
#[axum::debug_handler]
pub async fn upload_file(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    mut multipart: Multipart,
) -> Result<ApiResponse<UploadResponse>, ApiError> {
    tracing::info!("Upload file handler called for user {}", user.email);

    let mut file_content: Option<Vec<u8>> = None;
    let mut field_count = 0;

    // 解析 multipart 表单
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| {
            tracing::error!("Failed to parse multipart form: {}", e);
            ApiError::bad_request(format!("Invalid multipart form: {}", e))
        })?
    {
        field_count += 1;
        let name = field.name().map(|s| s.to_string());
        let content_type = field.content_type().map(|s| s.to_string());

        tracing::info!(
            "Found field #{}: name={:?}, content_type={:?}",
            field_count,
            name,
            content_type
        );

        if name.as_deref() == Some("file") {
            tracing::info!("Found 'file' field, reading bytes...");

            let data = field
                .bytes()
                .await
                .map_err(|e| {
                    tracing::error!("Failed to read file bytes: {}", e);
                    ApiError::bad_request(format!("Failed to read file: {}", e))
                })?;

            tracing::info!("Read {} bytes from file field", data.len());

            // 检查文件大小限制（100MB）
            if data.len() > 100 * 1024 * 1024 {
                tracing::warn!("File too large: {} bytes", data.len());
                return Err(ApiError::bad_request("File too large (max 100MB)"));
            }

            file_content = Some(data.to_vec());
            tracing::info!("File content saved successfully");
        }
    }

    tracing::info!("Parsed {} fields total", field_count);

    let file_content = file_content.ok_or_else(|| {
        tracing::error!("No file field found in multipart form");
        ApiError::bad_request("Missing file")
    })?;

    // 生成存储路径
    let file_id = Uuid::new_v4();
    let storage_path = format!("documents/{}/{}", user.id, file_id);

    // 存储文件
    state
        .storage
        .put(&storage_path, &file_content, "application/octet-stream")
        .await
        .map_err(|e| {
            tracing::error!("Failed to store file: {}", e);
            ApiError::internal("Failed to store file")
        })?;

    tracing::info!(
        "File uploaded to storage: {} by user {}",
        storage_path,
        user.email
    );

    Ok(ApiResponse::success(UploadResponse { storage_path }))
}
