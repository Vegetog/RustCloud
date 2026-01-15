//! User entity definition

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    #[sea_orm(unique)]
    pub email: String,

    pub password_hash: String,

    /// Base64-encoded salt for key derivation
    pub salt: String,

    /// Base64-encoded RSA public key (DER format)
    pub public_key: String,

    /// Base64-encoded encrypted private key
    pub encrypted_private_key: String,

    /// Base64-encoded nonce for private key encryption
    pub private_key_nonce: String,

    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::document::Entity")]
    Documents,

    #[sea_orm(has_many = "super::document_key::Entity")]
    DocumentKeys,

    #[sea_orm(has_many = "super::share_link::Entity")]
    ShareLinks,
}

impl Related<super::document::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Documents.def()
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
