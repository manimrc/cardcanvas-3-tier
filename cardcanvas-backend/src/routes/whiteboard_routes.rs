use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    errors::{AppError, Result},
    models::*,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/:board_id", get(get_whiteboard).put(update_whiteboard))
}

async fn get_whiteboard(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(board_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let row: Option<Whiteboard> = sqlx::query_as(
        "SELECT board_id, user_id, elements, app_state, updated_at FROM whiteboard WHERE board_id = $1 AND user_id = $2"
    )
    .bind(board_id)
    .bind(uid)
    .fetch_optional(&state.db)
    .await?;

    match row {
        Some(r) => Ok(Json(serde_json::json!({
            "elements": r.elements,
            "appState": r.app_state,
        }))),
        None => Ok(Json(serde_json::json!({
            "elements": [],
            "appState": {},
        }))),
    }
}

async fn update_whiteboard(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(board_id): Path<Uuid>,
    Json(req): Json<UpdateWhiteboardRequest>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    sqlx::query(
        r#"INSERT INTO whiteboard (board_id, user_id, elements, app_state, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (board_id) DO UPDATE
           SET elements = EXCLUDED.elements, app_state = EXCLUDED.app_state, updated_at = NOW()"#
    )
    .bind(board_id)
    .bind(uid)
    .bind(&req.elements)
    .bind(&req.app_state)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
