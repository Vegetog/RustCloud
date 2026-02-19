//! 认证配置

use rustcloud_core::config::AppConfig;
use rustcloud_core::error::{Error, Result};
use std::time::Duration;

/// 认证配置
#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// JWT 签名密钥（至少 32 字节 / 256 位）
    pub jwt_secret: String,
    /// 访问令牌有效期
    pub access_token_ttl: Duration,
    /// 刷新令牌有效期
    pub refresh_token_ttl: Duration,
    /// 每个用户允许的最大并发会话数
    pub max_sessions_per_user: u32,
    /// 最小密码长度
    pub password_min_length: usize,
}

impl AuthConfig {
    /// 从 AppConfig 创建 AuthConfig
    pub fn from_app_config(config: &AppConfig) -> Self {
        Self {
            jwt_secret: config.jwt_secret.clone(),
            access_token_ttl: Duration::from_secs(config.jwt_access_token_ttl),
            refresh_token_ttl: Duration::from_secs(config.jwt_refresh_token_ttl),
            max_sessions_per_user: 5,
            password_min_length: 8,
        }
    }

    /// 校验配置
    pub fn validate(&self) -> Result<()> {
        if self.jwt_secret.len() < 32 {
            return Err(Error::ConfigError(
                "JWT_SECRET must be at least 32 characters (256 bits)".to_string(),
            ));
        }
        Ok(())
    }
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            jwt_secret: String::new(),
            access_token_ttl: Duration::from_secs(3600),    // 1 hour
            refresh_token_ttl: Duration::from_secs(604800), // 7 days
            max_sessions_per_user: 5,
            password_min_length: 8,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_config() {
        let config = AuthConfig {
            jwt_secret: "a".repeat(32),
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_short_secret_rejected() {
        let config = AuthConfig {
            jwt_secret: "short".to_string(),
            ..Default::default()
        };
        assert!(config.validate().is_err());
    }
}
