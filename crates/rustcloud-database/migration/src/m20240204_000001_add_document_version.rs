use sea_orm_migration::prelude::*;

use super::m20240101_000002_create_documents_table::Documents;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add version, locked_by, and locked_at columns to documents table
        manager
            .alter_table(
                Table::alter()
                    .table(Documents::Table)
                    // Add version column for optimistic locking
                    .add_column(
                        ColumnDef::new(Alias::new("version"))
                            .big_integer()
                            .not_null()
                            .default(1),
                    )
                    // Add locked_by column (nullable, for display only)
                    .add_column(
                        ColumnDef::new(Alias::new("locked_by"))
                            .uuid()
                            .null(),
                    )
                    // Add locked_at column (nullable)
                    .add_column(
                        ColumnDef::new(Alias::new("locked_at"))
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .to_owned(),
            )
            .await?;

        // Create index on version for conflict detection
        manager
            .create_index(
                Index::create()
                    .name("idx_documents_version")
                    .table(Documents::Table)
                    .col(Alias::new("version"))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop index first
        manager
            .drop_index(
                Index::drop()
                    .name("idx_documents_version")
                    .table(Documents::Table)
                    .to_owned(),
            )
            .await?;

        // Drop columns
        manager
            .alter_table(
                Table::alter()
                    .table(Documents::Table)
                    .drop_column(Alias::new("locked_at"))
                    .drop_column(Alias::new("locked_by"))
                    .drop_column(Alias::new("version"))
                    .to_owned(),
            )
            .await
    }
}
