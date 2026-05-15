use uuid::Uuid;
use super::{models::*, repository::WhiteboardRepository};
use crate::errors::Result;

pub struct WhiteboardService {
    repo: WhiteboardRepository,
}

impl WhiteboardService {
    pub fn new(repo: WhiteboardRepository) -> Self {
        Self { repo }
    }

    pub async fn get_whiteboard(&self, user_id: Uuid, board_id: Uuid) -> Result<Option<Whiteboard>> {
        self.repo.get_whiteboard(user_id, board_id).await
    }

    pub async fn update_whiteboard(&self, user_id: Uuid, board_id: Uuid, req: UpdateWhiteboardRequest) -> Result<()> {
        self.repo.update_whiteboard(user_id, board_id, req).await
    }
}
