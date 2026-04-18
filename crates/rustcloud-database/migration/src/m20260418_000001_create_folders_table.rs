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
                    .table(Folders::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Folders::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Folders::OwnerId).uuid().not_null())
                    .col(ColumnDef::new(Folders::ParentId).uuid().null())
                    .col(ColumnDef::new(Folders::EncryptedName).text().not_null())
                    .col(
                        ColumnDef::new(Folders::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Folders::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_folders_owner")
                            .from(Folders::Table, Folders::OwnerId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_folders_parent")
                            .from(Folders::Table, Folders::ParentId)
                            .to(Folders::Table, Folders::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_folders_owner_id")
                    .table(Folders::Table)
                    .col(Folders::OwnerId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_folders_parent_id")
                    .table(Folders::Table)
                    .col(Folders::ParentId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_folders_owner_parent")
                    .table(Folders::Table)
                    .col(Folders::OwnerId)
                    .col(Folders::ParentId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Folders::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
pub enum Folders {
    Table,
    Id,
    OwnerId,
    ParentId,
    EncryptedName,
    CreatedAt,
    UpdatedAt,
}
