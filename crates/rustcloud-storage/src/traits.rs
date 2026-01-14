//! Storage trait definition

use async_trait::async_trait;
use rustcloud_core::error::Result;

use crate::types::{StorageMetadata, StorageObject};

/// Storage trait for file operations
#[async_trait]
pub trait Storage: Send + Sync {
    /// Store a file
    async fn put(&self, path: &str, content: &[u8], content_type: &str) -> Result<StorageMetadata>;

    /// Retrieve a file
    async fn get(&self, path: &str) -> Result<StorageObject>;

    /// Delete a file
    async fn delete(&self, path: &str) -> Result<()>;

    /// Check if a file exists
    async fn exists(&self, path: &str) -> Result<bool>;

    /// List files with a prefix
    async fn list(&self, prefix: &str) -> Result<Vec<StorageMetadata>>;

    /// Get only metadata without content
    async fn get_metadata(&self, path: &str) -> Result<StorageMetadata>;
}
