//! Authentication handlers

use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use rustcloud_auth::{check_password, create_password_hash, validate_password_strength};
use rustcloud_database::{CreateUser, UserRepository, UserRepositoryTrait};

use crate::dto::{
    LoginRequest, LoginResponse, MeResponse, PublicKeyResponse, RefreshRequest, RefreshResponse,
    RegisterRequest, RegisterResponse, UserResponse,
};
use crate::error::ApiError;
use crate::extractors::{AuthUser, ValidatedJson};
use crate::response::ApiResponse;
use crate::state::AppState;

/// POST /api/v1/auth/register
///
/// Register a new user account
pub async fn register(
    State(state): State<AppState>,
    ValidatedJson(req): ValidatedJson<RegisterRequest>,
) -> Result<ApiResponse<RegisterResponse>, ApiError> {
    // 1. Validate password strength
    let validation = validate_password_strength(&req.password, 8);
    if !validation.is_valid {
        return Err(ApiError::bad_request(validation.error_message()));
    }

    // 2. Hash password
    let password_hash = create_password_hash(&req.password)
        .map_err(|e| ApiError::internal(format!("Failed to hash password: {}", e)))?;

    // 3. Create user in database
    let user_repo = UserRepository::new(state.db.clone());
    let user = user_repo
        .create(CreateUser {
            email: req.email.clone(),
            password_hash,
            salt: req.salt,
            public_key: req.public_key,
            encrypted_private_key: req.encrypted_private_key,
            private_key_nonce: req.private_key_nonce,
        })
        .await
        .map_err(|e| {
            tracing::error!("Failed to create user: {:?}", e);
            ApiError::from(e)
        })?;

    tracing::info!("User registered: {}", user.email);

    Ok(ApiResponse::success(RegisterResponse {
        user: UserResponse {
            id: user.id,
            email: user.email,
            public_key: user.public_key,
            created_at: user.created_at,
        },
    }))
}

/// POST /api/v1/auth/login
///
/// Authenticate user and return tokens
pub async fn login(
    State(state): State<AppState>,
    ValidatedJson(req): ValidatedJson<LoginRequest>,
) -> Result<ApiResponse<LoginResponse>, ApiError> {
    // 1. Find user by email
    let user_repo = UserRepository::new(state.db.clone());
    let user = user_repo
        .find_by_email(&req.email)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::unauthorized("Invalid credentials"))?;

    // 2. Verify password
    let password_valid = check_password(&req.password, &user.password_hash)
        .map_err(|e| ApiError::internal(format!("Password verification failed: {}", e)))?;

    if !password_valid {
        return Err(ApiError::unauthorized("Invalid credentials"));
    }

    // 3. Generate token family
    let token_family = Uuid::new_v4().to_string();

    // 4. Generate tokens
    let (token_pair, _access_jti, refresh_jti) = state
        .jwt_manager
        .generate_token_pair(user.id, &user.email, &token_family)
        .map_err(|e| ApiError::internal(format!("Failed to generate tokens: {}", e)))?;

    // 5. Create session in Redis
    let mut session_manager = state.session_manager();
    session_manager
        .create_session(
            user.id,
            token_family.clone(),
            refresh_jti,
            "unknown".to_string(), // TODO: Extract from request
            "unknown".to_string(), // TODO: Extract from request
        )
        .await
        .map_err(|e| ApiError::internal(format!("Failed to create session: {}", e)))?;

    let expires_in = state.config.jwt_access_token_ttl as i64;

    tracing::info!("User logged in: {}", user.email);

    Ok(ApiResponse::success(LoginResponse {
        access_token: token_pair.access_token,
        refresh_token: token_pair.refresh_token,
        expires_in,
        token_type: "Bearer".to_string(),
        user: UserResponse {
            id: user.id,
            email: user.email.clone(),
            public_key: user.public_key.clone(),
            created_at: user.created_at,
        },
        encrypted_private_key: user.encrypted_private_key,
        private_key_nonce: user.private_key_nonce,
        salt: user.salt,
    }))
}

/// POST /api/v1/auth/refresh
///
/// Refresh access token using refresh token
pub async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshRequest>,
) -> Result<ApiResponse<RefreshResponse>, ApiError> {
    // 1. Verify refresh token
    let claims = state
        .jwt_manager
        .verify_refresh_token(&req.refresh_token)
        .map_err(|e| {
            tracing::debug!("Refresh token verification failed: {:?}", e);
            match e {
                rustcloud_core::Error::TokenExpired => ApiError::token_expired(),
                _ => ApiError::invalid_token(),
            }
        })?;

    // 2. Validate token family (check for token reuse)
    let mut session_manager = state.session_manager();
    let is_valid = session_manager
        .validate_token_family(&claims.family, &claims.jti)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to validate token family: {}", e)))?;

    if !is_valid {
        // Possible token reuse attack - invalidate entire family
        tracing::warn!("Token reuse detected for family: {}", claims.family);
        session_manager
            .invalidate_token_family(&claims.family)
            .await
            .ok();
        return Err(ApiError::invalid_token());
    }

    // 3. Get user email for new token
    let user_repo = UserRepository::new(state.db.clone());
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| ApiError::invalid_token())?;
    let user = user_repo
        .find_by_id(user_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::invalid_token())?;

    // 4. Generate new tokens
    let (new_pair, _new_access_jti, new_refresh_jti) = state
        .jwt_manager
        .refresh_tokens(&claims, &user.email)
        .map_err(|e| ApiError::internal(format!("Failed to refresh tokens: {}", e)))?;

    // 5. Update token family
    session_manager
        .update_token_family(&claims.family, &new_refresh_jti)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to update token family: {}", e)))?;

    let expires_in = state.config.jwt_access_token_ttl as i64;

    tracing::debug!("Tokens refreshed for user: {}", user.email);

    Ok(ApiResponse::success(RefreshResponse {
        access_token: new_pair.access_token,
        refresh_token: new_pair.refresh_token,
        expires_in,
        token_type: "Bearer".to_string(),
    }))
}

/// POST /api/v1/auth/logout
///
/// Logout user and invalidate tokens
pub async fn logout(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<ApiResponse<()>, ApiError> {
    // Blacklist the current access token
    let mut session_manager = state.session_manager();
    let ttl = state.config.jwt_access_token_ttl;

    session_manager
        .blacklist_token(&user.token_id, ttl)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to blacklist token: {}", e)))?;

    tracing::info!("User logged out: {}", user.email);

    Ok(ApiResponse::<()>::ok())
}

/// GET /api/v1/auth/me
///
/// Get current authenticated user information
pub async fn me(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<ApiResponse<MeResponse>, ApiError> {
    let user_repo = UserRepository::new(state.db.clone());
    let db_user = user_repo
        .find_by_id(user.id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("User"))?;

    Ok(ApiResponse::success(MeResponse {
        user: UserResponse {
            id: db_user.id,
            email: db_user.email,
            public_key: db_user.public_key,
            created_at: db_user.created_at,
        },
    }))
}

/// GET /api/v1/auth/users/:email/public-key
///
/// Get user's public key by email (for key re-encryption)
pub async fn get_user_public_key(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
    Path(email): Path<String>,
) -> Result<ApiResponse<PublicKeyResponse>, ApiError> {
    let user_repo = UserRepository::new(state.db.clone());
    let target_user = user_repo
        .find_by_email(&email)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("User"))?;

    tracing::debug!("Retrieved public key for user: {}", target_user.email);

    Ok(ApiResponse::success(PublicKeyResponse {
        user_id: target_user.id,
        email: target_user.email,
        public_key: target_user.public_key,
    }))
}
