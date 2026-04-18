use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "folders")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,

    pub owner_id: Uuid,

    pub parent_id: Option<Uuid>,

    /// Base64 编码的 RSA-OAEP 加密文件夹名（用所有者公钥加密）
    pub encrypted_name: String,

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

    #[sea_orm(has_many = "super::folder_key::Entity")]
    FolderKeys,

    #[sea_orm(has_many = "super::document::Entity")]
    Documents,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Owner.def()
    }
}

impl Related<super::folder_key::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::FolderKeys.def()
    }
}

impl Related<super::document::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Documents.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
