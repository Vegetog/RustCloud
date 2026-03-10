//! 身份-用户关联仓储实现

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use crate::entities::identity_user::{self, Entity as IdentityUser, Model as IdentityUserModel};
use crate::error::{DatabaseError, DbResult};
use crate::types::CreateIdentityUser;

/// 用于依赖注入的身份-用户关联仓储特征
#[async_trait]
pub trait IdentityUserRepositoryTrait: Send + Sync {
    /// 添加用户到身份
    async fn create(&self, data: CreateIdentityUser) -> DbResult<IdentityUserModel>;

    /// 批量添加用户到身份
    async fn batch_create(&self, items: Vec<CreateIdentityUser>) -> DbResult<Vec<IdentityUserModel>>;

    /// 查询身份下的全部用户关联
    async fn find_by_identity(&self, identity_id: Uuid) -> DbResult<Vec<IdentityUserModel>>;

    /// 查询用户拥有的全部身份关联
    async fn find_by_user(&self, user_id: Uuid) -> DbResult<Vec<IdentityUserModel>>;

    /// 查询特定身份和用户的关联
    async fn find_by_identity_and_user(
        &self,
        identity_id: Uuid,
        user_id: Uuid,
    ) -> DbResult<Option<IdentityUserModel>>;

    /// 根据 ID 删除关联
    async fn delete(&self, id: Uuid) -> DbResult<()>;

    /// 按身份和用户删除关联
    async fn delete_by_identity_and_user(
        &self,
        identity_id: Uuid,
        user_id: Uuid,
    ) -> DbResult<()>;

    /// 批量删除身份下的用户关联
    async fn batch_delete_by_identity_and_users(
        &self,
        identity_id: Uuid,
        user_ids: Vec<Uuid>,
    ) -> DbResult<()>;
}

/// 身份-用户关联仓储实现
pub struct IdentityUserRepository {
    db: Arc<DatabaseConnection>,
}

impl IdentityUserRepository {
    /// 创建新的身份-用户关联仓储
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl IdentityUserRepositoryTrait for IdentityUserRepository {
    async fn create(&self, data: CreateIdentityUser) -> DbResult<IdentityUserModel> {
        let id = Uuid::new_v4();

        let model = identity_user::ActiveModel {
            id: Set(id),
            identity_id: Set(data.identity_id),
            user_id: Set(data.user_id),
            assigned_at: Set(Utc::now()),
        };

        let result = model.insert(&*self.db).await?;
        Ok(result)
    }

    async fn batch_create(&self, items: Vec<CreateIdentityUser>) -> DbResult<Vec<IdentityUserModel>> {
        if items.is_empty() {
            return Ok(vec![]);
        }
        let now = Utc::now();
        let models: Vec<identity_user::ActiveModel> = items
            .iter()
            .map(|item| identity_user::ActiveModel {
                id: Set(Uuid::new_v4()),
                identity_id: Set(item.identity_id),
                user_id: Set(item.user_id),
                assigned_at: Set(now),
            })
            .collect();

        let result = IdentityUser::insert_many(models).exec(&*self.db).await?;
        // After bulk insert, query back the inserted records
        let _ = result;
        let inserted = IdentityUser::find()
            .filter(identity_user::Column::IdentityId.eq(items[0].identity_id))
            .filter(identity_user::Column::AssignedAt.eq(now))
            .all(&*self.db)
            .await?;
        Ok(inserted)
    }

    async fn find_by_identity(&self, identity_id: Uuid) -> DbResult<Vec<IdentityUserModel>> {
        let result = IdentityUser::find()
            .filter(identity_user::Column::IdentityId.eq(identity_id))
            .all(&*self.db)
            .await?;
        Ok(result)
    }

    async fn find_by_user(&self, user_id: Uuid) -> DbResult<Vec<IdentityUserModel>> {
        let result = IdentityUser::find()
            .filter(identity_user::Column::UserId.eq(user_id))
            .all(&*self.db)
            .await?;
        Ok(result)
    }

    async fn find_by_identity_and_user(
        &self,
        identity_id: Uuid,
        user_id: Uuid,
    ) -> DbResult<Option<IdentityUserModel>> {
        let result = IdentityUser::find()
            .filter(identity_user::Column::IdentityId.eq(identity_id))
            .filter(identity_user::Column::UserId.eq(user_id))
            .one(&*self.db)
            .await?;
        Ok(result)
    }

    async fn delete(&self, id: Uuid) -> DbResult<()> {
        let result = IdentityUser::delete_by_id(id).exec(&*self.db).await?;
        if result.rows_affected == 0 {
            return Err(DatabaseError::NotFound);
        }
        Ok(())
    }

    async fn delete_by_identity_and_user(
        &self,
        identity_id: Uuid,
        user_id: Uuid,
    ) -> DbResult<()> {
        let result = IdentityUser::delete_many()
            .filter(identity_user::Column::IdentityId.eq(identity_id))
            .filter(identity_user::Column::UserId.eq(user_id))
            .exec(&*self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(DatabaseError::NotFound);
        }
        Ok(())
    }

    async fn batch_delete_by_identity_and_users(
        &self,
        identity_id: Uuid,
        user_ids: Vec<Uuid>,
    ) -> DbResult<()> {
        if user_ids.is_empty() {
            return Ok(());
        }
        IdentityUser::delete_many()
            .filter(identity_user::Column::IdentityId.eq(identity_id))
            .filter(identity_user::Column::UserId.is_in(user_ids))
            .exec(&*self.db)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{DatabaseBackend, MockDatabase, MockExecResult};

    fn mock_identity_user() -> IdentityUserModel {
        IdentityUserModel {
            id: Uuid::new_v4(),
            identity_id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            assigned_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_find_by_identity() {
        let iu1 = mock_identity_user();
        let iu2 = IdentityUserModel {
            id: Uuid::new_v4(),
            identity_id: iu1.identity_id,
            user_id: Uuid::new_v4(),
            assigned_at: Utc::now(),
        };

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![iu1.clone(), iu2]])
            .into_connection();

        let repo = IdentityUserRepository::new(Arc::new(db));
        let result = repo.find_by_identity(iu1.identity_id).await.unwrap();

        assert_eq!(result.len(), 2);
    }

    #[tokio::test]
    async fn test_find_by_identity_and_user() {
        let iu = mock_identity_user();

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([[iu.clone()]])
            .into_connection();

        let repo = IdentityUserRepository::new(Arc::new(db));
        let result = repo
            .find_by_identity_and_user(iu.identity_id, iu.user_id)
            .await
            .unwrap();

        assert!(result.is_some());
    }

    #[tokio::test]
    async fn test_delete_identity_user() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        let repo = IdentityUserRepository::new(Arc::new(db));
        let result = repo.delete(Uuid::new_v4()).await;

        assert!(result.is_ok());
    }
}
