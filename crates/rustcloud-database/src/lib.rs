//! RustCloud 数据库模块
//!
//! 面向 RustCloud 的 SeaORM 实体定义和仓储实现。
//!
//! # 功能特性
//!
//! - 用户、文档、文档密钥和分享链接的 SeaORM 实体定义
//! - 用于数据访问抽象的仓储模式
//! - 数据库连接池管理
//! - 核心类型与 ORM 实体之间的类型转换
//!
//! # 使用示例
//!
//! ```ignore
//! use rustcloud_database::{
//!     create_connection, DatabaseConfig,
//!     UserRepository, UserRepositoryTrait,
//! };
//!
//! // 创建数据库连接
//! let config = DatabaseConfig::from_env(&database_url);
//! let db = create_connection(&config).await?;
//!
//! // 使用仓储
//! let user_repo = UserRepository::new(db.clone());
//! let user = user_repo.find_by_email("user@example.com").await?;
//! ```

pub mod connection;
mod conversions;
pub mod entities;
pub mod error;
pub mod pagination;
pub mod repositories;
pub mod types;

// 重新导出连接工具
pub use connection::{create_connection, DatabaseConfig};

// 重新导出错误类型
pub use error::{DatabaseError, DbResult};

// 重新导出分页
pub use pagination::Page;

// 重新导出实体
pub use entities::{DocumentEntity, DocumentKeyEntity, PermissionLevel, ShareLinkEntity, UserEntity};

// 重新导出仓储
pub use repositories::{
    DocumentKeyRepository, DocumentKeyRepositoryTrait, DocumentRepository, DocumentRepositoryTrait,
    ShareLinkRepository, ShareLinkRepositoryTrait, UserRepository, UserRepositoryTrait,
};

// 重新导出类型
pub use types::{
    CreateDocument, CreateDocumentKey, CreateShareLink, CreateUser, DocumentListParams, SortField,
    SortOrder, UpdateDocument, UpdateUser, UserKeys,
};

// 重新导出 sea_orm 供下游使用
pub use sea_orm::DatabaseConnection;
