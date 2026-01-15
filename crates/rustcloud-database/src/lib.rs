//! RustCloud Database Module
//!
//! SeaORM entities and repository implementations for RustCloud.
//!
//! # Features
//!
//! - SeaORM entity definitions for users, documents, document keys, and share links
//! - Repository pattern for data access abstraction
//! - Database connection pool management
//! - Type conversions between core types and ORM entities
//!
//! # Example
//!
//! ```ignore
//! use rustcloud_database::{
//!     create_connection, DatabaseConfig,
//!     UserRepository, UserRepositoryTrait,
//! };
//!
//! // Create connection
//! let config = DatabaseConfig::from_env(&database_url);
//! let db = create_connection(&config).await?;
//!
//! // Use repository
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

// Re-export connection utilities
pub use connection::{create_connection, DatabaseConfig};

// Re-export error types
pub use error::{DatabaseError, DbResult};

// Re-export pagination
pub use pagination::Page;

// Re-export entities
pub use entities::{DocumentEntity, DocumentKeyEntity, PermissionLevel, ShareLinkEntity, UserEntity};

// Re-export repositories
pub use repositories::{
    DocumentKeyRepository, DocumentKeyRepositoryTrait, DocumentRepository, DocumentRepositoryTrait,
    ShareLinkRepository, ShareLinkRepositoryTrait, UserRepository, UserRepositoryTrait,
};

// Re-export types
pub use types::{
    CreateDocument, CreateDocumentKey, CreateShareLink, CreateUser, DocumentListParams, SortField,
    SortOrder, UpdateDocument, UpdateUser, UserKeys,
};

// Re-export sea_orm for downstream usage
pub use sea_orm::DatabaseConnection;
