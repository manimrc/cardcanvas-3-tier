use axum::{
    extract::{Multipart, State},
    routing::post,
    Json, Router,
};
use uuid::Uuid;

use crate::{
    infrastructure::auth::AuthUser,
    errors::{AppError, Result},
    state::AppState,
};
use super::models::UploadResponse;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/upload", post(upload_media))
}

async fn upload_media(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    if let Some(field) = multipart.next_field().await
        .map_err(|e| AppError::BadRequest(e.to_string()))? {

        let filename = field.file_name()
            .unwrap_or("upload")
            .to_string();
        let mime_type = field.content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let data = field.bytes().await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        let response = state.media_service.save_file(uid, filename, mime_type, data.to_vec()).await?;
        
        return Ok(Json(response));
    }

    Err(AppError::BadRequest("No file in request".into()))
}
