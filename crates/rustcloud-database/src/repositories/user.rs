//! 用户仓储实现

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use crate::entities::user::{self, Entity as User, Model as UserModel};
use crate::error::DbResult;
use crate::types::CreateUser;

/// 用于依赖注入的用户仓储特征
#[async_trait]
pub trait UserRepositoryTrait: Send + Sync {
    /// 创建新用户
    async fn create(&self, data: CreateUser) -> DbResult<UserModel>;

    /// 根据 ID 查询用户
    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<UserModel>>;

    /// 根据邮箱查找用户
    async fn find_by_email(&self, email: &str) -> DbResult<Option<UserModel>>;

}

/// 用户仓储实现
pub struct UserRepository {
    db: Arc<DatabaseConnection>,
}

impl UserRepository {
    /// 创建新的用户仓储
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl UserRepositoryTrait for UserRepository {
    async fn create(&self, data: CreateUser) -> DbResult<UserModel> {
        let now = Utc::now();
        let id = Uuid::new_v4();

        let model = user::ActiveModel {
            id: Set(id),
            email: Set(data.email),
            password_hash: Set(data.password_hash),
            salt: Set(data.salt),
            public_key: Set(data.public_key),
            encrypted_private_key: Set(data.encrypted_private_key),
            private_key_nonce: Set(data.private_key_nonce),
            created_at: Set(now),
            updated_at: Set(now),
        };

        let result = model.insert(&*self.db).await?;
        Ok(result)
    }

    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<UserModel>> {
        let result = User::find_by_id(id).one(&*self.db).await?;
        Ok(result)
    }

    async fn find_by_email(&self, email: &str) -> DbResult<Option<UserModel>> {
        let result = User::find()
            .filter(user::Column::Email.eq(email))
            .one(&*self.db)
            .await?;
        Ok(result)
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{DatabaseBackend, MockDatabase};

    fn mock_user() -> UserModel {
        UserModel {
            id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            password_hash: "hash".to_string(),
            salt: "salt".to_string(),
            public_key: "pubkey".to_string(),
            encrypted_private_key: "encprivkey".to_string(),
            private_key_nonce: "nonce".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_find_by_email() {
        let user = mock_user();

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([[user.clone()]])
            .into_connection();

        let repo = UserRepository::new(Arc::new(db));
        let result = repo.find_by_email("test@example.com").await.unwrap();

        assert!(result.is_some());
        assert_eq!(result.unwrap().email, "test@example.com");
    }

    #[tokio::test]
    async fn test_find_by_email_not_found() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<UserModel>::new()])
            .into_connection();

        let repo = UserRepository::new(Arc::new(db));
        let result = repo.find_by_email("nonexistent@example.com").await.unwrap();

        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_find_by_id() {
        let user = mock_user();
        let user_id = user.id;

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([[user]])
            .into_connection();

        let repo = UserRepository::new(Arc::new(db));
        let result = repo.find_by_id(user_id).await.unwrap();

        assert!(result.is_some());
        assert_eq!(result.unwrap().id, user_id);
    }

}
