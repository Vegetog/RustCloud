use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
    TransactionTrait,
};
use uuid::Uuid;

use crate::entities::{
    folder::{self, Entity as Folder, Model as FolderModel},
    folder_key::{self, Entity as FolderKey, Model as FolderKeyModel},
};
use crate::error::{DatabaseError, DbResult};
use crate::types::{CreateFolder, CreateFolderKey, UpdateFolder};

#[async_trait]
pub trait FolderRepositoryTrait: Send + Sync {
    async fn create(&self, data: CreateFolder) -> DbResult<FolderModel>;
    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<FolderModel>>;
    async fn find_children(&self, owner_id: Uuid, parent_id: Option<Uuid>) -> DbResult<Vec<FolderModel>>;
    async fn update(&self, id: Uuid, data: UpdateFolder) -> DbResult<FolderModel>;
    async fn delete(&self, id: Uuid) -> DbResult<()>;
    /// 列出该文件夹的所有后代（递归子树）
    async fn find_descendants(&self, folder_id: Uuid) -> DbResult<Vec<FolderModel>>;
}

#[async_trait]
pub trait FolderKeyRepositoryTrait: Send + Sync {
    async fn create(&self, data: CreateFolderKey) -> DbResult<FolderKeyModel>;
    async fn find_by_folder_and_user(
        &self,
        folder_id: Uuid,
        user_id: Uuid,
    ) -> DbResult<Option<FolderKeyModel>>;
    async fn find_by_folder(&self, folder_id: Uuid) -> DbResult<Vec<FolderKeyModel>>;
    async fn upsert(&self, data: CreateFolderKey) -> DbResult<FolderKeyModel>;
    async fn delete_by_folder_and_user(&self, folder_id: Uuid, user_id: Uuid) -> DbResult<()>;
}

pub struct FolderRepository {
    db: Arc<DatabaseConnection>,
}

impl FolderRepository {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl FolderRepositoryTrait for FolderRepository {
    async fn create(&self, data: CreateFolder) -> DbResult<FolderModel> {
        let now = Utc::now();
        let id = Uuid::new_v4();

        let txn = self.db.begin().await?;

        let model = folder::ActiveModel {
            id: Set(id),
            owner_id: Set(data.owner_id),
            parent_id: Set(data.parent_id),
            encrypted_name: Set(data.encrypted_name.clone()),
            created_at: Set(now),
            updated_at: Set(now),
        };

        let folder = model.insert(&txn).await?;

        // 同时为 owner 写入 folder_key（permission_level=2=Owner）
        let key_model = folder_key::ActiveModel {
            id: Set(Uuid::new_v4()),
            folder_id: Set(id),
            user_id: Set(data.owner_id),
            encrypted_name: Set(data.encrypted_name),
            permission_level: Set(crate::entities::document_key::PermissionLevel::Owner),
            created_at: Set(now),
        };
        key_model.insert(&txn).await?;

        txn.commit().await?;

        Ok(folder)
    }

    async fn find_by_id(&self, id: Uuid) -> DbResult<Option<FolderModel>> {
        Ok(Folder::find_by_id(id).one(&*self.db).await?)
    }

    async fn find_children(&self, owner_id: Uuid, parent_id: Option<Uuid>) -> DbResult<Vec<FolderModel>> {
        let query = Folder::find()
            .filter(folder::Column::OwnerId.eq(owner_id));

        let query = match parent_id {
            Some(pid) => query.filter(folder::Column::ParentId.eq(pid)),
            None => query.filter(folder::Column::ParentId.is_null()),
        };

        Ok(query
            .order_by_asc(folder::Column::CreatedAt)
            .all(&*self.db)
            .await?)
    }

    async fn update(&self, id: Uuid, data: UpdateFolder) -> DbResult<FolderModel> {
        let folder = Folder::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or(DatabaseError::NotFound)?;

        let mut model: folder::ActiveModel = folder.into();

        if let Some(name) = data.encrypted_name {
            model.encrypted_name = Set(name);
        }
        if let Some(parent) = data.parent_id {
            model.parent_id = Set(parent);
        }
        model.updated_at = Set(Utc::now());

        Ok(model.update(&*self.db).await?)
    }

    async fn delete(&self, id: Uuid) -> DbResult<()> {
        let result = Folder::delete_by_id(id).exec(&*self.db).await?;
        if result.rows_affected == 0 {
            return Err(DatabaseError::NotFound);
        }
        Ok(())
    }

    async fn find_descendants(&self, folder_id: Uuid) -> DbResult<Vec<FolderModel>> {
        // 递归 BFS 收集所有后代文件夹
        let mut result = Vec::new();
        let mut queue = vec![folder_id];

        while !queue.is_empty() {
            let children = Folder::find()
                .filter(folder::Column::ParentId.is_in(queue.clone()))
                .all(&*self.db)
                .await?;

            queue = children.iter().map(|f| f.id).collect();
            result.extend(children);
        }

        Ok(result)
    }
}

pub struct FolderKeyRepository {
    db: Arc<DatabaseConnection>,
}

impl FolderKeyRepository {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl FolderKeyRepositoryTrait for FolderKeyRepository {
    async fn create(&self, data: CreateFolderKey) -> DbResult<FolderKeyModel> {
        let model = folder_key::ActiveModel {
            id: Set(Uuid::new_v4()),
            folder_id: Set(data.folder_id),
            user_id: Set(data.user_id),
            encrypted_name: Set(data.encrypted_name),
            permission_level: Set(data.permission_level),
            created_at: Set(Utc::now()),
        };
        Ok(model.insert(&*self.db).await?)
    }

    async fn find_by_folder_and_user(
        &self,
        folder_id: Uuid,
        user_id: Uuid,
    ) -> DbResult<Option<FolderKeyModel>> {
        Ok(FolderKey::find()
            .filter(folder_key::Column::FolderId.eq(folder_id))
            .filter(folder_key::Column::UserId.eq(user_id))
            .one(&*self.db)
            .await?)
    }

    async fn find_by_folder(&self, folder_id: Uuid) -> DbResult<Vec<FolderKeyModel>> {
        Ok(FolderKey::find()
            .filter(folder_key::Column::FolderId.eq(folder_id))
            .all(&*self.db)
            .await?)
    }

    async fn upsert(&self, data: CreateFolderKey) -> DbResult<FolderKeyModel> {
        // 查找已有记录，有则更新，无则创建
        if let Some(existing) = self
            .find_by_folder_and_user(data.folder_id, data.user_id)
            .await?
        {
            let mut model: folder_key::ActiveModel = existing.into();
            model.encrypted_name = Set(data.encrypted_name);
            model.permission_level = Set(data.permission_level);
            Ok(model.update(&*self.db).await?)
        } else {
            self.create(data).await
        }
    }

    async fn delete_by_folder_and_user(&self, folder_id: Uuid, user_id: Uuid) -> DbResult<()> {
        use sea_orm::ModelTrait;
        let key = FolderKey::find()
            .filter(folder_key::Column::FolderId.eq(folder_id))
            .filter(folder_key::Column::UserId.eq(user_id))
            .one(&*self.db)
            .await?
            .ok_or(DatabaseError::NotFound)?;
        key.delete(&*self.db).await?;
        Ok(())
    }
}
