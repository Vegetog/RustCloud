use sea_orm_migration::prelude::*;

use super::m20240101_000001_create_users_table::Users;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Documents::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Documents::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Documents::OwnerId).uuid().not_null())
                    .col(ColumnDef::new(Documents::EncryptedName).text().not_null())
                    .col(
                        ColumnDef::new(Documents::NameNonce)
                            .string_len(48)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Documents::ContentHash)
                            .string_len(64)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Documents::StoragePath)
                            .string_len(255)
                            .not_null(),
                    )
                    .col(ColumnDef::new(Documents::Size).big_integer().not_null())
                    .col(
                        ColumnDef::new(Documents::MimeType)
                            .string_len(127)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Documents::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Documents::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_documents_owner")
                            .from(Documents::Table, Documents::OwnerId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 创建 owner_id 索引，用于查询用户文档
        manager
            .create_index(
                Index::create()
                    .name("idx_documents_owner_id")
                    .table(Documents::Table)
                    .col(Documents::OwnerId)
                    .to_owned(),
            )
            .await?;

        // 创建 created_at 索引，用于排序
        manager
            .create_index(
                Index::create()
                    .name("idx_documents_created_at")
                    .table(Documents::Table)
                    .col(Documents::CreatedAt)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Documents::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
pub enum Documents {
    Table,
    Id,
    OwnerId,
    EncryptedName,
    NameNonce,
    ContentHash,
    StoragePath,
    Size,
    MimeType,
    CreatedAt,
    UpdatedAt,
}
