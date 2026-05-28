use sqlx::PgPool;
use uuid::Uuid;
use super::models::*;
use crate::errors::Result;

pub struct WorkspaceRepository {
    pool: PgPool,
}

impl WorkspaceRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_folders(&self, user_id: Uuid) -> Result<Vec<Folder>> {
        let folders = sqlx::query_as(
            "SELECT id, user_id, name, created_at FROM folders WHERE user_id = $1 ORDER BY name"
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(folders)
    }

    pub async fn get_boards(&self, user_id: Uuid) -> Result<Vec<Board>> {
        let boards = sqlx::query_as(
            "SELECT id, user_id, folder_id, name, created_at FROM boards WHERE user_id = $1 ORDER BY name"
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(boards)
    }

    pub async fn create_folder(&self, user_id: Uuid, name: &str) -> Result<Folder> {
        let folder = sqlx::query_as(
            "INSERT INTO folders (user_id, name) VALUES ($1, $2) RETURNING id, user_id, name, created_at"
        )
        .bind(user_id)
        .bind(name)
        .fetch_one(&self.pool)
        .await?;
        Ok(folder)
    }

    pub async fn rename_folder(&self, user_id: Uuid, id: Uuid, name: &str) -> Result<()> {
        sqlx::query("UPDATE folders SET name = $1 WHERE id = $2 AND user_id = $3")
            .bind(name)
            .bind(id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_folder(&self, user_id: Uuid, id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM folders WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn create_board(&self, user_id: Uuid, name: &str, folder_id: Option<Uuid>) -> Result<Board> {
        let board = sqlx::query_as(
            "INSERT INTO boards (user_id, folder_id, name) VALUES ($1, $2, $3)
             RETURNING id, user_id, folder_id, name, created_at"
        )
        .bind(user_id)
        .bind(folder_id)
        .bind(name)
        .fetch_one(&self.pool)
        .await?;
        Ok(board)
    }

    pub async fn rename_board(&self, user_id: Uuid, id: Uuid, name: &str, folder_id: Option<Uuid>) -> Result<()> {
        sqlx::query("UPDATE boards SET name = $1, folder_id = $2 WHERE id = $3 AND user_id = $4")
            .bind(name)
            .bind(folder_id)
            .bind(id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_board(&self, user_id: Uuid, id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM boards WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
