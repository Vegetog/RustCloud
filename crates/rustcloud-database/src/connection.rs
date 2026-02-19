//! 数据库连接管理

use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use std::time::Duration;

use crate::error::{DatabaseError, DbResult};

/// 数据库连接配置
#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connect_timeout: Duration,
    pub idle_timeout: Duration,
    pub max_lifetime: Duration,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            max_connections: 20,
            min_connections: 5,
            connect_timeout: Duration::from_secs(10),
            idle_timeout: Duration::from_secs(300),
            max_lifetime: Duration::from_secs(1800),
        }
    }
}

impl DatabaseConfig {
    /// 从应用配置创建数据库配置
    pub fn from_env(database_url: &str) -> Self {
        Self {
            url: database_url.to_string(),
            ..Default::default()
        }
    }

    /// 使用自定义连接池参数创建配置
    pub fn with_pool_settings(
        database_url: &str,
        max_connections: u32,
        min_connections: u32,
    ) -> Self {
        Self {
            url: database_url.to_string(),
            max_connections,
            min_connections,
            ..Default::default()
        }
    }
}

/// 创建数据库连接池
pub async fn create_connection(config: &DatabaseConfig) -> DbResult<DatabaseConnection> {
    let mut opt = ConnectOptions::new(&config.url);

    opt.max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .connect_timeout(config.connect_timeout)
        .idle_timeout(config.idle_timeout)
        .max_lifetime(config.max_lifetime)
        .sqlx_logging(true)
        .sqlx_logging_level(tracing::log::LevelFilter::Debug);

    let conn = Database::connect(opt)
        .await
        .map_err(|e| DatabaseError::ConnectionFailed(e.to_string()))?;

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = DatabaseConfig::default();
        assert_eq!(config.max_connections, 20);
        assert_eq!(config.min_connections, 5);
    }

    #[test]
    fn test_from_env() {
        let config = DatabaseConfig::from_env("postgres://localhost/test");
        assert_eq!(config.url, "postgres://localhost/test");
    }

    #[test]
    fn test_with_pool_settings() {
        let config = DatabaseConfig::with_pool_settings("postgres://localhost/test", 10, 2);
        assert_eq!(config.max_connections, 10);
        assert_eq!(config.min_connections, 2);
    }
}
