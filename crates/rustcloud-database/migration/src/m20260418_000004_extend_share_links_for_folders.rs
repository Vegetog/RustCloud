use sea_orm_migration::prelude::*;

use super::m20260418_000001_create_folders_table::Folders;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 添加 target_type 字段（0=Document, 1=Folder）
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("share_links"))
                    .add_column(
                        ColumnDef::new(Alias::new("target_type"))
                            .small_integer()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;

        // document_id 改为 nullable（原来 not null，先允许 null）
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("share_links"))
                    .modify_column(ColumnDef::new(Alias::new("document_id")).uuid().null())
                    .to_owned(),
            )
            .await?;

        // 添加 folder_id 字段
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("share_links"))
                    .add_column(ColumnDef::new(Alias::new("folder_id")).uuid().null())
                    .to_owned(),
            )
            .await?;

        // folder_id 外键
        manager
            .create_foreign_key(
                ForeignKey::create()
                    .name("fk_share_links_folder")
                    .from(Alias::new("share_links"), Alias::new("folder_id"))
                    .to(Folders::Table, Folders::Id)
                    .on_delete(ForeignKeyAction::Cascade)
                    .to_owned(),
            )
            .await?;

        // 添加 ephemeral_pubkey 和 manifest 字段（公开链接分享文件夹用）
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("share_links"))
                    .add_column(ColumnDef::new(Alias::new("ephemeral_pubkey")).text().null())
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("share_links"))
                    .add_column(ColumnDef::new(Alias::new("manifest")).text().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_share_links_folder_id")
                    .table(Alias::new("share_links"))
                    .col(Alias::new("folder_id"))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_foreign_key(
                ForeignKey::drop()
                    .name("fk_share_links_folder")
                    .table(Alias::new("share_links"))
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("share_links"))
                    .drop_column(Alias::new("manifest"))
                    .drop_column(Alias::new("ephemeral_pubkey"))
                    .drop_column(Alias::new("folder_id"))
                    .drop_column(Alias::new("target_type"))
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("share_links"))
                    .modify_column(ColumnDef::new(Alias::new("document_id")).uuid().not_null())
                    .to_owned(),
            )
            .await
    }
}
