//! 认证类型

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 认证成功后返回的令牌对
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPair {
    /// JWT 访问令牌
    pub access_token: String,
    /// JWT 刷新令牌
    pub refresh_token: String,
    /// 访问令牌过期时间
    pub access_expires_at: DateTime<Utc>,
    /// 刷新令牌过期时间
    pub refresh_expires_at: DateTime<Utc>,
    /// 令牌类型（固定为 "Bearer"）
    pub token_type: String,
}

impl TokenPair {
    pub fn new(
        access_token: String,
        refresh_token: String,
        access_expires_at: DateTime<Utc>,
        refresh_expires_at: DateTime<Utc>,
    ) -> Self {
        Self {
            access_token,
            refresh_token,
            access_expires_at,
            refresh_expires_at,
            token_type: "Bearer".to_string(),
        }
    }
}

/// 从有效令牌中提取的用户信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticatedUser {
    /// 用户 ID
    pub id: Uuid,
    /// 用户邮箱
    pub email: String,
    /// 令牌 ID（jti）
    pub token_id: String,
}

/// 存储在 Redis 中的会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    /// 会话 ID
    pub id: String,
    /// 用户 ID
    pub user_id: Uuid,
    /// 当前刷新令牌 ID（jti）
    pub refresh_token_id: String,
    /// 用于重放检测的令牌族
    pub token_family: String,
    /// 客户端 IP 地址
    pub ip_address: String,
    /// 客户端 User-Agent
    pub user_agent: String,
    /// 会话创建时间
    pub created_at: DateTime<Utc>,
    /// 最后活跃时间
    pub last_active_at: DateTime<Utc>,
}

impl Session {
    pub fn new(
        user_id: Uuid,
        token_family: String,
        refresh_token_id: String,
        ip_address: String,
        user_agent: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            user_id,
            refresh_token_id,
            token_family,
            ip_address,
            user_agent,
            created_at: now,
            last_active_at: now,
        }
    }
}

/// 密码校验结果
#[derive(Debug, Clone)]
pub struct PasswordValidation {
    /// 密码是否满足所有要求
    pub is_valid: bool,
    /// 校验错误列表（通过时为空）
    pub errors: Vec<PasswordError>,
}

/// 密码校验错误类型
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PasswordError {
    /// 密码过短
    TooShort { min: usize, actual: usize },
    /// 缺少大写字母
    MissingUppercase,
    /// 缺少小写字母
    MissingLowercase,
    /// 缺少数字
    MissingDigit,
}

impl std::fmt::Display for PasswordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PasswordError::TooShort { min, actual } => {
                write!(
                    f,
                    "Password must be at least {} characters (got {})",
                    min, actual
                )
            }
            PasswordError::MissingUppercase => {
                write!(f, "Password must contain at least one uppercase letter")
            }
            PasswordError::MissingLowercase => {
                write!(f, "Password must contain at least one lowercase letter")
            }
            PasswordError::MissingDigit => {
                write!(f, "Password must contain at least one digit")
            }
        }
    }
}

impl PasswordValidation {
    /// 将所有错误信息合并为单个字符串
    pub fn error_message(&self) -> String {
        self.errors
            .iter()
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
            .join("; ")
    }
}
