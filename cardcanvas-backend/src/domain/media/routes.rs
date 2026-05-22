use axum::{
    extract::{Multipart, State, Path},
    routing::{post, get},
    response::IntoResponse,
    http::header,
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
        .route("/files/:user_id/:filename", get(serve_media))
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

async fn serve_media(
    State(state): State<AppState>,
    Path((user_id_str, filename)): Path<(String, String)>,
) -> Result<impl IntoResponse> {
    let user_id = Uuid::parse_str(&user_id_str)
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;

    let (data, mime_type) = state.media_service.read_file(user_id, &filename).await?;

    Ok((
        [
            (header::CONTENT_TYPE, mime_type),
            (header::CACHE_CONTROL, "public, max-age=31536000".to_string()),
        ],
        data,
    ))
}

