use sea_orm_migration::prelude::*;

use super::m20240101_000001_create_users_table::Users;
use super::m20240101_000002_create_documents_table::Documents;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(DocumentKeys::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(DocumentKeys::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(DocumentKeys::DocumentId).uuid().not_null())
                    .col(ColumnDef::new(DocumentKeys::UserId).uuid().not_null())
                    .col(ColumnDef::new(DocumentKeys::EncryptedKey).text().not_null())
                    .col(
                        ColumnDef::new(DocumentKeys::PermissionLevel)
                            .small_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(DocumentKeys::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_document_keys_document")
                            .from(DocumentKeys::Table, DocumentKeys::DocumentId)
                            .to(Documents::Table, Documents::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_document_keys_user")
                            .from(DocumentKeys::Table, DocumentKeys::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 创建 (document_id, user_id) 唯一约束
        manager
            .create_index(
                Index::create()
                    .name("idx_document_keys_unique")
                    .table(DocumentKeys::Table)
                    .col(DocumentKeys::DocumentId)
                    .col(DocumentKeys::UserId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // 创建 document_id 索引，用于查询文档密钥
        manager
            .create_index(
                Index::create()
                    .name("idx_document_keys_document_id")
                    .table(DocumentKeys::Table)
                    .col(DocumentKeys::DocumentId)
                    .to_owned(),
            )
            .await?;

        // 创建 user_id 索引，用于查询用户可访问的文档
        manager
            .create_index(
                Index::create()
                    .name("idx_document_keys_user_id")
                    .table(DocumentKeys::Table)
                    .col(DocumentKeys::UserId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(DocumentKeys::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum DocumentKeys {
    Table,
    Id,
    DocumentId,
    UserId,
    EncryptedKey,
    PermissionLevel,
    CreatedAt,
}
