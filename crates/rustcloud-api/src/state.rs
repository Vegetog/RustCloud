//! Application state management

use std::path::PathBuf;
use std::sync::Arc;

use redis::aio::ConnectionManager as RedisConnectionManager;
use rustcloud_auth::{AuthConfig, JwtManager, SessionManager};
use rustcloud_core::config::{AppConfig, StorageBackend};
use rustcloud_database::{create_connection, DatabaseConfig, DatabaseConnection};
use rustcloud_storage::{LocalStorage, LocalStorageConfig, MinioStorage, MinioStorageConfig, Storage};

use crate::error::ApiError;

/// Application state shared across all handlers
#[derive(Clone)]
pub struct AppState {
    /// Database connection pool
    pub db: Arc<DatabaseConnection>,
    /// Redis connection manager
    pub redis: RedisConnectionManager,
    /// Object storage service
    pub storage: Arc<dyn Storage>,
    /// JWT token manager
    pub jwt_manager: Arc<JwtManager>,
    /// Application configuration
    pub config: Arc<AppConfig>,
}

impl AppState {
    /// Initialize application state from configuration
    pub async fn new(config: AppConfig) -> Result<Self, ApiError> {
        // 1. Create database connection
        let db_config = DatabaseConfig::from_env(&config.database_url);
        let db = create_connection(&db_config)
            .await
            .map_err(|e| ApiError::internal(format!("Failed to connect to database: {}", e)))?;

        tracing::info!("Database connection established");

        // 2. Create Redis connection
        let redis_client = redis::Client::open(config.redis_url.as_str())
            .map_err(|e| ApiError::internal(format!("Failed to create Redis client: {}", e)))?;
        let redis = redis_client
            .get_connection_manager()
            .await
            .map_err(|e| ApiError::internal(format!("Failed to connect to Redis: {}", e)))?;

        tracing::info!("Redis connection established");

        // 3. Create storage backend
        let storage: Arc<dyn Storage> = match config.storage_backend {
            StorageBackend::Local => {
                let local_config = LocalStorageConfig {
                    base_path: PathBuf::from("./data/storage"),
                    max_file_size: 100 * 1024 * 1024, // 100MB
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

        // 4. Create JWT manager
        let auth_config = AuthConfig {
            jwt_secret: config.jwt_secret.clone(),
            access_token_ttl: std::time::Duration::from_secs(config.jwt_access_token_ttl),
            refresh_token_ttl: std::time::Duration::from_secs(config.jwt_refresh_token_ttl),
            max_sessions_per_user: 5,
            password_min_length: 8,
        };
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

    /// Create a new SessionManager instance
    /// Note: SessionManager requires mutable access to Redis, so we create a new instance each time
    pub fn session_manager(&self) -> SessionManager {
        let auth_config = AuthConfig {
            jwt_secret: self.config.jwt_secret.clone(),
            access_token_ttl: std::time::Duration::from_secs(self.config.jwt_access_token_ttl),
            refresh_token_ttl: std::time::Duration::from_secs(self.config.jwt_refresh_token_ttl),
            max_sessions_per_user: 5,
            password_min_length: 8,
        };
        SessionManager::new(self.redis.clone(), auth_config)
    }
}
