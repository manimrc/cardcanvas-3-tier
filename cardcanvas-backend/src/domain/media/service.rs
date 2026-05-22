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

    pub async fn read_file(&self, user_id: Uuid, filename: &str) -> Result<(Vec<u8>, String)> {
        // Path traversal protection: filename must not contain directory traversal characters
        if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
            return Err(AppError::BadRequest("Invalid filename".into()));
        }

        let upload_base = PathBuf::from(&self.media_dir);
        let file_path = upload_base.join(user_id.to_string()).join(filename);

        if !file_path.exists() {
            return Err(AppError::NotFound);
        }

        let data = tokio::fs::read(&file_path)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

        // Determine content type from filename extension
        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_lowercase();

        let mime_type = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "pdf" => "application/pdf",
            _ => "application/octet-stream",
        }.to_string();

        Ok((data, mime_type))
    }
}

