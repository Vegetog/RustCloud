//! RustCloud API Module
//!
//! Axum-based REST API service for RustCloud encrypted cloud storage.
//!
//! # Features
//!
//! - JWT authentication with refresh tokens
//! - Document upload, download, and management
//! - Permission-based access control
//! - Secure document sharing with optional passwords
//!
//! # API Endpoints
//!
//! ## Authentication (`/api/v1/auth`)
//! - `POST /register` - Register new user
//! - `POST /login` - User login
//! - `POST /refresh` - Refresh access token
//! - `POST /logout` - User logout
//! - `GET /me` - Get current user info
//!
//! ## Documents (`/api/v1/documents`)
//! - `GET /` - List documents
//! - `POST /` - Upload document
//! - `GET /:id` - Get document details
//! - `GET /:id/download` - Download document
//! - `DELETE /:id` - Delete document
//! - `POST /:id/permissions` - Grant permission
//! - `DELETE /:id/permissions/:user_id` - Revoke permission
//!
//! ## Shares (`/api/v1/shares`)
//! - `POST /` - Create share link
//! - `GET /` - List share links
//! - `DELETE /:id` - Delete share link
//! - `GET /access/:token` - Access share (public)
//! - `POST /access/:token` - Access share with password (public)

pub mod dto;
pub mod error;
pub mod extractors;
pub mod handlers;
pub mod middleware;
pub mod response;
pub mod routes;
pub mod services;
pub mod state;

// Re-export commonly used types
pub use error::ApiError;
pub use response::ApiResponse;
pub use routes::create_router;
pub use state::AppState;
