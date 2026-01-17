use sea_orm_migration::prelude::*;

use super::m20240101_000002_create_documents_table::Documents;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add content_nonce column to documents table
        manager
            .alter_table(
                Table::alter()
                    .table(Documents::Table)
                    .add_column(
                        ColumnDef::new(Alias::new("content_nonce"))
                            .string_len(48)
                            .not_null()
                            .default(""), // Temporary default for existing rows
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop content_nonce column
        manager
            .alter_table(
                Table::alter()
                    .table(Documents::Table)
                    .drop_column(Alias::new("content_nonce"))
                    .to_owned(),
            )
            .await
    }
}
