//! Redis session management

use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use rustcloud_core::error::{Error, Result};
use uuid::Uuid;

use crate::config::AuthConfig;
use crate::types::Session;

/// Redis key prefixes
const SESSION_PREFIX: &str = "session:";
const USER_SESSIONS_PREFIX: &str = "user_sessions:";
const TOKEN_FAMILY_PREFIX: &str = "token_family:";
const BLACKLIST_PREFIX: &str = "blacklist:";

/// Session manager using Redis
pub struct SessionManager {
    redis: ConnectionManager,
    config: AuthConfig,
}

impl SessionManager {
    /// Create a new session manager
    pub fn new(redis: ConnectionManager, config: AuthConfig) -> Self {
        Self { redis, config }
    }

    /// Create a new session
    ///
    /// Automatically enforces the session limit per user.
    pub async fn create_session(
        &mut self,
        user_id: Uuid,
        token_family: String,
        refresh_token_id: String,
        ip_address: String,
        user_agent: String,
    ) -> Result<Session> {
        // Enforce session limit first
        self.enforce_session_limit(user_id).await?;

        let session = Session::new(
            user_id,
            token_family.clone(),
            refresh_token_id.clone(),
            ip_address,
            user_agent,
        );

        let session_key = format!("{}{}", SESSION_PREFIX, session.id);
        let user_sessions_key = format!("{}{}", USER_SESSIONS_PREFIX, user_id);
        let family_key = format!("{}{}", TOKEN_FAMILY_PREFIX, token_family);

        let session_json =
            serde_json::to_string(&session).map_err(|e| Error::Internal(e.to_string()))?;

        let ttl_secs = self.config.refresh_token_ttl.as_secs() as i64;

        // Store session data
        let _: () = self
            .redis
            .set_ex(&session_key, &session_json, ttl_secs as u64)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // Add session to user's session set
        let _: () = self
            .redis
            .sadd(&user_sessions_key, &session.id)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // Set TTL on user sessions set
        let _: () = self
            .redis
            .expire(&user_sessions_key, ttl_secs)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // Store token family -> current refresh token ID
        let _: () = self
            .redis
            .set_ex(&family_key, &refresh_token_id, ttl_secs as u64)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        Ok(session)
    }

