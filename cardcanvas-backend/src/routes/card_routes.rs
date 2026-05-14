use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    errors::{AppError, Result},
    models::*,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_cards).post(create_card))
        .route("/all", get(get_all_cards))
        .route("/:id", put(update_card).delete(delete_card))
}

#[derive(Deserialize)]
pub struct CardQuery {
    #[serde(rename = "boardId")]
    pub board_id: Option<Uuid>,
}

async fn get_cards(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Query(params): Query<CardQuery>,
) -> Result<Json<Vec<Card>>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let cards: Vec<Card> = if let Some(board_id) = params.board_id {
        sqlx::query_as(
            r#"SELECT id, user_id, board_id, type as card_type, title, url, content,
                      x, y, width, height, color, tags, is_locked, created_at, updated_at
               FROM cards WHERE board_id = $1 AND user_id = $2 ORDER BY created_at ASC"#
        )
        .bind(board_id)
        .bind(uid)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            r#"SELECT id, user_id, board_id, type as card_type, title, url, content,
                      x, y, width, height, color, tags, is_locked, created_at, updated_at
               FROM cards WHERE user_id = $1 ORDER BY created_at ASC"#
        )
        .bind(uid)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(cards))
}

async fn get_all_cards(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<Card>>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let cards: Vec<Card> = sqlx::query_as(
        r#"SELECT id, user_id, board_id, type as card_type, title, url, content,
                  x, y, width, height, color, tags, is_locked, created_at, updated_at
           FROM cards WHERE user_id = $1 ORDER BY created_at ASC"#
    )
    .bind(uid)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(cards))
}

async fn create_card(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Json(req): Json<CreateCardRequest>,
) -> Result<(StatusCode, Json<Card>)> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let card_id = req.id.unwrap_or_else(Uuid::new_v4);
    let tags = req.tags.unwrap_or(serde_json::json!([]));

    let card: Card = sqlx::query_as(
        r#"INSERT INTO cards (id, user_id, board_id, type, title, url, content, x, y, width, height, color, tags, is_locked)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING id, user_id, board_id, type as card_type, title, url, content,
                     x, y, width, height, color, tags, is_locked, created_at, updated_at"#
    )
    .bind(card_id)
    .bind(uid)
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
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(card)))
}

async fn update_card(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateCardRequest>,
) -> Result<Json<Card>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    // Fetch existing card first for partial update merge
    let existing: Card = sqlx::query_as(
        r#"SELECT id, user_id, board_id, type as card_type, title, url, content,
                  x, y, width, height, color, tags, is_locked, created_at, updated_at
           FROM cards WHERE id = $1 AND user_id = $2"#
    )
    .bind(id)
    .bind(uid)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let updated: Card = sqlx::query_as(
        r#"UPDATE cards SET
            title = $1, url = $2, content = $3,
            x = $4, y = $5, width = $6, height = $7,
            color = $8, tags = $9, is_locked = $10,
            updated_at = NOW()
           WHERE id = $11 AND user_id = $12
           RETURNING id, user_id, board_id, type as card_type, title, url, content,
                     x, y, width, height, color, tags, is_locked, created_at, updated_at"#
    )
    .bind(req.title.or(existing.title))
    .bind(req.url.or(existing.url))
    .bind(req.content.or(existing.content))
    .bind(req.x.unwrap_or(existing.x))
    .bind(req.y.unwrap_or(existing.y))
    .bind(req.width.or(existing.width))
    .bind(req.height.or(existing.height))
    .bind(req.color.or(existing.color))
    .bind(req.tags.unwrap_or(existing.tags))
    .bind(req.is_locked.unwrap_or(existing.is_locked))
    .bind(id)
    .bind(uid)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(updated))
}

async fn delete_card(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    sqlx::query("DELETE FROM cards WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(uid)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
