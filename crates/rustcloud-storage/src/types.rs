//! Storage types and metadata

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Storage object metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageMetadata {
    pub path: String,
    pub size: u64,
    pub content_type: String,
    pub hash: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
}

impl StorageMetadata {
    pub fn new(path: String, size: u64, content_type: String, hash: String) -> Self {
        let now = Utc::now();
        Self {
            path,
            size,
            content_type,
            hash,
            created_at: now,
            modified_at: now,
        }
    }
}

/// Storage object with content
#[derive(Debug)]
pub struct StorageObject {
    pub metadata: StorageMetadata,
    pub content: Vec<u8>,
}

impl StorageObject {
    pub fn new(metadata: StorageMetadata, content: Vec<u8>) -> Self {
        Self { metadata, content }
    }
}

/// Local storage configuration
#[derive(Debug, Clone)]
pub struct LocalStorageConfig {
    pub base_path: PathBuf,
    pub max_file_size: u64,
    pub directory_depth: u32,
}

impl Default for LocalStorageConfig {
    fn default() -> Self {
        Self {
            base_path: PathBuf::from("./storage"),
            max_file_size: 100 * 1024 * 1024, // 100MB
            directory_depth: 2,
        }
    }
}

/// MinIO storage configuration
#[derive(Debug, Clone)]
pub struct MinioStorageConfig {
    pub endpoint: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    pub region: String,
    pub use_ssl: bool,
}

impl MinioStorageConfig {
    pub fn from_env() -> Option<Self> {
        Some(Self {
            endpoint: std::env::var("STORAGE_ENDPOINT").ok()?,
            bucket: std::env::var("STORAGE_BUCKET").ok()?,
            access_key: std::env::var("STORAGE_ACCESS_KEY").ok()?,
            secret_key: std::env::var("STORAGE_SECRET_KEY").ok()?,
            region: std::env::var("STORAGE_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
            use_ssl: std::env::var("STORAGE_USE_SSL")
                .map(|v| v == "true")
                .unwrap_or(false),
        })
    }
}

/// Storage configuration enum
#[derive(Debug, Clone)]
pub enum StorageConfig {
    Local(LocalStorageConfig),
    Minio(MinioStorageConfig),
}
