use sea_orm_migration::prelude::*;

use super::m20240101_000001_create_users_table::Users;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 创建身份表
        manager
            .create_table(
                Table::create()
                    .table(Identities::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Identities::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Identities::Name)
                            .string_len(255)
                            .not_null(),
                    )
                    .col(ColumnDef::new(Identities::Description).text().null())
                    .col(ColumnDef::new(Identities::CreatorId).uuid().not_null())
                    .col(
                        ColumnDef::new(Identities::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Identities::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_identities_creator")
                            .from(Identities::Table, Identities::CreatorId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 创建身份-用户关联表
        manager
            .create_table(
                Table::create()
                    .table(IdentityUsers::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(IdentityUsers::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(IdentityUsers::IdentityId)
                            .uuid()
                            .not_null(),
                    )
                    .col(ColumnDef::new(IdentityUsers::UserId).uuid().not_null())
                    .col(
                        ColumnDef::new(IdentityUsers::AssignedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_identity_users_identity")
                            .from(IdentityUsers::Table, IdentityUsers::IdentityId)
                            .to(Identities::Table, Identities::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_identity_users_user")
                            .from(IdentityUsers::Table, IdentityUsers::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 创建 (identity_id, user_id) 唯一约束
        manager
            .create_index(
                Index::create()
                    .name("idx_identity_users_unique")
                    .table(IdentityUsers::Table)
                    .col(IdentityUsers::IdentityId)
                    .col(IdentityUsers::UserId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // 创建 creator_id 索引
        manager
            .create_index(
                Index::create()
                    .name("idx_identities_creator_id")
                    .table(Identities::Table)
                    .col(Identities::CreatorId)
                    .to_owned(),
            )
            .await?;

        // 创建 identity_id 索引
        manager
            .create_index(
                Index::create()
                    .name("idx_identity_users_identity_id")
                    .table(IdentityUsers::Table)
                    .col(IdentityUsers::IdentityId)
                    .to_owned(),
            )
            .await?;

        // 创建 user_id 索引
        manager
            .create_index(
                Index::create()
                    .name("idx_identity_users_user_id")
                    .table(IdentityUsers::Table)
                    .col(IdentityUsers::UserId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(IdentityUsers::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(Identities::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
pub enum Identities {
    Table,
    Id,
    Name,
    Description,
    CreatorId,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
pub enum IdentityUsers {
    Table,
    Id,
    IdentityId,
    UserId,
    AssignedAt,
}
