//! Document entity definition

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "documents")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    pub owner_id: Uuid,

    /// Base64-encoded encrypted file name
    pub encrypted_name: String,

    /// Base64-encoded nonce for name encryption
    pub name_nonce: String,

    /// SHA-256 hash of encrypted content (hex)
    pub content_hash: String,

    /// Storage path in object storage
    pub storage_path: String,

    /// File size in bytes
    pub size: i64,

    /// MIME type
    pub mime_type: String,

    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::OwnerId",
        to = "super::user::Column::Id",
        on_delete = "Cascade"
    )]
    Owner,

    #[sea_orm(has_many = "super::document_key::Entity")]
    DocumentKeys,

    #[sea_orm(has_many = "super::share_link::Entity")]
    ShareLinks,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Owner.def()
    }
}

impl Related<super::document_key::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::DocumentKeys.def()
    }
}

impl Related<super::share_link::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ShareLinks.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
