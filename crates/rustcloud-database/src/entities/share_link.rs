//! 分享链接实体定义

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "share_links")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    /// 分享目标类型：0 = 文档，1 = 文件夹
    pub target_type: i16,

    /// 文档 ID（文档分享时不为 None）
    pub document_id: Option<Uuid>,

    /// 文件夹 ID（文件夹分享时不为 None）
    pub folder_id: Option<Uuid>,

    pub creator_id: Uuid,

    /// 唯一访问令牌（URL 安全随机字符串）
    #[sea_orm(unique)]
    pub access_token: String,

    /// Base64 编码的加密文档密钥（文档分享有效；文件夹分享留空字符串）
    pub encrypted_key: String,

    /// 临时 RSA 公钥 Base64（文件夹公开链接分享专用）
    pub ephemeral_pubkey: Option<String>,

    /// 文件夹分享清单 JSON（含子树所有项目的密文元数据）
    pub manifest: Option<String>,

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
        belongs_to = "super::folder::Entity",
        from = "Column::FolderId",
        to = "super::folder::Column::Id",
        on_delete = "Cascade"
    )]
    Folder,

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

impl Related<super::folder::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Folder.def()
    }
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Creator.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
