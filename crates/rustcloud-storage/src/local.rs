//! Local file system storage implementation

use async_trait::async_trait;
use chrono::Utc;
use rustcloud_core::error::{Error, Result};
use rustcloud_crypto::sha256_hash_hex;
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tracing::debug;

use crate::traits::Storage;
use crate::types::{LocalStorageConfig, StorageMetadata, StorageObject};

/// Local file system storage
pub struct LocalStorage {
    config: LocalStorageConfig,
}

impl LocalStorage {
    /// Create a new LocalStorage instance
    pub async fn new(config: LocalStorageConfig) -> Result<Self> {
        // Ensure base directory exists
        fs::create_dir_all(&config.base_path)
            .await
            .map_err(|e| Error::StorageError(format!("Failed to create storage directory: {}", e)))?;

        debug!("LocalStorage initialized at {:?}", config.base_path);
        Ok(Self { config })
    }

    /// Generate a hierarchical storage path
    fn generate_path(&self, key: &str) -> PathBuf {
        let mut path = self.config.base_path.clone();

        // Create directory hierarchy based on key prefix
        let chars: Vec<char> = key.chars().collect();
        for i in 0..self.config.directory_depth as usize {
            let start = i * 2;
            if start + 2 <= chars.len() {
                let dir: String = chars[start..start + 2].iter().collect();
                path.push(&dir);
            }
        }

        path.push(key);
        path
    }

    /// Validate path to prevent directory traversal
    fn validate_path(&self, path: &str) -> Result<()> {
        if path.contains("..") || path.starts_with('/') || path.starts_with('\\') {
            return Err(Error::ValidationError("Invalid path".into()));
        }
        Ok(())
    }

}

