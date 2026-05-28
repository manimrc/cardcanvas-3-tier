use sqlx::PgPool;
use uuid::Uuid;
use crate::errors::Result;

pub struct MediaRepository {
    pool: PgPool,
}

impl MediaRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_media(
        &self,
        user_id: Uuid,
        filename: &str,
        mime_type: &str,
        size_bytes: i64,
        storage_path: &str,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO media (user_id, filename, mime_type, size_bytes, storage_path) VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(user_id)
        .bind(filename)
        .bind(mime_type)
        .bind(size_bytes)
        .bind(storage_path)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
