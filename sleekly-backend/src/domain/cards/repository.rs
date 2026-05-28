use sqlx::PgPool;
use uuid::Uuid;
use super::models::{Card, CreateCardRequest, UpdateCardRequest};
use crate::errors::Result;

pub struct CardRepository {
    pool: PgPool,
}

impl CardRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_cards_by_board(&self, user_id: Uuid, board_id: Uuid) -> Result<Vec<Card>> {
        let cards = sqlx::query_as(
            r#"SELECT id, user_id, board_id, type, title, url, content,
                      x, y, width, height, color, tags, is_locked, created_at, updated_at
               FROM cards WHERE board_id = $1 AND user_id = $2 ORDER BY created_at ASC"#
        )
        .bind(board_id)
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(cards)
    }

    pub async fn get_all_cards(&self, user_id: Uuid) -> Result<Vec<Card>> {
        let cards = sqlx::query_as(
            r#"SELECT id, user_id, board_id, type, title, url, content,
                      x, y, width, height, color, tags, is_locked, created_at, updated_at
               FROM cards WHERE user_id = $1 ORDER BY created_at ASC"#
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(cards)
    }

    pub async fn get_card(&self, user_id: Uuid, id: Uuid) -> Result<Option<Card>> {
        let card = sqlx::query_as(
            r#"SELECT id, user_id, board_id, type, title, url, content,
                      x, y, width, height, color, tags, is_locked, created_at, updated_at
               FROM cards WHERE id = $1 AND user_id = $2"#
        )
        .bind(id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(card)
    }

    pub async fn create_card(&self, user_id: Uuid, req: CreateCardRequest) -> Result<Card> {
        let card_id = req.id.unwrap_or_else(Uuid::new_v4);
        let tags = req.tags.unwrap_or(serde_json::json!([]));

        let card = sqlx::query_as(
            r#"INSERT INTO cards (id, user_id, board_id, type, title, url, content, x, y, width, height, color, tags, is_locked)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
               RETURNING id, user_id, board_id, type, title, url, content,
                         x, y, width, height, color, tags, is_locked, created_at, updated_at"#
        )
        .bind(card_id)
        .bind(user_id)
        .bind(req.board_id)
        .bind(&req.card_type)
        .bind(&req.title)
        .bind(&req.url)
        .bind(&req.content)
        .bind(req.x)
        .bind(req.y)
        .bind(req.width)
        .bind(req.height)
        .bind(&req.color)
        .bind(&tags)
        .bind(req.is_locked.unwrap_or(false))
        .fetch_one(&self.pool)
        .await?;

        Ok(card)
    }

    pub async fn update_card(&self, user_id: Uuid, id: Uuid, req: UpdateCardRequest, existing: &Card) -> Result<Card> {
        let updated = sqlx::query_as(
            r#"UPDATE cards SET
                title = $1, url = $2, content = $3,
                x = $4, y = $5, width = $6, height = $7,
                color = $8, tags = $9, is_locked = $10,
                updated_at = NOW()
               WHERE id = $11 AND user_id = $12
               RETURNING id, user_id, board_id, type, title, url, content,
                         x, y, width, height, color, tags, is_locked, created_at, updated_at"#
        )
        .bind(req.title.as_ref().or(existing.title.as_ref()))
        .bind(req.url.as_ref().or(existing.url.as_ref()))
        .bind(req.content.as_ref().or(existing.content.as_ref()))
        .bind(req.x.unwrap_or(existing.x))
        .bind(req.y.unwrap_or(existing.y))
        .bind(req.width.or(existing.width))
        .bind(req.height.or(existing.height))
        .bind(req.color.as_ref().or(existing.color.as_ref()))
        .bind(req.tags.as_ref().unwrap_or(&existing.tags))
        .bind(req.is_locked.unwrap_or(existing.is_locked))
        .bind(id)
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(updated)
    }

    pub async fn delete_card(&self, user_id: Uuid, id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM cards WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
