use axum::{
    extract::{Path, State},
    routing::{delete, get, patch, post},
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
        .route("/tree", get(get_tree))
        .route("/folders", post(create_folder))
        .route("/folders/:id", patch(rename_folder).delete(delete_folder))
        .route("/boards", post(create_board))
        .route("/boards/:id", patch(rename_board).delete(delete_board))
}

async fn get_tree(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
) -> Result<Json<WorkspaceTree>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let folders: Vec<Folder> = sqlx::query_as(
        "SELECT id, user_id, name, created_at FROM folders WHERE user_id = $1 ORDER BY name"
    )
    .bind(uid)
    .fetch_all(&state.db)
    .await?;

    let boards: Vec<Board> = sqlx::query_as(
        "SELECT id, user_id, folder_id, name, created_at FROM boards WHERE user_id = $1 ORDER BY name"
    )
    .bind(uid)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(WorkspaceTree { folders, boards }))
}

async fn create_folder(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Json(req): Json<CreateFolderRequest>,
) -> Result<Json<Folder>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let folder: Folder = sqlx::query_as(
        "INSERT INTO folders (user_id, name) VALUES ($1, $2) RETURNING id, user_id, name, created_at"
    )
    .bind(uid)
    .bind(&req.name)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(folder))
}

async fn rename_folder(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<RenameFolderRequest>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    sqlx::query("UPDATE folders SET name = $1 WHERE id = $2 AND user_id = $3")
        .bind(&req.name)
        .bind(id)
        .bind(uid)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_folder(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    sqlx::query("DELETE FROM folders WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(uid)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn create_board(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Json(req): Json<CreateBoardRequest>,
) -> Result<Json<Board>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let board: Board = sqlx::query_as(
        "INSERT INTO boards (user_id, folder_id, name) VALUES ($1, $2, $3)
         RETURNING id, user_id, folder_id, name, created_at"
    )
    .bind(uid)
    .bind(req.folder_id)
    .bind(&req.name)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(board))
}

async fn rename_board(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<RenameBoardRequest>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    sqlx::query("UPDATE boards SET name = $1, folder_id = $2 WHERE id = $3 AND user_id = $4")
        .bind(&req.name)
        .bind(req.folder_id)
        .bind(id)
        .bind(uid)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_board(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    sqlx::query("DELETE FROM boards WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(uid)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
