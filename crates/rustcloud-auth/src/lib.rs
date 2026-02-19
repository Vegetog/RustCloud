//! RustCloud 认证模块
//!
//! JWT 令牌管理、密码处理和会话管理。
//!
//! # 功能特性
//!
//! - JWT 访问令牌/刷新令牌的生成与验证
//! - 带族跟踪的令牌轮换，用于重放检测
//! - 基于 Redis 的会话管理，支持每用户数量限制
//! - 密码强度验证
//! - Argon2id 密码哈希（通过 rustcloud-crypto）
//!
//! # 使用示例
//!
//! ```ignore
//! use rustcloud_auth::{AuthConfig, JwtManager, validate_password_strength};
//!
//! // 创建 JWT 管理器
//! let config = AuthConfig::from_app_config(&app_config);
//! let jwt_manager = JwtManager::new(config)?;
//!
//! // 生成令牌对
//! let (token_pair, access_jti, refresh_jti) =
//!     jwt_manager.generate_token_pair(user_id, email, &family)?;
//!
//! // 验证密码强度
//! let validation = validate_password_strength("Password123", 8);
//! if !validation.is_valid {
//!     println!("密码错误: {}", validation.error_message());
//! }
//! ```

mod claims;
mod config;
mod jwt;
mod password;
mod session;
mod types;

// 公开导出 - 配置
pub use config::AuthConfig;

// 公开导出 - JWT
pub use claims::{AccessTokenClaims, RefreshTokenClaims};
pub use jwt::JwtManager;

// 公开导出 - 会话
pub use session::SessionManager;
pub use types::{AuthenticatedUser, Session, TokenPair};

// 公开导出 - 密码
pub use password::{check_password, create_password_hash, validate_password_strength};
pub use types::{PasswordError, PasswordValidation};

// 从 rustcloud-crypto 重新导出以便使用
pub use rustcloud_crypto::{hash_password, verify_password};

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn test_config() -> AuthConfig {
        AuthConfig {
            jwt_secret: "test_secret_key_at_least_32_chars_long".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn test_full_auth_flow() {
        let config = test_config();
        let jwt_manager = JwtManager::new(config).unwrap();

        let user_id = Uuid::new_v4();
        let email = "test@example.com";
        let family = Uuid::new_v4().to_string();

        // 生成初始令牌对
        let (token_pair, access_jti, refresh_jti) = jwt_manager
            .generate_token_pair(user_id, email, &family)
            .unwrap();

        // 验证访问令牌
        let access_claims = jwt_manager
            .verify_access_token(&token_pair.access_token)
            .unwrap();
        assert_eq!(access_claims.sub, user_id.to_string());
        assert_eq!(access_claims.email, email);
        assert_eq!(access_claims.jti, access_jti);

        // 验证刷新令牌
        let refresh_claims = jwt_manager
            .verify_refresh_token(&token_pair.refresh_token)
            .unwrap();
        assert_eq!(refresh_claims.sub, user_id.to_string());
        assert_eq!(refresh_claims.family, family);
        assert_eq!(refresh_claims.jti, refresh_jti);

        // 刷新令牌
        let (new_pair, new_access_jti, new_refresh_jti) = jwt_manager
            .refresh_tokens(&refresh_claims, email)
            .unwrap();

        // 新令牌应具有相同族但不同的 jti
        let new_refresh_claims = jwt_manager
            .verify_refresh_token(&new_pair.refresh_token)
            .unwrap();
        assert_eq!(new_refresh_claims.family, family);
        assert_ne!(new_refresh_claims.jti, refresh_jti);
        assert_eq!(new_refresh_claims.jti, new_refresh_jti);

        // 新访问令牌应可正常使用
        let new_access_claims = jwt_manager
            .verify_access_token(&new_pair.access_token)
            .unwrap();
        assert_eq!(new_access_claims.jti, new_access_jti);
    }

    #[test]
    fn test_password_validation_and_hash() {
        // 测试有效密码
        let validation = validate_password_strength("SecurePass123", 8);
        assert!(validation.is_valid);

        // 测试无效密码
        let validation = validate_password_strength("weak", 8);
        assert!(!validation.is_valid);
        assert!(validation.errors.len() >= 2);

        // 测试密码哈希
        let password = "SecurePass123";
        let hash = create_password_hash(password).unwrap();

        assert!(check_password(password, &hash).unwrap());
        assert!(!check_password("WrongPass", &hash).unwrap());
    }
}
