use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    #[serde(skip_serializing)]
    pub recovery_hash: Option<String>,
    pub created_at: DateTime<Utc>,
}

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

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Card {
    pub id: Uuid,
    pub user_id: Uuid,
    pub board_id: Uuid,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub card_type: String,
    pub title: Option<String>,
    pub url: Option<String>,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub color: Option<String>,
    pub tags: serde_json::Value,
    pub is_locked: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Whiteboard {
    pub board_id: Uuid,
    pub user_id: Uuid,
    pub elements: serde_json::Value,
    pub app_state: serde_json::Value,
    pub updated_at: DateTime<Utc>,
}

// ---- Request/Response DTOs ----

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub username: String,
    pub recovery_code: String,
    pub new_password: String,
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

#[derive(Debug, Deserialize)]
pub struct CreateCardRequest {
    pub id: Option<Uuid>,
    pub board_id: Uuid,
    #[serde(rename = "type")]
    pub card_type: String,
    pub title: Option<String>,
    pub url: Option<String>,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub color: Option<String>,
    pub tags: Option<serde_json::Value>,
    pub is_locked: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCardRequest {
    pub title: Option<String>,
    pub url: Option<String>,
    pub content: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub color: Option<String>,
    pub tags: Option<serde_json::Value>,
    pub is_locked: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWhiteboardRequest {
    pub elements: serde_json::Value,
    pub app_state: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceTree {
    pub folders: Vec<Folder>,
    pub boards: Vec<Board>,
}
