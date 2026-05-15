use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Media {
    pub id: i64,
    pub user_id: Uuid,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub storage_path: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub url: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}
