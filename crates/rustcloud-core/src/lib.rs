//! # rustcloud-core
//!
//! RustCloud 的核心模块，提供：
//! - 通用类型定义
//! - 错误处理
//! - 配置管理

// ==================== 错误处理 ====================

use thiserror::Error;

/// 统一的错误类型
#[derive(Error, Debug)]
pub enum RustCloudError {
    #[error("文件未找到: {0}")]
    FileNotFound(String),

    #[error("权限被拒绝")]
    PermissionDenied,

    #[error("数据库错误: {0}")]
    DatabaseError(String),

    #[error("存储错误: {0}")]
    StorageError(String),

    #[error("加密错误: {0}")]
    CryptoError(String),

    #[error("认证失败: {0}")]
    AuthError(String),

    #[error("内部错误: {0}")]
    InternalError(String),
}

/// 统一的 Result 类型
pub type Result<T> = std::result::Result<T, RustCloudError>;

// ==================== 通用类型 ====================

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

/// 用户 ID 类型（类型别名，增强可读性）
pub type UserId = Uuid;

/// 文档 ID 类型
pub type DocumentId = Uuid;

/// 文档权限级别
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PermissionLevel {
    /// 所有者（完全控制）
    Owner = 2,
    /// 编辑者（读写）
    Editor = 1,
    /// 查看者（只读）
    Viewer = 0,
}

/// 存储后端类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StorageBackend {
    /// 本地文件系统
    Local,
    /// MinIO 对象存储
    Minio,
}

// ==================== 配置 ====================

/// 应用配置
#[derive(Debug, Clone)]
pub struct AppConfig {
    /// 服务器监听地址
    pub server_host: String,
    /// 服务器端口
    pub server_port: u16,
    /// 数据库连接字符串
    pub database_url: String,
    /// Redis 连接字符串
    pub redis_url: String,
    /// 存储后端
    pub storage_backend: StorageBackend,
    /// JWT 密钥
    pub jwt_secret: String,
}

impl AppConfig {
    /// 从环境变量加载配置
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            server_host: std::env::var("SERVER_HOST")
                .unwrap_or_else(|_| "0.0.0.0".to_string()),
            server_port: std::env::var("SERVER_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()?,
            database_url: std::env::var("DATABASE_URL")?,
            redis_url: std::env::var("REDIS_URL")?,
            storage_backend: match std::env::var("STORAGE_BACKEND")
                .unwrap_or_else(|_| "local".to_string())
                .as_str()
            {
                "minio" => StorageBackend::Minio,
                _ => StorageBackend::Local,
            },
            jwt_secret: std::env::var("JWT_SECRET")?,
        })
    }
}

// ==================== 测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_level() {
        assert_eq!(PermissionLevel::Owner as i32, 2);
        assert_eq!(PermissionLevel::Editor as i32, 1);
        assert_eq!(PermissionLevel::Viewer as i32, 0);
    }

    #[test]
    fn test_error_display() {
        let err = RustCloudError::FileNotFound("test.txt".to_string());
        assert_eq!(err.to_string(), "文件未找到: test.txt");
    }
}
