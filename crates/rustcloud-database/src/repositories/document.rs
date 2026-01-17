//! Document repository implementation

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, JoinType, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, RelationTrait, Set,
};
use uuid::Uuid;

use crate::entities::{
    document::{self, Entity as Document, Model as DocumentModel},
    document_key,
};
use crate::error::{DatabaseError, DbResult};
use crate::pagination::Page;
use crate::types::{CreateDocument, DocumentListParams, SortField, SortOrder, UpdateDocument};

/// Document repository trait for dependency injection
#[async_trait]
pub trait DocumentRepositoryTrait: Send + Sync {
    /// Create a new document
    async fn create(&self, data: CreateDocument) -> DbResult<DocumentModel>;

    /// Find document by ID
    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<DocumentModel>>;

    /// Find documents by owner with pagination
    async fn find_by_owner(
        &self,
        owner_id: Uuid,
        params: DocumentListParams,
    ) -> DbResult<Page<DocumentModel>>;

    /// Find documents accessible to user (owned + shared)
    async fn find_accessible(
        &self,
        user_id: Uuid,
        params: DocumentListParams,
    ) -> DbResult<Page<DocumentModel>>;

    /// Update document fields
    async fn update(&self, id: Uuid, data: UpdateDocument) -> DbResult<DocumentModel>;

    /// Delete document by ID
    async fn delete(&self, id: Uuid) -> DbResult<()>;
}

/// Document repository implementation
pub struct DocumentRepository {
    db: Arc<DatabaseConnection>,
}

impl DocumentRepository {
    /// Create a new document repository
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// Apply sorting to query
    fn apply_sort(
        query: sea_orm::Select<Document>,
        sort_by: &SortField,
        sort_order: &SortOrder,
    ) -> sea_orm::Select<Document> {
        match (sort_by, sort_order) {
            (SortField::CreatedAt, SortOrder::Asc) => query.order_by_asc(document::Column::CreatedAt),
            (SortField::CreatedAt, SortOrder::Desc) => {
                query.order_by_desc(document::Column::CreatedAt)
            }
            (SortField::UpdatedAt, SortOrder::Asc) => query.order_by_asc(document::Column::UpdatedAt),
            (SortField::UpdatedAt, SortOrder::Desc) => {
                query.order_by_desc(document::Column::UpdatedAt)
            }
            (SortField::Size, SortOrder::Asc) => query.order_by_asc(document::Column::Size),
            (SortField::Size, SortOrder::Desc) => query.order_by_desc(document::Column::Size),
        }
    }
}

#[async_trait]
impl DocumentRepositoryTrait for DocumentRepository {
    async fn create(&self, data: CreateDocument) -> DbResult<DocumentModel> {
        let now = Utc::now();
        let id = Uuid::new_v4();

        let model = document::ActiveModel {
            id: Set(id),
            owner_id: Set(data.owner_id),
            encrypted_name: Set(data.encrypted_name),
            name_nonce: Set(data.name_nonce),
            content_nonce: Set(data.content_nonce),
            content_hash: Set(data.content_hash),
            storage_path: Set(data.storage_path),
            size: Set(data.size),
            mime_type: Set(data.mime_type),
            created_at: Set(now),
            updated_at: Set(now),
        };

        let result = model.insert(&*self.db).await?;
        Ok(result)
    }

    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<DocumentModel>> {
        let result = Document::find_by_id(id).one(&*self.db).await?;
        Ok(result)
    }

    async fn find_by_owner(
        &self,
        owner_id: Uuid,
        params: DocumentListParams,
    ) -> DbResult<Page<DocumentModel>> {
        let query = Document::find().filter(document::Column::OwnerId.eq(owner_id));

        let query = Self::apply_sort(query, &params.sort_by, &params.sort_order);

        // Get total count
        let total = query.clone().count(&*self.db).await?;

        // Apply pagination
        let items = query
            .offset(params.offset())
            .limit(params.limit())
            .all(&*self.db)
            .await?;

        Ok(Page::new(items, total, params.page, params.page_size))
    }

    async fn find_accessible(
        &self,
        user_id: Uuid,
        params: DocumentListParams,
    ) -> DbResult<Page<DocumentModel>> {
        // Find documents where user has a key (owned + shared with user)
        let query = Document::find()
            .join(JoinType::InnerJoin, document::Relation::DocumentKeys.def())
            .filter(document_key::Column::UserId.eq(user_id));

        let query = Self::apply_sort(query, &params.sort_by, &params.sort_order);

        let total = query.clone().count(&*self.db).await?;

        let items = query
            .offset(params.offset())
            .limit(params.limit())
            .all(&*self.db)
            .await?;

        Ok(Page::new(items, total, params.page, params.page_size))
    }

    async fn update(&self, id: Uuid, data: UpdateDocument) -> DbResult<DocumentModel> {
        let doc = Document::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or(DatabaseError::NotFound)?;

        let mut model: document::ActiveModel = doc.into();

        if let Some(encrypted_name) = data.encrypted_name {
            model.encrypted_name = Set(encrypted_name);
        }
        if let Some(name_nonce) = data.name_nonce {
            model.name_nonce = Set(name_nonce);
        }
        if let Some(content_hash) = data.content_hash {
            model.content_hash = Set(content_hash);
        }
        if let Some(storage_path) = data.storage_path {
            model.storage_path = Set(storage_path);
        }
        if let Some(size) = data.size {
            model.size = Set(size);
        }
        model.updated_at = Set(Utc::now());

        let result = model.update(&*self.db).await?;
        Ok(result)
    }

    async fn delete(&self, id: Uuid) -> DbResult<()> {
        let result = Document::delete_by_id(id).exec(&*self.db).await?;
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

    fn mock_document() -> DocumentModel {
        DocumentModel {
            id: Uuid::new_v4(),
            owner_id: Uuid::new_v4(),
            encrypted_name: "encname".to_string(),
            name_nonce: "nonce".to_string(),
            content_nonce: "content_nonce".to_string(),
            content_hash: "hash".to_string(),
            storage_path: "/path/to/file".to_string(),
            size: 1024,
            mime_type: "application/pdf".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_find_by_id() {
        let doc = mock_document();
        let doc_id = doc.id;

        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([[doc]])
            .into_connection();

        let repo = DocumentRepository::new(Arc::new(db));
        let result = repo.find_by_id(doc_id).await.unwrap();

        assert!(result.is_some());
        assert_eq!(result.unwrap().id, doc_id);
    }

    #[tokio::test]
    async fn test_find_by_id_not_found() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<DocumentModel>::new()])
            .into_connection();

        let repo = DocumentRepository::new(Arc::new(db));
        let result = repo.find_by_id(Uuid::new_v4()).await.unwrap();

        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_delete_document() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        let repo = DocumentRepository::new(Arc::new(db));
        let result = repo.delete(Uuid::new_v4()).await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_document_not_found() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 0,
            }])
            .into_connection();

        let repo = DocumentRepository::new(Arc::new(db));
        let result = repo.delete(Uuid::new_v4()).await;

        assert!(matches!(result, Err(DatabaseError::NotFound)));
    }
}
