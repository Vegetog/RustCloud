//! RustCloud Auth Module
//!
//! JWT token management, password handling, and session management.
//!
//! # Features
//!
//! - JWT Access/Refresh token generation and verification
//! - Token rotation with family tracking for replay detection
//! - Redis-based session management with per-user limits
//! - Password strength validation
//! - Argon2id password hashing (via rustcloud-crypto)
//!
//! # Example
//!
//! ```ignore
//! use rustcloud_auth::{AuthConfig, JwtManager, validate_password_strength};
//!
//! // Create JWT manager
//! let config = AuthConfig::from_app_config(&app_config);
//! let jwt_manager = JwtManager::new(config)?;
//!
//! // Generate tokens
//! let (token_pair, access_jti, refresh_jti) =
//!     jwt_manager.generate_token_pair(user_id, email, &family)?;
//!
//! // Validate password strength
//! let validation = validate_password_strength("Password123", 8);
//! if !validation.is_valid {
//!     println!("Password errors: {}", validation.error_message());
//! }
//! ```

mod claims;
mod config;
mod jwt;
mod password;
mod session;
mod types;

// Public exports - Configuration
pub use config::AuthConfig;

// Public exports - JWT
pub use claims::{AccessTokenClaims, RefreshTokenClaims};
pub use jwt::JwtManager;

// Public exports - Session
pub use session::SessionManager;
pub use types::{AuthenticatedUser, Session, TokenPair};

// Public exports - Password
pub use password::{check_password, create_password_hash, validate_password_strength};
pub use types::{PasswordError, PasswordValidation};

// Re-export from rustcloud-crypto for convenience
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

        // Generate initial tokens
        let (token_pair, access_jti, refresh_jti) = jwt_manager
            .generate_token_pair(user_id, email, &family)
            .unwrap();

        // Verify access token
        let access_claims = jwt_manager
            .verify_access_token(&token_pair.access_token)
            .unwrap();
        assert_eq!(access_claims.sub, user_id.to_string());
        assert_eq!(access_claims.email, email);
        assert_eq!(access_claims.jti, access_jti);

        // Verify refresh token
        let refresh_claims = jwt_manager
            .verify_refresh_token(&token_pair.refresh_token)
            .unwrap();
        assert_eq!(refresh_claims.sub, user_id.to_string());
        assert_eq!(refresh_claims.family, family);
        assert_eq!(refresh_claims.jti, refresh_jti);

        // Refresh tokens
        let (new_pair, new_access_jti, new_refresh_jti) = jwt_manager
            .refresh_tokens(&refresh_claims, email)
            .unwrap();

        // New tokens should have same family but different jti
        let new_refresh_claims = jwt_manager
            .verify_refresh_token(&new_pair.refresh_token)
            .unwrap();
        assert_eq!(new_refresh_claims.family, family);
        assert_ne!(new_refresh_claims.jti, refresh_jti);
        assert_eq!(new_refresh_claims.jti, new_refresh_jti);

        // New access token should work
        let new_access_claims = jwt_manager
            .verify_access_token(&new_pair.access_token)
            .unwrap();
        assert_eq!(new_access_claims.jti, new_access_jti);
    }

    #[test]
    fn test_password_validation_and_hash() {
        // Test valid password
        let validation = validate_password_strength("SecurePass123", 8);
        assert!(validation.is_valid);

        // Test invalid password
        let validation = validate_password_strength("weak", 8);
        assert!(!validation.is_valid);
        assert!(validation.errors.len() >= 2);

        // Test password hashing
        let password = "SecurePass123";
        let hash = create_password_hash(password).unwrap();

        assert!(check_password(password, &hash).unwrap());
        assert!(!check_password("WrongPass", &hash).unwrap());
    }
}
