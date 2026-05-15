use sqlx::PgPool;
use uuid::Uuid;
use super::models::*;
use crate::errors::Result;

pub struct WhiteboardRepository {
    pool: PgPool,
}

impl WhiteboardRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_whiteboard(&self, user_id: Uuid, board_id: Uuid) -> Result<Option<Whiteboard>> {
        let row = sqlx::query_as(
            "SELECT board_id, user_id, elements, app_state, updated_at FROM whiteboard WHERE board_id = $1 AND user_id = $2"
        )
        .bind(board_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn update_whiteboard(&self, user_id: Uuid, board_id: Uuid, req: UpdateWhiteboardRequest) -> Result<()> {
        sqlx::query(
            r#"INSERT INTO whiteboard (board_id, user_id, elements, app_state, updated_at)
               VALUES ($1, $2, $3, $4, NOW())
               ON CONFLICT (board_id) DO UPDATE
               SET elements = EXCLUDED.elements, app_state = EXCLUDED.app_state, updated_at = NOW()"#
        )
        .bind(board_id)
        .bind(user_id)
        .bind(&req.elements)
        .bind(&req.app_state)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
