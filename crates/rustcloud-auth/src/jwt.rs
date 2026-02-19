//! JWT 令牌管理

use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rustcloud_core::error::{Error, Result};
use uuid::Uuid;

use crate::claims::{AccessTokenClaims, RefreshTokenClaims};
use crate::config::AuthConfig;
use crate::types::TokenPair;

/// JWT 令牌管理器
pub struct JwtManager {
    config: AuthConfig,
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
}

impl JwtManager {
    /// 创建新的 JWT 管理器
    pub fn new(config: AuthConfig) -> Result<Self> {
        config.validate()?;
        let encoding_key = EncodingKey::from_secret(config.jwt_secret.as_bytes());
        let decoding_key = DecodingKey::from_secret(config.jwt_secret.as_bytes());
        Ok(Self {
            config,
            encoding_key,
            decoding_key,
        })
    }

    /// 为用户生成令牌对
    ///
    /// 返回 (TokenPair, access_jti, refresh_jti)
    pub fn generate_token_pair(
        &self,
        user_id: Uuid,
        email: &str,
        token_family: &str,
    ) -> Result<(TokenPair, String, String)> {
        let now = Utc::now();
        let access_jti = Uuid::new_v4().to_string();
        let refresh_jti = Uuid::new_v4().to_string();

        let access_exp = now + Duration::from_std(self.config.access_token_ttl).unwrap();
        let refresh_exp = now + Duration::from_std(self.config.refresh_token_ttl).unwrap();

        // 创建访问令牌
        let access_claims = AccessTokenClaims {
            sub: user_id.to_string(),
            email: email.to_string(),
            exp: access_exp.timestamp(),
            iat: now.timestamp(),
            jti: access_jti.clone(),
        };

        let access_token = encode(&Header::default(), &access_claims, &self.encoding_key)
            .map_err(|e| Error::EncryptionFailed(format!("Failed to encode access token: {}", e)))?;

        // 创建刷新令牌
        let refresh_claims = RefreshTokenClaims {
            sub: user_id.to_string(),
            exp: refresh_exp.timestamp(),
            iat: now.timestamp(),
            jti: refresh_jti.clone(),
            family: token_family.to_string(),
        };

        let refresh_token = encode(&Header::default(), &refresh_claims, &self.encoding_key)
            .map_err(|e| {
                Error::EncryptionFailed(format!("Failed to encode refresh token: {}", e))
            })?;

        let token_pair = TokenPair::new(access_token, refresh_token, access_exp, refresh_exp);

        Ok((token_pair, access_jti, refresh_jti))
    }

    /// 验证并解码访问令牌
    pub fn verify_access_token(&self, token: &str) -> Result<AccessTokenClaims> {
        let validation = Validation::default();
        let token_data = decode::<AccessTokenClaims>(token, &self.decoding_key, &validation)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => Error::TokenExpired,
                _ => Error::InvalidToken,
            })?;
        Ok(token_data.claims)
    }

    /// 验证并解码刷新令牌
    pub fn verify_refresh_token(&self, token: &str) -> Result<RefreshTokenClaims> {
        let validation = Validation::default();
        let token_data = decode::<RefreshTokenClaims>(token, &self.decoding_key, &validation)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => Error::TokenExpired,
                _ => Error::InvalidToken,
            })?;
        Ok(token_data.claims)
    }

    /// 使用刷新令牌生成新令牌对（令牌轮换）
    ///
    /// 新令牌将与原刷新令牌属于同一族。
    /// 返回 (TokenPair, new_access_jti, new_refresh_jti)
    pub fn refresh_tokens(
        &self,
        claims: &RefreshTokenClaims,
        email: &str,
    ) -> Result<(TokenPair, String, String)> {
        let user_id = Uuid::parse_str(&claims.sub)
            .map_err(|_| Error::InvalidToken)?;

        self.generate_token_pair(user_id, email, &claims.family)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> AuthConfig {
        AuthConfig {
            jwt_secret: "test_secret_key_at_least_32_chars_long".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn test_generate_and_verify_access_token() {
        let manager = JwtManager::new(test_config()).unwrap();
        let user_id = Uuid::new_v4();
        let email = "test@example.com";
        let family = Uuid::new_v4().to_string();

        let (token_pair, _, _) = manager
            .generate_token_pair(user_id, email, &family)
            .unwrap();

        let claims = manager
            .verify_access_token(&token_pair.access_token)
            .unwrap();
        assert_eq!(claims.sub, user_id.to_string());
        assert_eq!(claims.email, email);
    }

    #[test]
    fn test_generate_and_verify_refresh_token() {
        let manager = JwtManager::new(test_config()).unwrap();
        let user_id = Uuid::new_v4();
        let email = "test@example.com";
        let family = Uuid::new_v4().to_string();

        let (token_pair, _, _) = manager
            .generate_token_pair(user_id, email, &family)
            .unwrap();

        let claims = manager
            .verify_refresh_token(&token_pair.refresh_token)
            .unwrap();
        assert_eq!(claims.sub, user_id.to_string());
        assert_eq!(claims.family, family);
    }

    #[test]
    fn test_invalid_token() {
        let manager = JwtManager::new(test_config()).unwrap();
        let result = manager.verify_access_token("invalid.token.here");
        assert!(matches!(result, Err(Error::InvalidToken)));
    }

    #[test]
    fn test_token_refresh() {
        let manager = JwtManager::new(test_config()).unwrap();
        let user_id = Uuid::new_v4();
        let email = "test@example.com";
        let family = Uuid::new_v4().to_string();

        let (original, _, _) = manager
            .generate_token_pair(user_id, email, &family)
            .unwrap();

        let refresh_claims = manager
            .verify_refresh_token(&original.refresh_token)
            .unwrap();

        let (new_pair, _, _) = manager.refresh_tokens(&refresh_claims, email).unwrap();

        // 新令牌应与旧令牌不同
        assert_ne!(original.access_token, new_pair.access_token);
        assert_ne!(original.refresh_token, new_pair.refresh_token);

        // 但应属于同一族
        let new_refresh_claims = manager
            .verify_refresh_token(&new_pair.refresh_token)
            .unwrap();
        assert_eq!(refresh_claims.family, new_refresh_claims.family);
    }

    #[test]
    fn test_short_jwt_secret_rejected() {
        let config = AuthConfig {
            jwt_secret: "short".to_string(),
            ..Default::default()
        };
        let result = JwtManager::new(config);
        assert!(result.is_err());
    }

    #[test]
    fn test_token_jti_unique() {
        let manager = JwtManager::new(test_config()).unwrap();
        let user_id = Uuid::new_v4();
        let email = "test@example.com";
        let family = Uuid::new_v4().to_string();

        let (_, jti1, _) = manager
            .generate_token_pair(user_id, email, &family)
            .unwrap();
        let (_, jti2, _) = manager
            .generate_token_pair(user_id, email, &family)
            .unwrap();

        // 每个令牌应有唯一的 jti
        assert_ne!(jti1, jti2);
    }
}
