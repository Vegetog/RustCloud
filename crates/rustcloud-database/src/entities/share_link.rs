//! Share link entity definition

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "share_links")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    pub document_id: Uuid,
    pub creator_id: Uuid,

    /// Unique access token (URL-safe random string)
    #[sea_orm(unique)]
    pub access_token: String,

    /// Base64-encoded encrypted document key (for anonymous access)
    pub encrypted_key: String,

    /// Optional password hash (Argon2)
    pub password_hash: Option<String>,

    /// Optional expiration timestamp
    pub expires_at: Option<DateTimeUtc>,

    /// Maximum access count (None = unlimited)
    pub max_access_count: Option<i32>,

    /// Current access count
    pub access_count: i32,

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
        from = "Column::CreatorId",
        to = "super::user::Column::Id",
        on_delete = "Cascade"
    )]
    Creator,
}

impl Related<super::document::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Document.def()
    }
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Creator.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
