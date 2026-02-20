use chrono::{DateTime, Utc};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const LOCK_TTL_SECONDS: i64 = 30;
const LOCK_KEY_PREFIX: &str = "doc_lock:";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockInfo {
    pub user_id: Uuid,
    pub user_email: String,
    pub lock_id: String,
    pub acquired_at: DateTime<Utc>,
}

#[derive(Debug, thiserror::Error)]
pub enum LockError {
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Lock is held by another user")]
    LockHeld,

    #[error("Invalid lock ID")]
    InvalidLockId,

    #[error("Lock not found")]
    LockNotFound,
}

pub type LockResult<T> = Result<T, LockError>;

pub struct DocumentLockManager {
    redis: ConnectionManager,
}

impl DocumentLockManager {
    pub fn new(redis: ConnectionManager) -> Self {
        Self { redis }
    }

    fn lock_key(doc_id: Uuid) -> String {
        format!("{}{}", LOCK_KEY_PREFIX, doc_id)
    }

    /// 尝试获取文档的编辑锁
    pub async fn acquire_lock(
        &self,
        doc_id: Uuid,
        user_id: Uuid,
        user_email: String,
    ) -> LockResult<LockInfo> {
        let key = Self::lock_key(doc_id);
        let lock_id = Uuid::new_v4().to_string();
        let acquired_at = Utc::now();

        let lock_info = LockInfo {
            user_id,
            user_email,
            lock_id: lock_id.clone(),
            acquired_at,
        };

        let lock_data = serde_json::to_string(&lock_info)?;

        // 使用 NX（仅在不存在时设置）和 EX（设置过期时间）尝试写入键
        let mut conn = self.redis.clone();
        let result: Option<String> = conn
            .set_options(
                &key,
                &lock_data,
                redis::SetOptions::default()
                    .conditional_set(redis::ExistenceCheck::NX)
                    .with_expiration(redis::SetExpiry::EX(LOCK_TTL_SECONDS as u64)),
            )
            .await?;

        match result {
            Some(_) => {
                tracing::info!(
                    doc_id = %doc_id,
                    user_id = %user_id,
                    lock_id = %lock_id,
                    "Document lock acquired"
                );
                Ok(lock_info)
            }
            None => {
                tracing::warn!(
                    doc_id = %doc_id,
                    user_id = %user_id,
                    "Failed to acquire lock - already held by another user"
                );
                Err(LockError::LockHeld)
            }
        }
    }

    /// 续期编辑锁（心跳）
    pub async fn heartbeat(&self, doc_id: Uuid, lock_id: &str) -> LockResult<()> {
        let key = Self::lock_key(doc_id);
        let mut conn = self.redis.clone();

        // 获取当前锁信息
        let lock_data: Option<String> = conn.get(&key).await?;

        let lock_data = lock_data.ok_or(LockError::LockNotFound)?;
        let current_lock: LockInfo = serde_json::from_str(&lock_data)?;

        // 验证锁的归属
        if current_lock.lock_id != lock_id {
            return Err(LockError::InvalidLockId);
        }

        // 延长过期时间
        let _: bool = conn.expire(&key, LOCK_TTL_SECONDS).await?;

        tracing::debug!(
            doc_id = %doc_id,
            lock_id = %lock_id,
            "Lock heartbeat successful"
        );

        Ok(())
    }

    /// 显式释放编辑锁
    pub async fn release_lock(&self, doc_id: Uuid, lock_id: &str) -> LockResult<()> {
        let key = Self::lock_key(doc_id);
        let mut conn = self.redis.clone();

        // 获取当前锁信息以验证归属
        let lock_data: Option<String> = conn.get(&key).await?;

        if let Some(lock_data) = lock_data {
            let current_lock: LockInfo = serde_json::from_str(&lock_data)?;

            // 仅允许 lock_id 匹配时释放
            if current_lock.lock_id != lock_id {
                return Err(LockError::InvalidLockId);
            }

            // 删除锁
            let _: u32 = conn.del(&key).await?;

            tracing::info!(
                doc_id = %doc_id,
                lock_id = %lock_id,
                user_id = %current_lock.user_id,
                "Document lock released"
            );
        }

        Ok(())
    }

    /// 获取当前锁信息
    pub async fn get_lock_info(&self, doc_id: Uuid) -> LockResult<Option<LockInfo>> {
        let key = Self::lock_key(doc_id);
        let mut conn = self.redis.clone();

        let lock_data: Option<String> = conn.get(&key).await?;

        match lock_data {
            Some(data) => {
                let lock_info: LockInfo = serde_json::from_str(&data)?;
                Ok(Some(lock_info))
            }
            None => Ok(None),
        }
    }

    /// 强制释放锁（管理员/紧急情况使用）
    pub async fn force_release(&self, doc_id: Uuid) -> LockResult<()> {
        let key = Self::lock_key(doc_id);
        let mut conn = self.redis.clone();
        let _: u32 = conn.del(&key).await?;

        tracing::warn!(
            doc_id = %doc_id,
            "Document lock force released"
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 注意：这些测试需要运行中的 Redis 实例
    // 属于集成测试，应使用 `cargo test --ignored` 运行

    #[tokio::test]
    #[ignore]
    async fn test_acquire_and_release_lock() {
        let client = redis::Client::open("redis://127.0.0.1:6379").unwrap();
        let conn = client.get_connection_manager().await.unwrap();
        let manager = DocumentLockManager::new(conn);

        let doc_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let user_email = "test@example.com".to_string();

        // 获取锁
        let lock_info = manager
            .acquire_lock(doc_id, user_id, user_email.clone())
            .await
            .unwrap();

        assert_eq!(lock_info.user_id, user_id);
        assert_eq!(lock_info.user_email, user_email);

        // 释放锁
        manager.release_lock(doc_id, &lock_info.lock_id).await.unwrap();

        // 验证锁已释放
        let info = manager.get_lock_info(doc_id).await.unwrap();
        assert!(info.is_none());
    }

    #[tokio::test]
    #[ignore]
    async fn test_concurrent_lock_conflict() {
        let client = redis::Client::open("redis://127.0.0.1:6379").unwrap();
        let conn = client.get_connection_manager().await.unwrap();
        let manager = DocumentLockManager::new(conn);

        let doc_id = Uuid::new_v4();
        let user1_id = Uuid::new_v4();
        let user2_id = Uuid::new_v4();

        // 用户 1 获取锁
        let lock1 = manager
            .acquire_lock(doc_id, user1_id, "user1@example.com".to_string())
            .await
            .unwrap();

        // 用户 2 尝试获取锁 - 应失败
        let result = manager
            .acquire_lock(doc_id, user2_id, "user2@example.com".to_string())
            .await;

        assert!(matches!(result, Err(LockError::LockHeld)));

        // 清理
        manager.release_lock(doc_id, &lock1.lock_id).await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn test_heartbeat() {
        let client = redis::Client::open("redis://127.0.0.1:6379").unwrap();
        let conn = client.get_connection_manager().await.unwrap();
        let manager = DocumentLockManager::new(conn);

        let doc_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();

        let lock_info = manager
            .acquire_lock(doc_id, user_id, "test@example.com".to_string())
            .await
            .unwrap();

        // 发送心跳
        manager.heartbeat(doc_id, &lock_info.lock_id).await.unwrap();

        // 验证锁仍然存在
        let info = manager.get_lock_info(doc_id).await.unwrap();
        assert!(info.is_some());

        // 清理
        manager.release_lock(doc_id, &lock_info.lock_id).await.unwrap();
    }
}
