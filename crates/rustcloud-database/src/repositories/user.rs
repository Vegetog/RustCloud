//! User repository implementation

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use crate::entities::user::{self, Entity as User, Model as UserModel};
use crate::error::{DatabaseError, DbResult};
use crate::types::{CreateUser, UpdateUser, UserKeys};

/// User repository trait for dependency injection
#[async_trait]
pub trait UserRepositoryTrait: Send + Sync {
    /// Create a new user
    async fn create(&self, data: CreateUser) -> DbResult<UserModel>;

    /// Find user by ID
    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<UserModel>>;

    /// Find user by email
    async fn find_by_email(&self, email: &str) -> DbResult<Option<UserModel>>;

    /// Update user fields
    async fn update(&self, id: Uuid, data: UpdateUser) -> DbResult<UserModel>;

    /// Delete user by ID
    async fn delete(&self, id: Uuid) -> DbResult<()>;

    /// Update user's cryptographic keys
    async fn update_keys(&self, id: Uuid, keys: UserKeys) -> DbResult<()>;
}

/// User repository implementation
pub struct UserRepository {
    db: Arc<DatabaseConnection>,
}

impl UserRepository {
    /// Create a new user repository
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

    async fn update(&self, id: Uuid, data: UpdateUser) -> DbResult<UserModel> {
        let user = User::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or(DatabaseError::NotFound)?;

        let mut model: user::ActiveModel = user.into();

        if let Some(email) = data.email {
            model.email = Set(email);
        }
        if let Some(password_hash) = data.password_hash {
            model.password_hash = Set(password_hash);
        }
        model.updated_at = Set(Utc::now());

        let result = model.update(&*self.db).await?;
        Ok(result)
    }

    async fn delete(&self, id: Uuid) -> DbResult<()> {
        let result = User::delete_by_id(id).exec(&*self.db).await?;
        if result.rows_affected == 0 {
            return Err(DatabaseError::NotFound);
        }
        Ok(())
    }

    async fn update_keys(&self, id: Uuid, keys: UserKeys) -> DbResult<()> {
        let user = User::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or(DatabaseError::NotFound)?;

        let mut model: user::ActiveModel = user.into();
        model.password_hash = Set(keys.password_hash);
        model.salt = Set(keys.salt);
        model.public_key = Set(keys.public_key);
        model.encrypted_private_key = Set(keys.encrypted_private_key);
        model.private_key_nonce = Set(keys.private_key_nonce);
        model.updated_at = Set(Utc::now());

        model.update(&*self.db).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{DatabaseBackend, MockDatabase, MockExecResult};

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

    #[tokio::test]
    async fn test_delete_user() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        let repo = UserRepository::new(Arc::new(db));
        let result = repo.delete(Uuid::new_v4()).await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_user_not_found() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 0,
            }])
            .into_connection();

        let repo = UserRepository::new(Arc::new(db));
        let result = repo.delete(Uuid::new_v4()).await;

        assert!(matches!(result, Err(DatabaseError::NotFound)));
    }
}
