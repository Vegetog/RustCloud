use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("share_links"))
                    .drop_column(Alias::new("password_hash"))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("share_links"))
                    .add_column(
                        ColumnDef::new(Alias::new("password_hash"))
                            .string_len(255)
                            .null(),
                    )
                    .to_owned(),
            )
            .await
    }
}
