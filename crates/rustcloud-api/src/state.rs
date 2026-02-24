//! 应用状态管理

use std::path::PathBuf;
use std::sync::Arc;

use redis::aio::ConnectionManager as RedisConnectionManager;
use rustcloud_auth::{AuthConfig, JwtManager, SessionManager};
use rustcloud_core::config::{AppConfig, StorageBackend};
use rustcloud_database::{create_connection, DatabaseConfig, DatabaseConnection};
use rustcloud_storage::{LocalStorage, LocalStorageConfig, MinioStorage, MinioStorageConfig, Storage};

use crate::error::ApiError;

/// 最大文件上传大小（100MB）
pub const MAX_FILE_SIZE: usize = 100 * 1024 * 1024;

/// 所有处理器共享的应用状态
#[derive(Clone)]
pub struct AppState {
    /// 数据库连接池
    pub db: Arc<DatabaseConnection>,
    /// Redis 连接管理器
    pub redis: RedisConnectionManager,
    /// 对象存储服务
    pub storage: Arc<dyn Storage>,
    /// JWT 令牌管理器
    pub jwt_manager: Arc<JwtManager>,
    /// 应用配置
    pub config: Arc<AppConfig>,
}

impl AppState {
    /// 从配置初始化应用状态
    pub async fn new(config: AppConfig) -> Result<Self, ApiError> {
        // 1. 创建数据库连接
        let db_config = DatabaseConfig::from_env(&config.database_url);
        let db = create_connection(&db_config)
            .await
            .map_err(|e| ApiError::internal(format!("Failed to connect to database: {}", e)))?;

        tracing::info!("数据库连接已建立");

        // 2. 创建 Redis 连接
        let redis_client = redis::Client::open(config.redis_url.as_str())
            .map_err(|e| ApiError::internal(format!("Failed to create Redis client: {}", e)))?;
        let redis = redis_client
            .get_connection_manager()
            .await
            .map_err(|e| ApiError::internal(format!("Failed to connect to Redis: {}", e)))?;

        tracing::info!("Redis connection established");

        // 3. 创建存储后端
        let storage: Arc<dyn Storage> = match config.storage_backend {
            StorageBackend::Local => {
                let local_config = LocalStorageConfig {
                    base_path: PathBuf::from("./data/storage"),
                    max_file_size: MAX_FILE_SIZE as u64,
                    directory_depth: 2,
                };
                Arc::new(
                    LocalStorage::new(local_config)
                        .await
                        .map_err(|e| ApiError::internal(format!("Failed to init local storage: {}", e)))?,
                )
            }
            StorageBackend::Minio => {
                let minio_config = MinioStorageConfig {
                    endpoint: config.storage_endpoint.clone().unwrap_or_else(|| "http://localhost:9000".to_string()),
                    bucket: config.storage_bucket.clone(),
                    access_key: config.storage_access_key.clone().unwrap_or_default(),
                    secret_key: config.storage_secret_key.clone().unwrap_or_default(),
                    region: std::env::var("STORAGE_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
                    use_ssl: std::env::var("STORAGE_USE_SSL").map(|v| v == "true").unwrap_or(false),
                };
                Arc::new(
                    MinioStorage::new(minio_config)
                        .await
                        .map_err(|e| ApiError::internal(format!("Failed to init MinIO storage: {}", e)))?,
                )
            }
        };

        let backend_name = match config.storage_backend {
            StorageBackend::Local => "local",
            StorageBackend::Minio => "minio",
        };
        tracing::info!("Storage backend initialized: {}", backend_name);

        // 4. 创建 JWT 管理器
        let auth_config = AuthConfig::from_app_config(&config);
        let jwt_manager = Arc::new(
            JwtManager::new(auth_config)
                .map_err(|e| ApiError::internal(format!("Failed to create JWT manager: {}", e)))?,
        );

        tracing::info!("JWT manager initialized");

        Ok(Self {
            db: Arc::new(db),
            redis,
            storage,
            jwt_manager,
            config: Arc::new(config),
        })
    }

    /// 创建新的 SessionManager 实例
    /// 注意：SessionManager 需要对 Redis 的可变访问，因此每次都创建新实例
    pub fn session_manager(&self) -> SessionManager {
        let auth_config = AuthConfig::from_app_config(&self.config);
        SessionManager::new(self.redis.clone(), auth_config)
    }
}
