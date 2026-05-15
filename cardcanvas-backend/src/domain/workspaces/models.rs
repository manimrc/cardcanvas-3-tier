use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Folder {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Board {
    pub id: Uuid,
    pub user_id: Uuid,
    pub folder_id: Option<Uuid>,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateFolderRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct RenameFolderRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBoardRequest {
    pub name: String,
    pub folder_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct RenameBoardRequest {
    pub name: String,
    pub folder_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceTree {
    pub folders: Vec<Folder>,
    pub boards: Vec<Board>,
}
