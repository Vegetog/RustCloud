//! RustCloud Storage Module
//!
//! File storage abstraction with local and MinIO backends.

mod local;
mod minio;
mod traits;
mod types;

pub use local::LocalStorage;
pub use minio::MinioStorage;
pub use traits::Storage;
pub use types::{StorageConfig, StorageMetadata, StorageObject};
