use std::path::PathBuf;
use uuid::Uuid;
use crate::errors::{AppError, Result};
use super::repository::MediaRepository;
use super::models::UploadResponse;

pub struct MediaService {
    repo: MediaRepository,
    media_dir: String,
}

impl MediaService {
    pub fn new(repo: MediaRepository, media_dir: String) -> Self {
        Self { repo, media_dir }
    }

    pub async fn save_file(
        &self,
        user_id: Uuid,
        filename: String,
        mime_type: String,
        data: Vec<u8>,
    ) -> Result<UploadResponse> {
        let upload_base = PathBuf::from(&self.media_dir);
        let user_dir = upload_base.join(user_id.to_string());
        
        tokio::fs::create_dir_all(&user_dir)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

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

        let storage_path = format!("{}/{}", user_id, storage_filename);

        self.repo.create_media(user_id, &filename, &mime_type, size_bytes, &storage_path).await?;

        let url = format!("/api/media/files/{}", storage_path);

        Ok(UploadResponse {
            url,
            mime_type,
        })
    }
}
