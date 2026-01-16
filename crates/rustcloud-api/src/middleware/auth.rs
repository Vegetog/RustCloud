//! JWT authentication middleware

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

/// Authentication middleware that validates JWT tokens
///
/// This middleware:
/// 1. Extracts the Authorization header
/// 2. Validates the Bearer token using JwtManager
/// 3. Checks if the token is blacklisted
/// 4. Injects AuthenticatedUser into request extensions
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, ApiError> {
    // 1. Extract Authorization header
    let auth_header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("Missing authorization header"))?;

    // 2. Parse Bearer token
    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or_else(|| ApiError::unauthorized("Invalid authorization header format"))?;

    // 3. Verify JWT token
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

    // 4. Check if token is blacklisted
    let mut session_manager = state.session_manager();
    if session_manager
        .is_token_blacklisted(&claims.jti)
        .await
        .unwrap_or(false)
    {
        return Err(ApiError::invalid_token());
    }

    // 5. Parse user ID
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| ApiError::invalid_token())?;

    // 6. Create AuthenticatedUser and inject into extensions
    let user = AuthenticatedUser {
        id: user_id,
        email: claims.email,
        token_id: claims.jti,
    };

    request.extensions_mut().insert(user);

    // 7. Continue to next handler
    Ok(next.run(request).await)
}
