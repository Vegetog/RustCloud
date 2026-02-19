//! 认证提取器

use axum::{
    async_trait,
    extract::FromRequestParts,
    http::request::Parts,
};
use rustcloud_auth::AuthenticatedUser;

use crate::error::ApiError;

/// 从请求扩展中提取已认证用户的提取器
///
/// 该提取器获取已注入的 `AuthenticatedUser`
/// 该对象由认证中间件注入。
///
/// # 示例
///
/// ```ignore
/// async fn handler(AuthUser(user): AuthUser) -> impl IntoResponse {
///     format!("Hello, {}", user.email)
/// }
/// ```
pub struct AuthUser(pub AuthenticatedUser);

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<AuthenticatedUser>()
            .cloned()
            .map(AuthUser)
            .ok_or_else(|| ApiError::unauthorized("Not authenticated"))
    }
}
