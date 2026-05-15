use sqlx::PgPool;
use uuid::Uuid;
use super::models::User;
use crate::errors::Result;

pub struct AuthRepository {
    pool: PgPool,
}

impl AuthRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_username(&self, username: &str) -> Result<Option<User>> {
        let user = sqlx::query_as("SELECT * FROM users WHERE username = $1")
            .bind(username)
            .fetch_optional(&self.pool)
            .await?;
        Ok(user)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<User>> {
        let user = sqlx::query_as("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(user)
    }

    pub async fn create_user(&self, username: &str, display_name: &str, password_hash: &str, recovery_hash: &str) -> Result<User> {
        let user = sqlx::query_as(
            r#"INSERT INTO users (username, display_name, password_hash, recovery_hash)
               VALUES ($1, $2, $3, $4)
               RETURNING *"#
        )
        .bind(username)
        .bind(display_name)
        .bind(password_hash)
        .bind(recovery_hash)
        .fetch_one(&self.pool)
        .await?;
        Ok(user)
    }

    pub async fn update_password(&self, id: Uuid, password_hash: &str) -> Result<()> {
        sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
            .bind(password_hash)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
