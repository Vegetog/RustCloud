//! 用户实体定义

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    #[sea_orm(unique)]
    pub email: String,

    pub password_hash: String,

    /// 用于密钥派生的 Base64 编码盐值
    pub salt: String,

    /// Base64 编码的 RSA 公钥（DER 格式）
    pub public_key: String,

    /// Base64 编码的加密私钥
    pub encrypted_private_key: String,

    /// 用于私钥加密的 Base64 编码 nonce
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

    #[sea_orm(has_many = "super::identity::Entity")]
    Identities,

    #[sea_orm(has_many = "super::identity_user::Entity")]
    IdentityUsers,
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

impl Related<super::identity::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Identities.def()
    }
}

impl Related<super::identity_user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::IdentityUsers.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
