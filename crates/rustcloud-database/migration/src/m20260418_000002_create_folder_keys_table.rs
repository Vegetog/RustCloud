use sea_orm_migration::prelude::*;

use super::m20240101_000001_create_users_table::Users;
use super::m20260418_000001_create_folders_table::Folders;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(FolderKeys::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(FolderKeys::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(FolderKeys::FolderId).uuid().not_null())
                    .col(ColumnDef::new(FolderKeys::UserId).uuid().not_null())
                    .col(ColumnDef::new(FolderKeys::EncryptedName).text().not_null())
                    .col(
                        ColumnDef::new(FolderKeys::PermissionLevel)
                            .small_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(FolderKeys::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_folder_keys_folder")
                            .from(FolderKeys::Table, FolderKeys::FolderId)
                            .to(Folders::Table, Folders::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_folder_keys_user")
                            .from(FolderKeys::Table, FolderKeys::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_folder_keys_unique")
                    .table(FolderKeys::Table)
                    .col(FolderKeys::FolderId)
                    .col(FolderKeys::UserId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_folder_keys_folder_id")
                    .table(FolderKeys::Table)
                    .col(FolderKeys::FolderId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_folder_keys_user_id")
                    .table(FolderKeys::Table)
                    .col(FolderKeys::UserId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(FolderKeys::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
pub enum FolderKeys {
    Table,
    Id,
    FolderId,
    UserId,
    EncryptedName,
    PermissionLevel,
    CreatedAt,
}
