pub use sea_orm_migration::prelude::*;

mod m20240101_000001_create_users_table;
mod m20240101_000002_create_documents_table;
mod m20240101_000003_create_document_keys_table;
mod m20240101_000004_create_share_links_table;
mod m20240117_000001_add_content_nonce;
mod m20240204_000001_add_document_version;
mod m20260226_000001_drop_document_content_hash;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20240101_000001_create_users_table::Migration),
            Box::new(m20240101_000002_create_documents_table::Migration),
            Box::new(m20240101_000003_create_document_keys_table::Migration),
            Box::new(m20240101_000004_create_share_links_table::Migration),
            Box::new(m20240117_000001_add_content_nonce::Migration),
            Box::new(m20240204_000001_add_document_version::Migration),
            Box::new(m20260226_000001_drop_document_content_hash::Migration),
        ]
    }
}
