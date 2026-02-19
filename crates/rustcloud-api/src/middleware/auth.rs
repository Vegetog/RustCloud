//! JWT 认证中间件

use axum::{
    body::Body,
    extract::State,
    http::{header::AUTHORIZATION, Request},
    middleware::Next,
    response::Response,
};
use rustcloud_auth::AuthenticatedUser;
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::AppState;

/// 用于校验 JWT 令牌的认证中间件
///
/// 该中间件：
/// 1. 提取 Authorization 请求头
/// 2. 使用 JwtManager 校验 Bearer 令牌
/// 3. 检查令牌是否在黑名单中
/// 4. 将 AuthenticatedUser 注入请求扩展
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, ApiError> {
    // 1. 提取 Authorization 请求头
    let auth_header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("Missing authorization header"))?;

    // 2. 解析 Bearer 令牌
    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or_else(|| ApiError::unauthorized("Invalid authorization header format"))?;

    // 3. 验证 JWT 令牌
    let claims = state
        .jwt_manager
        .verify_access_token(token)
        .map_err(|e| {
            tracing::debug!("Token verification failed: {:?}", e);
            match e {
                rustcloud_core::Error::TokenExpired => ApiError::token_expired(),
                _ => ApiError::invalid_token(),
            }
        })?;

    // 4. 检查令牌是否被拉黑
    let mut session_manager = state.session_manager();
    if session_manager
        .is_token_blacklisted(&claims.jti)
        .await
        .unwrap_or(false)
    {
        return Err(ApiError::invalid_token());
    }

    // 5. 解析用户 ID
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| ApiError::invalid_token())?;

    // 6. 创建 AuthenticatedUser 并注入扩展
    let user = AuthenticatedUser {
        id: user_id,
        email: claims.email,
        token_id: claims.jti,
    };

    request.extensions_mut().insert(user);

    // 7. 继续执行下一个处理器
    Ok(next.run(request).await)
}
