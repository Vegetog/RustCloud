//! 身份仓储实现

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use crate::entities::identity::{self, Entity as Identity, Model as IdentityModel};
use crate::error::{DatabaseError, DbResult};
use crate::types::{CreateIdentity, UpdateIdentity};

/// 用于依赖注入的身份仓储特征
#[async_trait]
pub trait IdentityRepositoryTrait: Send + Sync {
    /// 创建新身份
    async fn create(&self, data: CreateIdentity) -> DbResult<IdentityModel>;

    /// 根据 ID 查询身份
    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<IdentityModel>>;

    /// 查询用户创建的全部身份
    async fn find_by_creator(&self, creator_id: Uuid) -> DbResult<Vec<IdentityModel>>;

    /// 更新身份
    async fn update(&self, id: Uuid, data: UpdateIdentity) -> DbResult<IdentityModel>;

    /// 根据 ID 删除身份
    async fn delete(&self, id: Uuid) -> DbResult<()>;
}

/// 身份仓储实现
pub struct IdentityRepository {
    db: Arc<DatabaseConnection>,
}

impl IdentityRepository {
    /// 创建新的身份仓储
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl IdentityRepositoryTrait for IdentityRepository {
    async fn create(&self, data: CreateIdentity) -> DbResult<IdentityModel> {
        let now = Utc::now();
        let id = Uuid::new_v4();

        let model = identity::ActiveModel {
            id: Set(id),
            name: Set(data.name),
            description: Set(data.description),
            creator_id: Set(data.creator_id),
            created_at: Set(now),
            updated_at: Set(now),
        };

        let result = model.insert(&*self.db).await?;
        Ok(result)
    }

    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<IdentityModel>> {
        let result = Identity::find_by_id(id).one(&*self.db).await?;
        Ok(result)
    }

    async fn find_by_creator(&self, creator_id: Uuid) -> DbResult<Vec<IdentityModel>> {
        let result = Identity::find()
            .filter(identity::Column::CreatorId.eq(creator_id))
            .all(&*self.db)
            .await?;
        Ok(result)
    }

    async fn update(&self, id: Uuid, data: UpdateIdentity) -> DbResult<IdentityModel> {
        let existing = Identity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or(DatabaseError::NotFound)?;

        let mut model: identity::ActiveModel = existing.into();

        if let Some(name) = data.name {
            model.name = Set(name);
        }
        if let Some(description) = data.description {
            model.description = Set(description);
        }

        model.updated_at = Set(Utc::now());

        let result = model.update(&*self.db).await?;
        Ok(result)
    }

    async fn delete(&self, id: Uuid) -> DbResult<()> {
        let result = Identity::delete_by_id(id).exec(&*self.db).await?;
        if result.rows_affected == 0 {
            return Err(DatabaseError::NotFound);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{DatabaseBackend, MockDatabase, MockExecResult};

    fn mock_identity() -> IdentityModel {
        IdentityModel {
            id: Uuid::new_v4(),
            name: "测试身份".to_string(),
            description: Some("测试描述".to_string()),
            creator_id: Uuid::new_v4(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_find_by_id() {
        let identity = mock_identity();

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([[identity.clone()]])
            .into_connection();

        let repo = IdentityRepository::new(Arc::new(db));
        let result = repo.find_by_id(identity.id).await.unwrap();

        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "测试身份");
    }

    #[tokio::test]
    async fn test_find_by_id_not_found() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<IdentityModel>::new()])
            .into_connection();

        let repo = IdentityRepository::new(Arc::new(db));
        let result = repo.find_by_id(Uuid::new_v4()).await.unwrap();

        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_find_by_creator() {
        let identity1 = mock_identity();
        let identity2 = IdentityModel {
            id: Uuid::new_v4(),
            name: "身份2".to_string(),
            description: None,
            creator_id: identity1.creator_id,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![identity1.clone(), identity2]])
            .into_connection();

        let repo = IdentityRepository::new(Arc::new(db));
        let result = repo.find_by_creator(identity1.creator_id).await.unwrap();

        assert_eq!(result.len(), 2);
    }

    #[tokio::test]
    async fn test_delete_identity() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        let repo = IdentityRepository::new(Arc::new(db));
        let result = repo.delete(Uuid::new_v4()).await;

        assert!(result.is_ok());
    }
}
