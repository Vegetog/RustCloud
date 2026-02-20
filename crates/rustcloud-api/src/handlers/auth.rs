//! 认证处理器

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
/// 注册新用户账号
pub async fn register(
    State(state): State<AppState>,
    ValidatedJson(req): ValidatedJson<RegisterRequest>,
) -> Result<ApiResponse<RegisterResponse>, ApiError> {
    // 1. 校验密码强度
    let validation = validate_password_strength(&req.password, 8);
    if !validation.is_valid {
        return Err(ApiError::bad_request(validation.error_message()));
    }

    // 2. 哈希密码
    let password_hash = create_password_hash(&req.password)
        .map_err(|e| ApiError::internal(format!("Failed to hash password: {}", e)))?;

    // 3. 在数据库中创建用户
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
/// 认证用户并返回令牌
pub async fn login(
    State(state): State<AppState>,
    ValidatedJson(req): ValidatedJson<LoginRequest>,
) -> Result<ApiResponse<LoginResponse>, ApiError> {
    // 1. 根据邮箱查找用户
    let user_repo = UserRepository::new(state.db.clone());
    let user = user_repo
        .find_by_email(&req.email)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::unauthorized("Invalid credentials"))?;

    // 2. 验证密码
    let password_valid = check_password(&req.password, &user.password_hash)
        .map_err(|e| ApiError::internal(format!("Password verification failed: {}", e)))?;

    if !password_valid {
        return Err(ApiError::unauthorized("Invalid credentials"));
    }

    // 3. 生成令牌族
    let token_family = Uuid::new_v4().to_string();

    // 4. 生成令牌
    let (token_pair, _access_jti, refresh_jti) = state
        .jwt_manager
        .generate_token_pair(user.id, &user.email, &token_family)
        .map_err(|e| ApiError::internal(format!("Failed to generate tokens: {}", e)))?;

    // 5. 在 Redis 中创建会话
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
/// 使用刷新令牌刷新访问令牌
pub async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshRequest>,
) -> Result<ApiResponse<RefreshResponse>, ApiError> {
    // 1. 验证刷新令牌
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

    // 2. 校验令牌族（检查令牌重用）
    let mut session_manager = state.session_manager();
    let is_valid = session_manager
        .validate_token_family(&claims.family, &claims.jti)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to validate token family: {}", e)))?;

    if !is_valid {
        // 疑似令牌重放攻击 - 使整个令牌族失效
        tracing::warn!("Token reuse detected for family: {}", claims.family);
        session_manager
            .invalidate_token_family(&claims.family)
            .await
            .ok();
        return Err(ApiError::invalid_token());
    }

    // 3. 获取用于新令牌的用户邮箱
    let user_repo = UserRepository::new(state.db.clone());
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| ApiError::invalid_token())?;
    let user = user_repo
        .find_by_id(user_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(ApiError::invalid_token)?;

    // 4. 生成新令牌
    let (new_pair, _new_access_jti, new_refresh_jti) = state
        .jwt_manager
        .refresh_tokens(&claims, &user.email)
        .map_err(|e| ApiError::internal(format!("Failed to refresh tokens: {}", e)))?;

    // 5. 更新令牌族
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
/// 登出用户并使令牌失效
pub async fn logout(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<ApiResponse<()>, ApiError> {
    // 将当前访问令牌加入黑名单
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
/// 获取当前认证用户信息
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
/// 通过邮箱获取用户公钥（用于密钥重新加密）
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
