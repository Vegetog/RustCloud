//! 文档密钥仓储实现

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use crate::entities::document_key::{self, Entity as DocumentKey, Model as DocumentKeyModel};
use crate::error::{DatabaseError, DbResult};
use crate::types::CreateDocumentKey;

/// 用于依赖注入的文档密钥仓储特征
#[async_trait]
pub trait DocumentKeyRepositoryTrait: Send + Sync {
    /// 创建新的文档密钥
    async fn create(&self, data: CreateDocumentKey) -> DbResult<DocumentKeyModel>;

    /// 根据文档和用户查询密钥
    async fn find_by_document_and_user(
        &self,
        doc_id: Uuid,
        user_id: Uuid,
    ) -> DbResult<Option<DocumentKeyModel>>;

    /// 查询文档的全部密钥
    async fn find_by_document(&self, doc_id: Uuid) -> DbResult<Vec<DocumentKeyModel>>;

    /// 根据 ID 删除密钥
    async fn delete(&self, id: Uuid) -> DbResult<()>;

    /// 批量查询指定用户对一组文档的密钥（用于快照）
    async fn find_by_user_and_documents(
        &self,
        user_id: Uuid,
        doc_ids: Vec<Uuid>,
    ) -> DbResult<Vec<DocumentKeyModel>>;

    /// 不存在则创建，存在则更新（幂等授权）
    async fn upsert(&self, data: CreateDocumentKey) -> DbResult<DocumentKeyModel>;
}

/// 文档密钥仓储实现
pub struct DocumentKeyRepository {
    db: Arc<DatabaseConnection>,
}

impl DocumentKeyRepository {
    /// 创建新的文档密钥仓储
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl DocumentKeyRepositoryTrait for DocumentKeyRepository {
    async fn create(&self, data: CreateDocumentKey) -> DbResult<DocumentKeyModel> {
        let id = Uuid::new_v4();

        let model = document_key::ActiveModel {
            id: Set(id),
            document_id: Set(data.document_id),
            user_id: Set(data.user_id),
            encrypted_key: Set(data.encrypted_key),
            permission_level: Set(data.permission_level),
            created_at: Set(Utc::now()),
        };

        let result = model.insert(&*self.db).await?;
        Ok(result)
    }

    async fn find_by_document_and_user(
        &self,
        doc_id: Uuid,
        user_id: Uuid,
    ) -> DbResult<Option<DocumentKeyModel>> {
        let result = DocumentKey::find()
            .filter(document_key::Column::DocumentId.eq(doc_id))
            .filter(document_key::Column::UserId.eq(user_id))
            .one(&*self.db)
            .await?;
        Ok(result)
    }

    async fn find_by_document(&self, doc_id: Uuid) -> DbResult<Vec<DocumentKeyModel>> {
        let result = DocumentKey::find()
            .filter(document_key::Column::DocumentId.eq(doc_id))
            .all(&*self.db)
            .await?;
        Ok(result)
    }

    async fn delete(&self, id: Uuid) -> DbResult<()> {
        let result = DocumentKey::delete_by_id(id).exec(&*self.db).await?;
        if result.rows_affected == 0 {
            return Err(DatabaseError::NotFound);
        }
        Ok(())
    }

    async fn find_by_user_and_documents(
        &self,
        user_id: Uuid,
        doc_ids: Vec<Uuid>,
    ) -> DbResult<Vec<DocumentKeyModel>> {
        if doc_ids.is_empty() {
            return Ok(vec![]);
        }
        Ok(DocumentKey::find()
            .filter(document_key::Column::UserId.eq(user_id))
            .filter(document_key::Column::DocumentId.is_in(doc_ids))
            .all(&*self.db)
            .await?)
    }

    async fn upsert(&self, data: CreateDocumentKey) -> DbResult<DocumentKeyModel> {
        if let Some(existing) = self
            .find_by_document_and_user(data.document_id, data.user_id)
            .await?
        {
            let mut model: document_key::ActiveModel = existing.into();
            model.encrypted_key = Set(data.encrypted_key);
            model.permission_level = Set(data.permission_level);
            Ok(model.update(&*self.db).await?)
        } else {
            self.create(data).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::document_key::PermissionLevel;
    use sea_orm::{DatabaseBackend, MockDatabase, MockExecResult};

    fn mock_document_key() -> DocumentKeyModel {
        DocumentKeyModel {
            id: Uuid::new_v4(),
            document_id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            encrypted_key: "enckey".to_string(),
            permission_level: PermissionLevel::Read,
            created_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_find_by_document_and_user() {
        let key = mock_document_key();
        let doc_id = key.document_id;
        let user_id = key.user_id;

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([[key.clone()]])
            .into_connection();

        let repo = DocumentKeyRepository::new(Arc::new(db));
        let result = repo.find_by_document_and_user(doc_id, user_id).await.unwrap();

        assert!(result.is_some());
        let found = result.unwrap();
        assert_eq!(found.document_id, doc_id);
        assert_eq!(found.user_id, user_id);
    }

    #[tokio::test]
    async fn test_find_by_document() {
        let key1 = mock_document_key();
        let key2 = DocumentKeyModel {
            id: Uuid::new_v4(),
            document_id: key1.document_id,
            user_id: Uuid::new_v4(),
            encrypted_key: "enckey2".to_string(),
            permission_level: PermissionLevel::Write,
            created_at: Utc::now(),
        };

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![key1.clone(), key2]])
            .into_connection();

        let repo = DocumentKeyRepository::new(Arc::new(db));
        let result = repo.find_by_document(key1.document_id).await.unwrap();

        assert_eq!(result.len(), 2);
    }

    #[tokio::test]
    async fn test_delete_key() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        let repo = DocumentKeyRepository::new(Arc::new(db));
        let result = repo.delete(Uuid::new_v4()).await;

        assert!(result.is_ok());
    }

}
