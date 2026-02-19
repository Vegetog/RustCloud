//! RustCloud API 模块
//!
//! 基于 Axum 的 REST API 服务，用于 RustCloud 加密云存储。
//!
//! # 功能特性
//!
//! - 支持刷新令牌的 JWT 认证
//! - 文档上传、下载与管理
//! - 基于权限的访问控制
//! - 支持可选密码的安全文档分享
//!
//! # API 端点
//!
//! ## 认证 (`/api/v1/auth`)
//! - `POST /register` - 注册新用户
//! - `POST /login` - 用户登录
//! - `POST /refresh` - 刷新访问令牌
//! - `POST /logout` - 用户登出
//! - `GET /me` - 获取当前用户信息
//!
//! ## 文档 (`/api/v1/documents`)
//! - `GET /` - 列出文档
//! - `POST /` - 上传文档
//! - `GET /:id` - 获取文档详情
//! - `GET /:id/download` - 下载文档
//! - `DELETE /:id` - 删除文档
//! - `POST /:id/permissions` - 授权权限
//! - `DELETE /:id/permissions/:user_id` - 撤销权限
//!
//! ## 分享 (`/api/v1/shares`)
//! - `POST /` - 创建分享链接
//! - `GET /` - 列出分享链接
//! - `DELETE /:id` - 删除分享链接
//! - `GET /access/:token` - 访问分享（公开）
//! - `POST /access/:token` - 携带密码访问分享（公开）

pub mod dto;
pub mod error;
pub mod extractors;
pub mod handlers;
pub mod middleware;
pub mod response;
pub mod routes;
pub mod services;
pub mod state;

// 重新导出常用类型
pub use error::ApiError;
pub use response::ApiResponse;
pub use routes::create_router;
pub use state::AppState;
