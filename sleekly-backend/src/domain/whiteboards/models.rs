use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Whiteboard {
    pub board_id: Uuid,
    pub user_id: Uuid,
    pub elements: serde_json::Value,
    pub app_state: serde_json::Value,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWhiteboardRequest {
    pub elements: serde_json::Value,
    pub app_state: serde_json::Value,
}
