//! 应用程序配置

use crate::error::{Error, Result};

#[derive(Debug, Clone)]
pub struct AppConfig {
    // 服务器
    pub server_host: String,
    pub server_port: u16,

    // 数据库
    pub database_url: String,
    pub database_max_connections: u32,
    pub database_min_connections: u32,

    // Redis 缓存
    pub redis_url: String,

    // 存储
    pub storage_backend: StorageBackend,
    pub storage_endpoint: Option<String>,
    pub storage_bucket: String,
    pub storage_access_key: Option<String>,
    pub storage_secret_key: Option<String>,

    // JWT 令牌
    pub jwt_secret: String,
    pub jwt_access_token_ttl: u64,
    pub jwt_refresh_token_ttl: u64,

    // Argon2 参数
    pub argon2_memory: u32,
    pub argon2_iterations: u32,
    pub argon2_parallelism: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub enum StorageBackend {
    Local,
    Minio,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        Ok(Self {
            // 服务器
            server_host: std::env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            server_port: std::env::var("SERVER_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .map_err(|_| Error::ConfigError("Invalid SERVER_PORT".to_string()))?,

            // 数据库
            database_url: std::env::var("DATABASE_URL")
                .map_err(|_| Error::ConfigError("DATABASE_URL is required".to_string()))?,
            database_max_connections: std::env::var("DATABASE_MAX_CONNECTIONS")
                .unwrap_or_else(|_| "20".to_string())
                .parse()
                .unwrap_or(20),
            database_min_connections: std::env::var("DATABASE_MIN_CONNECTIONS")
                .unwrap_or_else(|_| "5".to_string())
                .parse()
                .unwrap_or(5),

            // Redis 缓存
            redis_url: std::env::var("REDIS_URL")
                .map_err(|_| Error::ConfigError("REDIS_URL is required".to_string()))?,

            // 存储
            storage_backend: match std::env::var("STORAGE_BACKEND")
                .unwrap_or_else(|_| "local".to_string())
                .as_str()
            {
                "minio" => StorageBackend::Minio,
                _ => StorageBackend::Local,
            },
            storage_endpoint: std::env::var("STORAGE_ENDPOINT").ok(),
            storage_bucket: std::env::var("STORAGE_BUCKET")
                .unwrap_or_else(|_| "rustcloud".to_string()),
            storage_access_key: std::env::var("STORAGE_ACCESS_KEY").ok(),
            storage_secret_key: std::env::var("STORAGE_SECRET_KEY").ok(),

            // JWT 令牌
            jwt_secret: std::env::var("JWT_SECRET")
                .map_err(|_| Error::ConfigError("JWT_SECRET is required".to_string()))?,
            jwt_access_token_ttl: std::env::var("JWT_ACCESS_TOKEN_TTL")
                .unwrap_or_else(|_| "3600".to_string())
                .parse()
                .unwrap_or(3600),
            jwt_refresh_token_ttl: std::env::var("JWT_REFRESH_TOKEN_TTL")
                .unwrap_or_else(|_| "604800".to_string())
                .parse()
                .unwrap_or(604800),

            // Argon2 参数
            argon2_memory: std::env::var("ARGON2_MEMORY")
                .unwrap_or_else(|_| "65536".to_string())
                .parse()
                .unwrap_or(65536),
            argon2_iterations: std::env::var("ARGON2_ITERATIONS")
                .unwrap_or_else(|_| "3".to_string())
                .parse()
                .unwrap_or(3),
            argon2_parallelism: std::env::var("ARGON2_PARALLELISM")
                .unwrap_or_else(|_| "4".to_string())
                .parse()
                .unwrap_or(4),
        })
    }

    pub fn server_addr(&self) -> String {
        format!("{}:{}", self.server_host, self.server_port)
    }
}
