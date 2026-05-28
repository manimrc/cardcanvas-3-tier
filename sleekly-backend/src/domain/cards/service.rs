use uuid::Uuid;
use super::{models::*, repository::CardRepository};
use crate::errors::{AppError, Result};

pub struct CardService {
    repo: CardRepository,
}

impl CardService {
    pub fn new(repo: CardRepository) -> Self {
        Self { repo }
    }

    pub async fn get_cards(&self, user_id: Uuid, board_id: Option<Uuid>) -> Result<Vec<Card>> {
        if let Some(board_id) = board_id {
            self.repo.get_cards_by_board(user_id, board_id).await
        } else {
            self.repo.get_all_cards(user_id).await
        }
    }

    pub async fn get_all_cards(&self, user_id: Uuid) -> Result<Vec<Card>> {
        self.repo.get_all_cards(user_id).await
    }

    pub async fn create_card(&self, user_id: Uuid, req: CreateCardRequest) -> Result<Card> {
        self.repo.create_card(user_id, req).await
    }

    pub async fn update_card(&self, user_id: Uuid, id: Uuid, req: UpdateCardRequest) -> Result<Card> {
        let existing = self.repo.get_card(user_id, id).await?
            .ok_or(AppError::NotFound)?;
        
        self.repo.update_card(user_id, id, req, &existing).await
    }

    pub async fn delete_card(&self, user_id: Uuid, id: Uuid) -> Result<()> {
        self.repo.delete_card(user_id, id).await
    }
}
