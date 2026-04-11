//! 文档密钥实体定义

use sea_orm::entity::prelude::*;
use std::fmt;

/// Permission level for document access
#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "i16", db_type = "SmallInteger")]
pub enum PermissionLevel {
    #[sea_orm(num_value = 0)]
    Read,
    #[sea_orm(num_value = 1)]
    Write,
    #[sea_orm(num_value = 2)]
    Owner,
}

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "document_keys")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    pub document_id: Uuid,
    pub user_id: Uuid,

    /// Base64-encoded RSA-encrypted document key
    pub encrypted_key: String,

    pub permission_level: PermissionLevel,

    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::document::Entity",
        from = "Column::DocumentId",
        to = "super::document::Column::Id",
        on_delete = "Cascade"
    )]
    Document,

    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id",
        on_delete = "Cascade"
    )]
    User,
}

impl Related<super::document::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Document.def()
    }
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

impl fmt::Display for PermissionLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            PermissionLevel::Read => "read",
            PermissionLevel::Write => "write",
            PermissionLevel::Owner => "owner",
        };
        write!(f, "{}", s)
    }
}
