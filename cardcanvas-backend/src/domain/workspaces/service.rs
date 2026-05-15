use uuid::Uuid;
use super::{models::*, repository::WorkspaceRepository};
use crate::errors::Result;

pub struct WorkspaceService {
    repo: WorkspaceRepository,
}

impl WorkspaceService {
    pub fn new(repo: WorkspaceRepository) -> Self {
        Self { repo }
    }

    pub async fn get_tree(&self, user_id: Uuid) -> Result<WorkspaceTree> {
        let folders = self.repo.get_folders(user_id).await?;
        let boards = self.repo.get_boards(user_id).await?;

        Ok(WorkspaceTree { folders, boards })
    }

    pub async fn create_folder(&self, user_id: Uuid, req: CreateFolderRequest) -> Result<Folder> {
        self.repo.create_folder(user_id, &req.name).await
    }

    pub async fn rename_folder(&self, user_id: Uuid, id: Uuid, req: RenameFolderRequest) -> Result<()> {
        self.repo.rename_folder(user_id, id, &req.name).await
    }

    pub async fn delete_folder(&self, user_id: Uuid, id: Uuid) -> Result<()> {
        self.repo.delete_folder(user_id, id).await
    }

    pub async fn create_board(&self, user_id: Uuid, req: CreateBoardRequest) -> Result<Board> {
        self.repo.create_board(user_id, &req.name, req.folder_id).await
    }

    pub async fn rename_board(&self, user_id: Uuid, id: Uuid, req: RenameBoardRequest) -> Result<()> {
        self.repo.rename_board(user_id, id, &req.name, req.folder_id).await
    }

    pub async fn delete_board(&self, user_id: Uuid, id: Uuid) -> Result<()> {
        self.repo.delete_board(user_id, id).await
    }
}
