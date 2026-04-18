use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ===== 请求 =====

#[derive(Debug, Deserialize, Validate)]
pub struct CreateFolderRequest {
    pub parent_id: Option<Uuid>,

    #[validate(length(min = 1, message = "Encrypted name is required"))]
    pub encrypted_name: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct RenameFolderRequest {
    /// 重命名时需为所有 folder_keys 成员重新加密名字
    #[validate(length(min = 1))]
    pub encrypted_names: Vec<FolderKeyEntry>,
}

#[derive(Debug, Deserialize, Serialize, Validate)]
pub struct FolderKeyEntry {
    pub user_id: Uuid,
    #[validate(length(min = 1))]
    pub encrypted_name: String,
}

#[derive(Debug, Deserialize)]
pub struct MoveFolderRequest {
    pub new_parent_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, Default)]
pub struct FolderChildrenQuery {
    /// "root" 表示顶层，UUID 字符串表示指定文件夹，省略表示不过滤
    pub parent_id: Option<String>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

// ===== 响应 =====

#[derive(Debug, Serialize)]
pub struct FolderResponse {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub encrypted_name: String,
    pub permission_level: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct FolderChildrenResponse {
    pub folders: Vec<FolderResponse>,
    /// 文件列表由前端调用 /documents?folder_id= 获取
    pub total_folders: u64,
}
