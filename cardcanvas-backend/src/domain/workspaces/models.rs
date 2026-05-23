use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use validator::Validate;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: Uuid,
    pub user_id: Uuid,
    pub folder_id: Option<Uuid>,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateFolderRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct RenameFolderRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateBoardRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
    pub folder_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct RenameBoardRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
    pub folder_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceTree {
    pub folders: Vec<Folder>,
    pub boards: Vec<Board>,
}
