//! Unified API response types

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

/// Unified API response wrapper
#[derive(Debug, Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
}

impl<T: Serialize> ApiResponse<T> {
    /// Create a successful response with data
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
        }
    }

    /// Create a successful response with no data
    pub fn ok() -> ApiResponse<()> {
        ApiResponse {
            success: true,
            data: None,
        }
    }
}

impl<T: Serialize> IntoResponse for ApiResponse<T> {
    fn into_response(self) -> Response {
        (StatusCode::OK, Json(self)).into_response()
    }
}

/// Response with custom status code
pub struct ApiResponseWithStatus<T: Serialize> {
    pub status: StatusCode,
    pub response: ApiResponse<T>,
}

impl<T: Serialize> ApiResponseWithStatus<T> {
    pub fn new(status: StatusCode, data: T) -> Self {
        Self {
            status,
            response: ApiResponse::success(data),
        }
    }

    pub fn created(data: T) -> Self {
        Self::new(StatusCode::CREATED, data)
    }
}

impl<T: Serialize> IntoResponse for ApiResponseWithStatus<T> {
    fn into_response(self) -> Response {
        (self.status, Json(self.response)).into_response()
    }
}

/// Empty success response (for DELETE operations)
pub struct NoContent;

impl IntoResponse for NoContent {
    fn into_response(self) -> Response {
        StatusCode::NO_CONTENT.into_response()
    }
}
