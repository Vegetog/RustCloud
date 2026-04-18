//! 文档实体定义

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "documents")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    pub owner_id: Uuid,

    /// Base64 编码的加密文件名
    pub encrypted_name: String,

    /// 用于文件名加密的 Base64 编码 nonce
    pub name_nonce: String,

    /// 用于内容加密的 Base64 编码 nonce
    pub content_nonce: String,

    /// 对象存储中的存储路径
    pub storage_path: String,

    /// 文件大小（字节）
    pub size: i64,

    /// MIME 类型
    pub mime_type: String,

    /// 文档版本号（每次更新递增）
    pub version: i64,

    pub folder_id: Option<Uuid>,

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

    #[sea_orm(
        belongs_to = "super::folder::Entity",
        from = "Column::FolderId",
        to = "super::folder::Column::Id",
        on_delete = "SetNull"
    )]
    Folder,

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

impl Related<super::folder::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Folder.def()
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
