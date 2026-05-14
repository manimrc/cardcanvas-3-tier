use axum::{
    extract::{Multipart, State},
    routing::post,
    Json, Router,
};
use std::path::PathBuf;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    errors::{AppError, Result},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/upload", post(upload_media))
}

async fn upload_media(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    // Ensure uploads dir exists
    let upload_base = PathBuf::from(&state.media_dir);
    let user_dir = upload_base.join(uid.to_string());
    tokio::fs::create_dir_all(&user_dir)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    while let Some(field) = multipart.next_field().await
        .map_err(|e| AppError::BadRequest(e.to_string()))? {

        let filename = field.file_name()
            .unwrap_or("upload")
            .to_string();
        let mime_type = field.content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let data = field.bytes().await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        let file_id = Uuid::new_v4().to_string();
        let ext = std::path::Path::new(&filename)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e))
            .unwrap_or_default();
        let storage_filename = format!("{}{}", file_id, ext);
        let file_path = user_dir.join(&storage_filename);
        let size_bytes = data.len() as i64;

        tokio::fs::write(&file_path, &data)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

        let storage_path = format!("{}/{}", uid, storage_filename);

        // Record in DB
        sqlx::query(
            "INSERT INTO media (user_id, filename, mime_type, size_bytes, storage_path) VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(uid)
        .bind(&filename)
        .bind(&mime_type)
        .bind(size_bytes)
        .bind(&storage_path)
        .execute(&state.db)
        .await?;

        // Return URL for the frontend to use
        let url = format!("/api/media/files/{}/{}", uid, storage_filename);

        return Ok(Json(serde_json::json!({
            "url": url,
            "mimeType": mime_type,
        })));
    }

    Err(AppError::BadRequest("No file in request".into()))
}
