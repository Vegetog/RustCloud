//! 分享链接实体定义

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "share_links")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    pub document_id: Uuid,
    pub creator_id: Uuid,

    /// 唯一访问令牌（URL 安全随机字符串）
    #[sea_orm(unique)]
    pub access_token: String,

    /// Base64 编码的加密文档密钥（用于匿名访问）
    pub encrypted_key: String,

    /// 可选密码哈希（Argon2）
    pub password_hash: Option<String>,

    /// 可选过期时间戳
    pub expires_at: Option<DateTimeUtc>,

    /// 最大访问次数（None 表示不限制）
    pub max_access_count: Option<i32>,

    /// 当前访问次数
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
