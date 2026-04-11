use sea_orm_migration::prelude::*;

use super::m20240101_000002_create_documents_table::Documents;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 移除文档编辑锁字段（已改用 Yjs 实时协同编辑）
        manager
            .alter_table(
                Table::alter()
                    .table(Documents::Table)
                    .drop_column(Alias::new("locked_by"))
                    .drop_column(Alias::new("locked_at"))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Documents::Table)
                    .add_column(ColumnDef::new(Alias::new("locked_by")).uuid().null())
                    .add_column(
                        ColumnDef::new(Alias::new("locked_at"))
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .to_owned(),
            )
            .await
    }
}
