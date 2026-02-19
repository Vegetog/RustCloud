//! CORS 配置

use axum::http::{header, Method};
use std::time::Duration;
use tower_http::cors::{Any, CorsLayer};

/// 根据环境创建 CORS 层
///
/// 在开发模式下允许所有来源。
/// 在生产模式下应配置为指定来源。
pub fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any) // TODO: Configure for production
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
        ])
        .max_age(Duration::from_secs(3600))
}
