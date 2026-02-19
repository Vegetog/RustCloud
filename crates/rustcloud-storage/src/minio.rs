//! MinIO/S3 对象存储实现

use async_trait::async_trait;
use aws_config::BehaviorVersion;
use aws_sdk_s3::{
    config::{Credentials, Region},
    primitives::ByteStream,
    Client,
};
use chrono::Utc;
use rustcloud_core::error::{Error, Result};
use rustcloud_crypto::sha256_hash_hex;
use tracing::{debug, info};

use crate::traits::Storage;
use crate::types::{MinioStorageConfig, StorageMetadata, StorageObject};

/// MinIO/S3 存储实现
pub struct MinioStorage {
    client: Client,
    bucket: String,
}

impl MinioStorage {
    /// 创建新的 MinioStorage 实例
    pub async fn new(config: MinioStorageConfig) -> Result<Self> {
        let credentials = Credentials::new(
            &config.access_key,
            &config.secret_key,
            None,
            None,
            "rustcloud",
        );

        let endpoint = if config.use_ssl {
            config.endpoint.replace("http://", "https://")
        } else {
            config.endpoint.clone()
        };

        let s3_config = aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new(config.region.clone()))
            .endpoint_url(&endpoint)
            .credentials_provider(credentials)
            .force_path_style(true) // MinIO 需要强制路径风格
            .build();

        let client = Client::from_conf(s3_config);

        let storage = Self {
            client,
            bucket: config.bucket.clone(),
        };

        // 确保存储桶存在
        storage.ensure_bucket().await?;

        info!("MinioStorage connected to {}", endpoint);

        Ok(storage)
    }

    /// 确保存储桶存在，不存在则创建
    async fn ensure_bucket(&self) -> Result<()> {
        match self.client.head_bucket().bucket(&self.bucket).send().await {
            Ok(_) => {
                debug!("Bucket {} exists", self.bucket);
                Ok(())
            }
            Err(_) => {
                info!("Creating bucket {}", self.bucket);
                self.client
                    .create_bucket()
                    .bucket(&self.bucket)
                    .send()
                    .await
                    .map_err(|e| {
                        Error::StorageError(format!("Failed to create bucket: {}", e))
                    })?;
                Ok(())
            }
        }
    }

}

#[async_trait]
impl Storage for MinioStorage {
    async fn put(&self, path: &str, content: &[u8], content_type: &str) -> Result<StorageMetadata> {
        let body = ByteStream::from(content.to_vec());
        let hash = sha256_hash_hex(content);

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(path)
            .body(body)
            .content_type(content_type)
            .send()
            .await
            .map_err(|e| Error::StorageError(format!("Failed to upload: {}", e)))?;

        debug!("Uploaded to MinIO: {} ({} bytes)", path, content.len());

        Ok(StorageMetadata::new(
            path.to_string(),
            content.len() as u64,
            content_type.to_string(),
            hash,
        ))
    }

    async fn get(&self, path: &str) -> Result<StorageObject> {
        let response = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(path)
            .send()
            .await
            .map_err(|e| {
                let err_str = e.to_string();
                if err_str.contains("NoSuchKey") || err_str.contains("not found") {
                    Error::FileNotFound
                } else {
                    Error::StorageError(format!("Failed to download: {}", e))
                }
            })?;

        let content_type = response
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let content = response
            .body
            .collect()
            .await
            .map_err(|e| Error::StorageError(format!("Failed to read body: {}", e)))?
            .to_vec();

        let hash = sha256_hash_hex(&content);

        let metadata = StorageMetadata::new(
            path.to_string(),
            content.len() as u64,
            content_type,
            hash,
        );

        debug!("Downloaded from MinIO: {} ({} bytes)", path, content.len());

        Ok(StorageObject::new(metadata, content))
    }

    async fn delete(&self, path: &str) -> Result<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(path)
            .send()
            .await
            .map_err(|e| Error::StorageError(format!("Failed to delete: {}", e)))?;

        debug!("Deleted from MinIO: {}", path);

        Ok(())
    }

    async fn exists(&self, path: &str) -> Result<bool> {
        match self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(path)
            .send()
            .await
        {
            Ok(_) => Ok(true),
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("NotFound") || err_str.contains("not found") {
                    Ok(false)
                } else {
                    Err(Error::StorageError(format!(
                        "Failed to check existence: {}",
                        e
                    )))
                }
            }
        }
    }

    async fn list(&self, prefix: &str) -> Result<Vec<StorageMetadata>> {
        let response = self
            .client
            .list_objects_v2()
            .bucket(&self.bucket)
            .prefix(prefix)
            .send()
            .await
            .map_err(|e| Error::StorageError(format!("Failed to list objects: {}", e)))?;

        let mut results = Vec::new();

        if let Some(contents) = response.contents {
            for obj in contents {
                if let Some(key) = obj.key {
                    results.push(StorageMetadata {
                        path: key,
                        size: obj.size.unwrap_or(0) as u64,
                        content_type: "application/octet-stream".to_string(),
                        hash: String::new(),
                        created_at: Utc::now(),
                        modified_at: Utc::now(),
                    });
                }
            }
        }

        Ok(results)
    }

    async fn get_metadata(&self, path: &str) -> Result<StorageMetadata> {
        let response = self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(path)
            .send()
            .await
            .map_err(|e| {
                let err_str = e.to_string();
                if err_str.contains("NotFound") || err_str.contains("not found") {
                    Error::FileNotFound
                } else {
                    Error::StorageError(format!("Failed to get metadata: {}", e))
                }
            })?;

        Ok(StorageMetadata {
            path: path.to_string(),
            size: response.content_length.unwrap_or(0) as u64,
            content_type: response
                .content_type
                .unwrap_or_else(|| "application/octet-stream".to_string()),
            hash: String::new(),
            created_at: Utc::now(),
            modified_at: Utc::now(),
        })
    }
}

#[cfg(test)]
mod tests {
    // MinIO 测试需要运行中的 MinIO 实例
    // 这些测试默认标记为忽略

    use super::*;

    fn get_test_config() -> Option<MinioStorageConfig> {
        // 仅在配置了 MinIO 时运行
        std::env::var("STORAGE_ENDPOINT").ok()?;
        MinioStorageConfig::from_env()
    }

    #[tokio::test]
    #[ignore = "Requires running MinIO instance"]
    async fn test_minio_put_and_get() {
        let config = get_test_config().expect("MinIO config required");
        let storage = MinioStorage::new(config).await.unwrap();

        let content = b"Hello, MinIO!";
        let path = "test/hello.txt";

        let metadata = storage.put(path, content, "text/plain").await.unwrap();
        assert_eq!(metadata.size, content.len() as u64);

        let obj = storage.get(path).await.unwrap();
        assert_eq!(obj.content, content);

        // 清理
        storage.delete(path).await.unwrap();
    }
}
