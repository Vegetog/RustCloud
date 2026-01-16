//! Validated JSON extractor

use axum::{
    async_trait,
    extract::{rejection::JsonRejection, FromRequest, Request},
    Json,
};
use serde::de::DeserializeOwned;
use validator::Validate;

use crate::error::ApiError;

/// JSON extractor with validation
///
/// This extractor deserializes JSON and validates it using the `validator` crate.
///
/// # Example
///
/// ```ignore
/// #[derive(Deserialize, Validate)]
/// struct CreateUser {
///     #[validate(email)]
///     email: String,
///     #[validate(length(min = 8))]
///     password: String,
/// }
///
/// async fn handler(ValidatedJson(payload): ValidatedJson<CreateUser>) -> impl IntoResponse {
///     // payload is guaranteed to be valid
/// }
/// ```
pub struct ValidatedJson<T>(pub T);

#[async_trait]
impl<S, T> FromRequest<S> for ValidatedJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned + Validate,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        // First, extract JSON
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(|e: JsonRejection| {
                ApiError::bad_request(format!("Invalid JSON: {}", e))
            })?;

        // Then, validate
        value.validate().map_err(|e| {
            let errors: Vec<String> = e
                .field_errors()
                .iter()
                .flat_map(|(field, errors)| {
                    errors.iter().map(move |error| {
                        format!(
                            "{}: {}",
                            field,
                            error.message.as_ref().map(|m| m.as_ref()).unwrap_or("invalid")
                        )
                    })
                })
                .collect();
            ApiError::bad_request(errors.join(", "))
        })?;

        Ok(ValidatedJson(value))
    }
}