#[async_trait]
impl Storage for LocalStorage {
    async fn put(&self, path: &str, content: &[u8], content_type: &str) -> Result<StorageMetadata> {
        self.validate_path(path)?;

        // Check file size
        if content.len() as u64 > self.config.max_file_size {
            return Err(Error::ValidationError(format!(
                "File size exceeds limit: {} > {}",
                content.len(),
                self.config.max_file_size
            )));
        }

        let file_path = self.generate_path(path);

        // Create parent directories
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| Error::StorageError(format!("Failed to create directory: {}", e)))?;
        }

        // Write to temporary file first, then rename (atomic write)
        let temp_path = file_path.with_extension("tmp");

        let mut file = fs::File::create(&temp_path)
            .await
            .map_err(|e| Error::StorageError(format!("Failed to create file: {}", e)))?;

        file.write_all(content)
            .await
            .map_err(|e| Error::StorageError(format!("Failed to write file: {}", e)))?;

        file.sync_all()
            .await
            .map_err(|e| Error::StorageError(format!("Failed to sync file: {}", e)))?;

        // Atomic rename
        fs::rename(&temp_path, &file_path)
            .await
            .map_err(|e| Error::StorageError(format!("Failed to finalize file: {}", e)))?;

        let hash = sha256_hash_hex(content);

        debug!("Stored file: {} ({} bytes)", path, content.len());

        Ok(StorageMetadata::new(
            path.to_string(),
            content.len() as u64,
            content_type.to_string(),
            hash,
        ))
    }

    async fn get(&self, path: &str) -> Result<StorageObject> {
        self.validate_path(path)?;

        let file_path = self.generate_path(path);

        let content = fs::read(&file_path)
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    Error::FileNotFound
                } else {
                    Error::StorageError(format!("Failed to read file: {}", e))
                }
            })?;

        let file_metadata = fs::metadata(&file_path)
            .await
            .map_err(|e| Error::StorageError(format!("Failed to get metadata: {}", e)))?;

        let hash = sha256_hash_hex(&content);

        let metadata = StorageMetadata {
            path: path.to_string(),
            size: file_metadata.len(),
            content_type: "application/octet-stream".to_string(),
            hash,
            created_at: Utc::now(), // Simplified; could use file timestamps
            modified_at: Utc::now(),
        };

        debug!("Retrieved file: {} ({} bytes)", path, content.len());

        Ok(StorageObject::new(metadata, content))
    }

    async fn delete(&self, path: &str) -> Result<()> {
        self.validate_path(path)?;

        let file_path = self.generate_path(path);

        fs::remove_file(&file_path)
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    Error::FileNotFound
                } else {
                    Error::StorageError(format!("Failed to delete file: {}", e))
                }
            })?;

        debug!("Deleted file: {}", path);

        Ok(())
    }

    async fn exists(&self, path: &str) -> Result<bool> {
        self.validate_path(path)?;

        let file_path = self.generate_path(path);

        match fs::metadata(&file_path).await {
            Ok(_) => Ok(true),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(Error::StorageError(format!("Failed to check file: {}", e))),
        }
    }

    async fn list(&self, prefix: &str) -> Result<Vec<StorageMetadata>> {
        self.validate_path(prefix)?;

        let base_path = &self.config.base_path;
        let mut results = Vec::new();

        // Walk directory recursively
        async fn walk_dir(
            dir: PathBuf,
            base: &PathBuf,
            prefix: &str,
            results: &mut Vec<StorageMetadata>,
        ) -> Result<()> {
            let mut entries = fs::read_dir(&dir)
                .await
                .map_err(|e| Error::StorageError(format!("Failed to read directory: {}", e)))?;

            while let Some(entry) = entries
                .next_entry()
                .await
                .map_err(|e| Error::StorageError(format!("Failed to read entry: {}", e)))?
            {
                let path = entry.path();

                if path.is_dir() {
                    Box::pin(walk_dir(path, base, prefix, results)).await?;
                } else if path.is_file() {
                    // Get relative path as key
                    if let Ok(relative) = path.strip_prefix(base) {
                        let key = relative.to_string_lossy().replace('\\', "/");

                        // Filter by prefix
                        if key.starts_with(prefix) && !key.ends_with(".tmp") {
                            if let Ok(meta) = fs::metadata(&path).await {
                                results.push(StorageMetadata {
                                    path: key,
                                    size: meta.len(),
                                    content_type: "application/octet-stream".to_string(),
                                    hash: String::new(), // Hash not computed for listing
                                    created_at: Utc::now(),
                                    modified_at: Utc::now(),
                                });
                            }
                        }
                    }
                }
            }
            Ok(())
        }

        walk_dir(base_path.clone(), base_path, prefix, &mut results).await?;

        Ok(results)
    }

    async fn get_metadata(&self, path: &str) -> Result<StorageMetadata> {
        self.validate_path(path)?;

        let file_path = self.generate_path(path);

        let meta = fs::metadata(&file_path)
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    Error::FileNotFound
                } else {
                    Error::StorageError(format!("Failed to get metadata: {}", e))
                }
            })?;

        Ok(StorageMetadata {
            path: path.to_string(),
            size: meta.len(),
            content_type: "application/octet-stream".to_string(),
            hash: String::new(), // Hash requires reading file
            created_at: Utc::now(),
            modified_at: Utc::now(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    async fn create_test_storage() -> (LocalStorage, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let config = LocalStorageConfig {
            base_path: temp_dir.path().to_path_buf(),
            max_file_size: 10 * 1024 * 1024,
            directory_depth: 2,
        };
        let storage = LocalStorage::new(config).await.unwrap();
        (storage, temp_dir)
    }

    #[tokio::test]
    async fn test_put_and_get() {
        let (storage, _temp) = create_test_storage().await;

        let content = b"Hello, RustCloud!";
        let path = "test123456.txt";

        // Put
        let metadata = storage
            .put(path, content, "text/plain")
            .await
            .unwrap();

        assert_eq!(metadata.path, path);
        assert_eq!(metadata.size, content.len() as u64);

        // Get
        let obj = storage.get(path).await.unwrap();
        assert_eq!(obj.content, content);
    }

    #[tokio::test]
    async fn test_delete() {
        let (storage, _temp) = create_test_storage().await;

        let content = b"Delete me";
        let path = "todelete123.txt";

        storage.put(path, content, "text/plain").await.unwrap();
        assert!(storage.exists(path).await.unwrap());

        storage.delete(path).await.unwrap();
        assert!(!storage.exists(path).await.unwrap());
    }

    #[tokio::test]
    async fn test_exists() {
        let (storage, _temp) = create_test_storage().await;

        assert!(!storage.exists("nonexistent.txt").await.unwrap());

        storage
            .put("exists123.txt", b"data", "text/plain")
            .await
            .unwrap();

        assert!(storage.exists("exists123.txt").await.unwrap());
    }

    #[tokio::test]
    async fn test_path_validation() {
        let (storage, _temp) = create_test_storage().await;

        // Path traversal should fail
        let result = storage.put("../escape.txt", b"bad", "text/plain").await;
        assert!(result.is_err());

        let result = storage.put("/absolute/path.txt", b"bad", "text/plain").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_file_size_limit() {
        let temp_dir = TempDir::new().unwrap();
        let config = LocalStorageConfig {
            base_path: temp_dir.path().to_path_buf(),
            max_file_size: 100, // Very small limit
            directory_depth: 2,
        };
        let storage = LocalStorage::new(config).await.unwrap();

        let large_content = vec![0u8; 200];
        let result = storage
            .put("large.txt", &large_content, "text/plain")
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_list() {
        let (storage, _temp) = create_test_storage().await;

        storage
            .put("prefix_file1.txt", b"1", "text/plain")
            .await
            .unwrap();
        storage
            .put("prefix_file2.txt", b"2", "text/plain")
            .await
            .unwrap();
        storage
            .put("other_file.txt", b"3", "text/plain")
            .await
            .unwrap();

        let list = storage.list("pr").await.unwrap();
        assert_eq!(list.len(), 2);
    }
}
