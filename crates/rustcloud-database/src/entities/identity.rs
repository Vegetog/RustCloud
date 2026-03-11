//! 身份实体定义

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "identities")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    /// 身份名称
    pub name: String,

    /// 身份描述
    #[sea_orm(nullable)]
    pub description: Option<String>,

    /// 创建者 ID
    pub creator_id: Uuid,

    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::CreatorId",
        to = "super::user::Column::Id",
        on_delete = "Cascade"
    )]
    Creator,

    #[sea_orm(has_many = "super::identity_user::Entity")]
    IdentityUsers,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Creator.def()
    }
}

impl Related<super::identity_user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::IdentityUsers.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
