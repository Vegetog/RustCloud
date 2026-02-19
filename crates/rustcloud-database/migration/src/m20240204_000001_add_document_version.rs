use sea_orm_migration::prelude::*;

use super::m20240101_000002_create_documents_table::Documents;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 向文档表添加 version、locked_by 和 locked_at 列
        manager
            .alter_table(
                Table::alter()
                    .table(Documents::Table)
                    // 添加 version 列，用于乐观锁
                    .add_column(
                        ColumnDef::new(Alias::new("version"))
                            .big_integer()
                            .not_null()
                            .default(1),
                    )
                    // 添加 locked_by 列（可为空，仅用于显示）
                    .add_column(
                        ColumnDef::new(Alias::new("locked_by"))
                            .uuid()
                            .null(),
                    )
                    // 添加 locked_at 列（可为空）
                    .add_column(
                        ColumnDef::new(Alias::new("locked_at"))
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .to_owned(),
            )
            .await?;

        // 创建 version 索引，用于冲突检测
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
        // 先删除索引
        manager
            .drop_index(
                Index::drop()
                    .name("idx_documents_version")
                    .table(Documents::Table)
                    .to_owned(),
            )
            .await?;

        // 删除列
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
