//! 分享链接仓储实现

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use crate::entities::share_link::{self, Entity as ShareLink, Model as ShareLinkModel};
use crate::error::{DatabaseError, DbResult};
use crate::types::CreateShareLink;

/// 用于依赖注入的分享链接仓储特征
#[async_trait]
pub trait ShareLinkRepositoryTrait: Send + Sync {
    /// 创建新的分享链接
    async fn create(&self, data: CreateShareLink) -> DbResult<ShareLinkModel>;

    /// 根据访问令牌查询分享链接
    async fn find_by_token(&self, token: &str) -> DbResult<Option<ShareLinkModel>>;

    /// 根据 ID 查询分享链接
    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<ShareLinkModel>>;

    /// 查询用户创建的全部分享链接
    async fn find_by_creator(&self, creator_id: Uuid) -> DbResult<Vec<ShareLinkModel>>;

    /// 增加访问计数
    async fn increment_access_count(&self, id: Uuid) -> DbResult<()>;

    /// 根据 ID 删除分享链接
    async fn delete(&self, id: Uuid) -> DbResult<()>;
}

/// 分享链接仓储实现
pub struct ShareLinkRepository {
    db: Arc<DatabaseConnection>,
}

impl ShareLinkRepository {
    /// 创建新的分享链接仓储
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl ShareLinkRepositoryTrait for ShareLinkRepository {
    async fn create(&self, data: CreateShareLink) -> DbResult<ShareLinkModel> {
        let id = Uuid::new_v4();

        let model = share_link::ActiveModel {
            id: Set(id),
            target_type: Set(data.target_type),
            document_id: Set(data.document_id),
            folder_id: Set(data.folder_id),
            creator_id: Set(data.creator_id),
            access_token: Set(data.access_token),
            encrypted_key: Set(data.encrypted_key),
            ephemeral_pubkey: Set(data.ephemeral_pubkey),
            manifest: Set(data.manifest),
            expires_at: Set(data.expires_at),
            max_access_count: Set(data.max_access_count),
            access_count: Set(0),
            created_at: Set(Utc::now()),
        };

        let result = model.insert(&*self.db).await?;
        Ok(result)
    }

    async fn find_by_token(&self, token: &str) -> DbResult<Option<ShareLinkModel>> {
        let result = ShareLink::find()
            .filter(share_link::Column::AccessToken.eq(token))
            .one(&*self.db)
            .await?;
        Ok(result)
    }

    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<ShareLinkModel>> {
        let result = ShareLink::find_by_id(id).one(&*self.db).await?;
        Ok(result)
    }

    async fn find_by_creator(&self, creator_id: Uuid) -> DbResult<Vec<ShareLinkModel>> {
        let result = ShareLink::find()
            .filter(share_link::Column::CreatorId.eq(creator_id))
            .all(&*self.db)
            .await?;
        Ok(result)
    }

    async fn increment_access_count(&self, id: Uuid) -> DbResult<()> {
        let link = ShareLink::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or(DatabaseError::NotFound)?;

        let mut model: share_link::ActiveModel = link.clone().into();
        model.access_count = Set(link.access_count + 1);
        model.update(&*self.db).await?;
        Ok(())
    }

    async fn delete(&self, id: Uuid) -> DbResult<()> {
        let result = ShareLink::delete_by_id(id).exec(&*self.db).await?;
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

    fn mock_share_link() -> ShareLinkModel {
        ShareLinkModel {
            id: Uuid::new_v4(),
            target_type: 0,
            document_id: Some(Uuid::new_v4()),
            folder_id: None,
            creator_id: Uuid::new_v4(),
            access_token: "token123".to_string(),
            encrypted_key: "enckey".to_string(),
            ephemeral_pubkey: None,
            manifest: None,
            expires_at: None,
            max_access_count: Some(10),
            access_count: 0,
            created_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_find_by_token() {
        let link = mock_share_link();

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([[link.clone()]])
            .into_connection();

        let repo = ShareLinkRepository::new(Arc::new(db));
        let result = repo.find_by_token("token123").await.unwrap();

        assert!(result.is_some());
        assert_eq!(result.unwrap().access_token, "token123");
    }

    #[tokio::test]
    async fn test_find_by_token_not_found() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<ShareLinkModel>::new()])
            .into_connection();

        let repo = ShareLinkRepository::new(Arc::new(db));
        let result = repo.find_by_token("nonexistent").await.unwrap();

        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_delete_share_link() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        let repo = ShareLinkRepository::new(Arc::new(db));
        let result = repo.delete(Uuid::new_v4()).await;

        assert!(result.is_ok());
    }

}
