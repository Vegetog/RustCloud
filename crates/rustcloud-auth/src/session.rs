//! Redis 会话管理

use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use rustcloud_core::error::{Error, Result};
use uuid::Uuid;

use crate::config::AuthConfig;
use crate::types::Session;

/// Redis 键前缀
const SESSION_PREFIX: &str = "session:";
const USER_SESSIONS_PREFIX: &str = "user_sessions:";
const TOKEN_FAMILY_PREFIX: &str = "token_family:";
const BLACKLIST_PREFIX: &str = "blacklist:";

/// 基于 Redis 的会话管理器
pub struct SessionManager {
    redis: ConnectionManager,
    config: AuthConfig,
}

impl SessionManager {
    /// 创建新的会话管理器
    pub fn new(redis: ConnectionManager, config: AuthConfig) -> Self {
        Self { redis, config }
    }

    /// 创建新会话
    ///
    /// 自动强制执行每用户会话数量限制。
    pub async fn create_session(
        &mut self,
        user_id: Uuid,
        token_family: String,
        refresh_token_id: String,
        ip_address: String,
        user_agent: String,
    ) -> Result<Session> {
        // 先强制执行会话数量限制
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

        // 存储会话数据
        let _: () = self
            .redis
            .set_ex(&session_key, &session_json, ttl_secs as u64)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // 将会话加入用户会话集合
        let _: () = self
            .redis
            .sadd(&user_sessions_key, &session.id)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // 为用户会话集合设置过期时间
        let _: () = self
            .redis
            .expire(&user_sessions_key, ttl_secs)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // 存储令牌族 -> 当前刷新令牌 ID 的映射
        let _: () = self
            .redis
            .set_ex(&family_key, &refresh_token_id, ttl_secs as u64)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        Ok(session)
    }

    /// 根据 ID 获取会话
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

    /// 更新会话的刷新令牌 ID
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

                // 获取剩余 TTL
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

                    // 更新令牌族
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

    /// 销毁单个会话
    pub async fn destroy_session(&mut self, session_id: &str) -> Result<()> {
        let session = self.get_session(session_id).await?;

        if let Some(session) = session {
            let session_key = format!("{}{}", SESSION_PREFIX, session_id);
            let user_sessions_key = format!("{}{}", USER_SESSIONS_PREFIX, session.user_id);
            let family_key = format!("{}{}", TOKEN_FAMILY_PREFIX, session.token_family);

            // 删除会话
            let _: () = self
                .redis
                .del(&session_key)
                .await
                .map_err(|e| Error::DatabaseError(e.to_string()))?;

            // 从用户会话集合中移除
            let _: () = self
                .redis
                .srem(&user_sessions_key, session_id)
                .await
                .map_err(|e| Error::DatabaseError(e.to_string()))?;

            // 删除令牌族
            let _: () = self
                .redis
                .del(&family_key)
                .await
                .map_err(|e| Error::DatabaseError(e.to_string()))?;
        }

        Ok(())
    }

    /// 销毁某用户的所有会话
    pub async fn destroy_all_sessions(&mut self, user_id: Uuid) -> Result<()> {
        let user_sessions_key = format!("{}{}", USER_SESSIONS_PREFIX, user_id);

        // 获取该用户的所有会话 ID
        let session_ids: Vec<String> = self
            .redis
            .smembers(&user_sessions_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // 逐个销毁会话
        for session_id in session_ids {
            self.destroy_session(&session_id).await?;
        }

        Ok(())
    }

    /// 验证令牌族（用于重放检测）
    ///
    /// 若 token_id 与该族当前有效令牌匹配则返回 true。
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

    /// 用新令牌 ID 更新令牌族
    pub async fn update_token_family(
        &mut self,
        family_id: &str,
        new_token_id: &str,
    ) -> Result<()> {
        let family_key = format!("{}{}", TOKEN_FAMILY_PREFIX, family_id);

        // 获取剩余过期时间
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

    /// 使整个令牌族失效（检测到重放攻击时调用）
    ///
    /// 当检测到刷新令牌被复用时应调用此方法。
    pub async fn invalidate_token_family(&mut self, family_id: &str) -> Result<()> {
        let family_key = format!("{}{}", TOKEN_FAMILY_PREFIX, family_id);

        let _: () = self
            .redis
            .del(&family_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// 将令牌 ID 加入黑名单
    pub async fn blacklist_token(&mut self, token_id: &str, ttl_secs: u64) -> Result<()> {
        let blacklist_key = format!("{}{}", BLACKLIST_PREFIX, token_id);

        let _: () = self
            .redis
            .set_ex(&blacklist_key, "1", ttl_secs)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// 检查令牌是否在黑名单中
    pub async fn is_token_blacklisted(&mut self, token_id: &str) -> Result<bool> {
        let blacklist_key = format!("{}{}", BLACKLIST_PREFIX, token_id);

        let exists: bool = self
            .redis
            .exists(&blacklist_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        Ok(exists)
    }

    /// 强制执行每用户会话数量上限（超出时删除最旧的会话）
    async fn enforce_session_limit(&mut self, user_id: Uuid) -> Result<()> {
        let user_sessions_key = format!("{}{}", USER_SESSIONS_PREFIX, user_id);

        // 获取该用户的所有会话 ID
        let session_ids: Vec<String> = self
            .redis
            .smembers(&user_sessions_key)
            .await
            .map_err(|e| Error::DatabaseError(e.to_string()))?;

        // 若达到或超过上限，则删除最旧的会话
        if session_ids.len() >= self.config.max_sessions_per_user as usize {
            // 获取所有会话及其创建时间
            let mut sessions: Vec<Session> = Vec::new();
            for session_id in &session_ids {
                if let Some(session) = self.get_session(session_id).await? {
                    sessions.push(session);
                }
            }

            // 按创建时间排序（最旧的在前）
            sessions.sort_by(|a, b| a.created_at.cmp(&b.created_at));

            // 删除最旧的会话以腾出空间
            let to_remove = sessions.len() - (self.config.max_sessions_per_user as usize - 1);
            for session in sessions.iter().take(to_remove) {
                self.destroy_session(&session.id).await?;
            }
        }

        Ok(())
    }
}
