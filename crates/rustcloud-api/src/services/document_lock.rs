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

    /// Attempt to acquire editing lock for a document
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

        // Try to set the key with NX (only if not exists) and EX (expiration)
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

    /// Extend lock TTL (heartbeat)
    pub async fn heartbeat(&self, doc_id: Uuid, lock_id: &str) -> LockResult<()> {
        let key = Self::lock_key(doc_id);
        let mut conn = self.redis.clone();

        // Get current lock info
        let lock_data: Option<String> = conn.get(&key).await?;

        let lock_data = lock_data.ok_or(LockError::LockNotFound)?;
        let current_lock: LockInfo = serde_json::from_str(&lock_data)?;

        // Verify lock ownership
        if current_lock.lock_id != lock_id {
            return Err(LockError::InvalidLockId);
        }

        // Extend TTL
        let _: bool = conn.expire(&key, LOCK_TTL_SECONDS as i64).await?;

        tracing::debug!(
            doc_id = %doc_id,
            lock_id = %lock_id,
            "Lock heartbeat successful"
        );

        Ok(())
    }

    /// Release lock explicitly
    pub async fn release_lock(&self, doc_id: Uuid, lock_id: &str) -> LockResult<()> {
        let key = Self::lock_key(doc_id);
        let mut conn = self.redis.clone();

        // Get current lock info to verify ownership
        let lock_data: Option<String> = conn.get(&key).await?;

        if let Some(lock_data) = lock_data {
            let current_lock: LockInfo = serde_json::from_str(&lock_data)?;

            // Only allow releasing if lock_id matches
            if current_lock.lock_id != lock_id {
                return Err(LockError::InvalidLockId);
            }

            // Delete the lock
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

    /// Get current lock information
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

    /// Force release lock (admin/emergency use)
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

    // Note: These tests require a running Redis instance
    // They are integration tests and should be run with `cargo test --ignored`

    #[tokio::test]
    #[ignore]
    async fn test_acquire_and_release_lock() {
        let client = redis::Client::open("redis://127.0.0.1:6379").unwrap();
        let conn = client.get_connection_manager().await.unwrap();
        let manager = DocumentLockManager::new(conn);

        let doc_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let user_email = "test@example.com".to_string();

        // Acquire lock
        let lock_info = manager
            .acquire_lock(doc_id, user_id, user_email.clone())
            .await
            .unwrap();

        assert_eq!(lock_info.user_id, user_id);
        assert_eq!(lock_info.user_email, user_email);

        // Release lock
        manager.release_lock(doc_id, &lock_info.lock_id).await.unwrap();

        // Verify lock is released
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

        // User 1 acquires lock
        let lock1 = manager
            .acquire_lock(doc_id, user1_id, "user1@example.com".to_string())
            .await
            .unwrap();

        // User 2 tries to acquire - should fail
        let result = manager
            .acquire_lock(doc_id, user2_id, "user2@example.com".to_string())
            .await;

        assert!(matches!(result, Err(LockError::LockHeld)));

        // Clean up
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

        // Send heartbeat
        manager.heartbeat(doc_id, &lock_info.lock_id).await.unwrap();

        // Verify lock still exists
        let info = manager.get_lock_info(doc_id).await.unwrap();
        assert!(info.is_some());

        // Clean up
        manager.release_lock(doc_id, &lock_info.lock_id).await.unwrap();
    }
}
