//! 存储 trait 定义

use async_trait::async_trait;
use rustcloud_core::error::Result;

use crate::types::{StorageMetadata, StorageObject};

/// 文件操作存储 trait
#[async_trait]
pub trait Storage: Send + Sync {
    /// 存储文件
    async fn put(&self, path: &str, content: &[u8], content_type: &str) -> Result<StorageMetadata>;

    /// 获取文件
    async fn get(&self, path: &str) -> Result<StorageObject>;

    /// 删除文件
    async fn delete(&self, path: &str) -> Result<()>;

    /// 检查文件是否存在
    async fn exists(&self, path: &str) -> Result<bool>;

    /// 按前缀列出文件
    async fn list(&self, prefix: &str) -> Result<Vec<StorageMetadata>>;

    /// 仅获取元数据（不含内容）
    async fn get_metadata(&self, path: &str) -> Result<StorageMetadata>;
}
