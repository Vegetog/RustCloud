//! CORS configuration

use axum::http::{header, Method};
use std::time::Duration;
use tower_http::cors::{Any, CorsLayer};

/// Create CORS layer based on environment
///
/// In development mode, allows all origins.
/// In production mode, should be configured with specific origins.
pub fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any) // TODO: Configure for production
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
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
