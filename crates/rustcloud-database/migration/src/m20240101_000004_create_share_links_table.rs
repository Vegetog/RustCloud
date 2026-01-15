use sea_orm_migration::prelude::*;

use super::m20240101_000001_create_users_table::Users;
use super::m20240101_000002_create_documents_table::Documents;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ShareLinks::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ShareLinks::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(ShareLinks::DocumentId).uuid().not_null())
                    .col(ColumnDef::new(ShareLinks::CreatorId).uuid().not_null())
                    .col(
                        ColumnDef::new(ShareLinks::AccessToken)
                            .string_len(64)
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(ShareLinks::EncryptedKey).text().not_null())
                    .col(
                        ColumnDef::new(ShareLinks::PasswordHash)
                            .string_len(255)
                            .null(),
                    )
                    .col(
                        ColumnDef::new(ShareLinks::ExpiresAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(ColumnDef::new(ShareLinks::MaxAccessCount).integer().null())
                    .col(
                        ColumnDef::new(ShareLinks::AccessCount)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(ShareLinks::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_share_links_document")
                            .from(ShareLinks::Table, ShareLinks::DocumentId)
                            .to(Documents::Table, Documents::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_share_links_creator")
                            .from(ShareLinks::Table, ShareLinks::CreatorId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Create index on access_token for token lookup
        manager
            .create_index(
                Index::create()
                    .name("idx_share_links_access_token")
                    .table(ShareLinks::Table)
                    .col(ShareLinks::AccessToken)
                    .to_owned(),
            )
            .await?;

        // Create index on document_id for document's share links
        manager
            .create_index(
                Index::create()
                    .name("idx_share_links_document_id")
                    .table(ShareLinks::Table)
                    .col(ShareLinks::DocumentId)
                    .to_owned(),
            )
            .await?;

        // Create index on expires_at for cleanup of expired links
        manager
            .create_index(
                Index::create()
                    .name("idx_share_links_expires_at")
                    .table(ShareLinks::Table)
                    .col(ShareLinks::ExpiresAt)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ShareLinks::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum ShareLinks {
    Table,
    Id,
    DocumentId,
    CreatorId,
    AccessToken,
    EncryptedKey,
    PasswordHash,
    ExpiresAt,
    MaxAccessCount,
    AccessCount,
    CreatedAt,
}
