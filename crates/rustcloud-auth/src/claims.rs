//! JWT 令牌声明定义

use serde::{Deserialize, Serialize};

/// 访问令牌声明（短期，约 1 小时）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    /// 主题（sub）- 用户 ID（UUID 字符串）
    pub sub: String,
    /// 用户邮箱
    pub email: String,
    /// 过期时间（Unix 时间戳）
    pub exp: i64,
    /// 签发时间（Unix 时间戳）
    pub iat: i64,
    /// JWT ID（jti）- 唯一令牌标识 用于撤销
    pub jti: String,
}

/// 刷新令牌声明（长期，约 7 天）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshTokenClaims {
    /// 主题（sub）- 用户 ID（UUID 字符串）
    pub sub: String,
    /// 过期时间（Unix 时间戳）
    pub exp: i64,
    /// 签发时间（Unix 时间戳）
    pub iat: i64,
    /// JWT ID（jti）- 唯一令牌标识
    pub jti: String,
    /// 令牌族 ID - 用于重放检测
    pub family: String,
}
