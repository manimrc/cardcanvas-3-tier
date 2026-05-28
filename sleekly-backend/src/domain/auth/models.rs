use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use validator::Validate;

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

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(length(min = 3, max = 50))]
    pub username: String,
    #[validate(length(min = 4))]
    pub password: String,
    #[validate(length(max = 100))]
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(length(min = 1))]
    pub username: String,
    #[validate(length(min = 1))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ResetPasswordRequest {
    #[validate(length(min = 1))]
    pub username: String,
    pub recovery_code: String,
    #[validate(length(min = 4))]
    pub new_password: String,
}
