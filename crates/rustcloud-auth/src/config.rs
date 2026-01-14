//! Authentication configuration

use rustcloud_core::config::AppConfig;
use rustcloud_core::error::{Error, Result};
use std::time::Duration;

/// Authentication configuration
#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// JWT signing secret (at least 32 bytes / 256 bits)
    pub jwt_secret: String,
    /// Access token time-to-live
    pub access_token_ttl: Duration,
    /// Refresh token time-to-live
    pub refresh_token_ttl: Duration,
    /// Maximum concurrent sessions per user
    pub max_sessions_per_user: u32,
    /// Minimum password length
    pub password_min_length: usize,
}

impl AuthConfig {
    /// Create AuthConfig from AppConfig
    pub fn from_app_config(config: &AppConfig) -> Self {
        Self {
            jwt_secret: config.jwt_secret.clone(),
            access_token_ttl: Duration::from_secs(config.jwt_access_token_ttl),
            refresh_token_ttl: Duration::from_secs(config.jwt_refresh_token_ttl),
            max_sessions_per_user: 5,
            password_min_length: 8,
        }
    }

    /// Validate configuration
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
