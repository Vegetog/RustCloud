//! RustCloud 存储模块
//!
//! 文件存储抽象，支持本地与 MinIO 后端。

mod local;
mod minio;
mod traits;
mod types;

pub use local::LocalStorage;
pub use minio::MinioStorage;
pub use traits::Storage;
pub use types::{LocalStorageConfig, MinioStorageConfig, StorageConfig, StorageMetadata, StorageObject};
