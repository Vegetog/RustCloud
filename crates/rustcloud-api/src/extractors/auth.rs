//! Authentication extractor

use axum::{
    async_trait,
    extract::FromRequestParts,
    http::request::Parts,
};
use rustcloud_auth::AuthenticatedUser;

use crate::error::ApiError;

/// Extractor for authenticated user from request extensions
///
/// This extractor retrieves the `AuthenticatedUser` that was injected
/// by the authentication middleware.
///
/// # Example
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