    /// Get session by ID
    pub async fn get_session(&mut self, session_id: &str) -> Result<Option<Session>> {
        let session_key = format!("{}{}", SESSION_PREFIX, session_id);

        let session_json: Option<String> = self
            .redis
            .get(&session_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        match session_json {
            Some(json) => {
                let session: Session =
                    serde_json::from_str(&json).map_err(|e| Error::Internal(e.to_string()))?;
                Ok(Some(session))
            }
            None => Ok(None),
        }
    }

    /// Update session's refresh token ID
    pub async fn update_session(
        &mut self,
        session_id: &str,
        new_refresh_token_id: &str,
    ) -> Result<()> {
        let session_key = format!("{}{}", SESSION_PREFIX, session_id);

        let session_json: Option<String> = self
            .redis
            .get(&session_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        match session_json {
            Some(json) => {
                let mut session: Session =
                    serde_json::from_str(&json).map_err(|e| Error::Internal(e.to_string()))?;

                session.refresh_token_id = new_refresh_token_id.to_string();
                session.last_active_at = chrono::Utc::now();

                let updated_json =
                    serde_json::to_string(&session).map_err(|e| Error::Internal(e.to_string()))?;

                // Get remaining TTL
                let ttl: i64 = self
                    .redis
                    .ttl(&session_key)
                    .await
                    .map_err(|e| Error::DatabaseError(e.to_string()))?;

                if ttl > 0 {
                    let _: () = self
                        .redis
                        .set_ex(&session_key, &updated_json, ttl as u64)
                        .await
                        .map_err(|e| Error::DatabaseError(e.to_string()))?;

                    // Update token family
                    let family_key = format!("{}{}", TOKEN_FAMILY_PREFIX, session.token_family);
                    let _: () = self
                        .redis
                        .set_ex(&family_key, new_refresh_token_id, ttl as u64)
                        .await
                        .map_err(|e| Error::DatabaseError(e.to_string()))?;
                }

                Ok(())
            }
            None => Err(Error::Unauthorized),
        }
    }

    /// Destroy a single session
    pub async fn destroy_session(&mut self, session_id: &str) -> Result<()> {
        let session = self.get_session(session_id).await?;

        if let Some(session) = session {
            let session_key = format!("{}{}", SESSION_PREFIX, session_id);
            let user_sessions_key = format!("{}{}", USER_SESSIONS_PREFIX, session.user_id);
            let family_key = format!("{}{}", TOKEN_FAMILY_PREFIX, session.token_family);

            // Remove session
            let _: () = self
                .redis
                .del(&session_key)
                .await
                .map_err(|e| Error::DatabaseError(e.to_string()))?;

            // Remove from user sessions set
            let _: () = self
                .redis
                .srem(&user_sessions_key, session_id)
                .await
                .map_err(|e| Error::DatabaseError(e.to_string()))?;

            // Remove token family
            let _: () = self
                .redis
                .del(&family_key)
                .await
                .map_err(|e| Error::DatabaseError(e.to_string()))?;
        }

        Ok(())
    }

    /// Destroy all sessions for a user
    pub async fn destroy_all_sessions(&mut self, user_id: Uuid) -> Result<()> {
        let user_sessions_key = format!("{}{}", USER_SESSIONS_PREFIX, user_id);

        // Get all session IDs for this user
        let session_ids: Vec<String> = self
            .redis
            .smembers(&user_sessions_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // Destroy each session
        for session_id in session_ids {
            self.destroy_session(&session_id).await?;
        }

        Ok(())
    }

    /// Validate token family (for replay detection)
    ///
    /// Returns true if the token_id matches the current valid token for this family.
    pub async fn validate_token_family(
        &mut self,
        family_id: &str,
        expected_token_id: &str,
    ) -> Result<bool> {
        let family_key = format!("{}{}", TOKEN_FAMILY_PREFIX, family_id);

        let current_token_id: Option<String> = self
            .redis
            .get(&family_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        Ok(current_token_id.as_deref() == Some(expected_token_id))
    }

    /// Update token family with new token ID
    pub async fn update_token_family(
        &mut self,
        family_id: &str,
        new_token_id: &str,
    ) -> Result<()> {
        let family_key = format!("{}{}", TOKEN_FAMILY_PREFIX, family_id);

        // Get remaining TTL
        let ttl: i64 = self
            .redis
            .ttl(&family_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        if ttl > 0 {
            let _: () = self
                .redis
                .set_ex(&family_key, new_token_id, ttl as u64)
                .await
                .map_err(|e| Error::DatabaseError(e.to_string()))?;
        }

        Ok(())
    }

    /// Invalidate entire token family (on replay detection)
    ///
    /// This should be called when a reused refresh token is detected.
    pub async fn invalidate_token_family(&mut self, family_id: &str) -> Result<()> {
        let family_key = format!("{}{}", TOKEN_FAMILY_PREFIX, family_id);

        let _: () = self
            .redis
            .del(&family_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// Blacklist a token ID
    pub async fn blacklist_token(&mut self, token_id: &str, ttl_secs: u64) -> Result<()> {
        let blacklist_key = format!("{}{}", BLACKLIST_PREFIX, token_id);

        let _: () = self
            .redis
            .set_ex(&blacklist_key, "1", ttl_secs)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// Check if token is blacklisted
    pub async fn is_token_blacklisted(&mut self, token_id: &str) -> Result<bool> {
        let blacklist_key = format!("{}{}", BLACKLIST_PREFIX, token_id);

        let exists: bool = self
            .redis
            .exists(&blacklist_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        Ok(exists)
    }

    /// Enforce session limit per user (remove oldest if exceeded)
    async fn enforce_session_limit(&mut self, user_id: Uuid) -> Result<()> {
        let user_sessions_key = format!("{}{}", USER_SESSIONS_PREFIX, user_id);

        // Get all session IDs for this user
        let session_ids: Vec<String> = self
            .redis
            .smembers(&user_sessions_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // If we're at or over the limit, remove the oldest sessions
        if session_ids.len() >= self.config.max_sessions_per_user as usize {
            // Get all sessions with their creation times
            let mut sessions: Vec<Session> = Vec::new();
            for session_id in &session_ids {
                if let Some(session) = self.get_session(session_id).await? {
                    sessions.push(session);
                }
            }

            // Sort by creation time (oldest first)
            sessions.sort_by(|a, b| a.created_at.cmp(&b.created_at));

            // Remove oldest sessions to make room for the new one
            let to_remove = sessions.len() - (self.config.max_sessions_per_user as usize - 1);
            for session in sessions.iter().take(to_remove) {
                self.destroy_session(&session.id).await?;
            }
        }

        Ok(())
    }
}
