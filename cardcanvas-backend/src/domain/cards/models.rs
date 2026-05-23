use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use validator::Validate;

fn validate_url_opt(url: &str) -> std::result::Result<(), validator::ValidationError> {
    if url.is_empty() || url.starts_with('/') || url.starts_with("http://") || url.starts_with("https://") {
        return Ok(());
    }
    Err(validator::ValidationError::new("invalid_url"))
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Deserialize)]
pub struct CardQuery {
    #[serde(rename = "boardId")]
    pub board_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateCardRequest {
    pub id: Option<Uuid>,
    pub board_id: Uuid,
    #[serde(rename = "type")]
    #[validate(length(min = 1))]
    pub card_type: String,
    pub title: Option<String>,
    #[validate(custom(function = "validate_url_opt"))]
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

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateCardRequest {
    pub title: Option<String>,
    #[validate(custom(function = "validate_url_opt"))]
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
