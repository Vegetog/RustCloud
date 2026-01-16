//! Document key repository implementation

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use crate::entities::document_key::{
    self, Entity as DocumentKey, Model as DocumentKeyModel, PermissionLevel,
};
use crate::error::{DatabaseError, DbResult};
use crate::types::CreateDocumentKey;

/// Document key repository trait for dependency injection
#[async_trait]
pub trait DocumentKeyRepositoryTrait: Send + Sync {
    /// Create a new document key
    async fn create(&self, data: CreateDocumentKey) -> DbResult<DocumentKeyModel>;

    /// Find key by document and user
    async fn find_by_document_and_user(
        &self,
        doc_id: Uuid,
        user_id: Uuid,
    ) -> DbResult<Option<DocumentKeyModel>>;

    /// Find all keys for a document
    async fn find_by_document(&self, doc_id: Uuid) -> DbResult<Vec<DocumentKeyModel>>;

    /// Find all keys for a user
    async fn find_by_user(&self, user_id: Uuid) -> DbResult<Vec<DocumentKeyModel>>;

    /// Update permission level
    async fn update_permission(&self, id: Uuid, level: PermissionLevel) -> DbResult<()>;

    /// Delete key by ID
    async fn delete(&self, id: Uuid) -> DbResult<()>;

    /// Delete all keys for a document
    async fn delete_by_document(&self, doc_id: Uuid) -> DbResult<u64>;
}

/// Document key repository implementation
pub struct DocumentKeyRepository {
    db: Arc<DatabaseConnection>,
}

impl DocumentKeyRepository {
    /// Create a new document key repository
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

    async fn find_by_user(&self, user_id: Uuid) -> DbResult<Vec<DocumentKeyModel>> {
        let result = DocumentKey::find()
            .filter(document_key::Column::UserId.eq(user_id))
            .all(&*self.db)
            .await?;
        Ok(result)
    }

    async fn update_permission(&self, id: Uuid, level: PermissionLevel) -> DbResult<()> {
        let key = DocumentKey::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or(DatabaseError::NotFound)?;

        let mut model: document_key::ActiveModel = key.into();
        model.permission_level = Set(level);
        model.update(&*self.db).await?;
        Ok(())
    }

    async fn delete(&self, id: Uuid) -> DbResult<()> {
        let result = DocumentKey::delete_by_id(id).exec(&*self.db).await?;
        if result.rows_affected == 0 {
            return Err(DatabaseError::NotFound);
        }
        Ok(())
    }

    async fn delete_by_document(&self, doc_id: Uuid) -> DbResult<u64> {
        let result = DocumentKey::delete_many()
            .filter(document_key::Column::DocumentId.eq(doc_id))
            .exec(&*self.db)
            .await?;
        Ok(result.rows_affected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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

    #[tokio::test]
    async fn test_delete_by_document() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 3,
            }])
            .into_connection();

        let repo = DocumentKeyRepository::new(Arc::new(db));
        let result = repo.delete_by_document(Uuid::new_v4()).await.unwrap();

        assert_eq!(result, 3);
    }
}
