use sea_orm_migration::prelude::*;

use super::m20240101_000002_create_documents_table::Documents;
use super::m20260418_000001_create_folders_table::Folders;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Documents::Table)
                    .add_column(ColumnDef::new(Alias::new("folder_id")).uuid().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_foreign_key(
                ForeignKey::create()
                    .name("fk_documents_folder")
                    .from(Documents::Table, Alias::new("folder_id"))
                    .to(Folders::Table, Folders::Id)
                    .on_delete(ForeignKeyAction::SetNull)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_documents_owner_folder")
                    .table(Documents::Table)
                    .col(Documents::OwnerId)
                    .col(Alias::new("folder_id"))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_foreign_key(
                ForeignKey::drop()
                    .name("fk_documents_folder")
                    .table(Documents::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Documents::Table)
                    .drop_column(Alias::new("folder_id"))
                    .to_owned(),
            )
            .await
    }
}
