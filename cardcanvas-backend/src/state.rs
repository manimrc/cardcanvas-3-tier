use sqlx::PgPool;
use std::sync::Arc;
use crate::domain::auth::{repository::AuthRepository, service::AuthService};
use crate::domain::cards::{repository::CardRepository, service::CardService};
use crate::domain::workspaces::{repository::WorkspaceRepository, service::WorkspaceService};
use crate::domain::whiteboards::{repository::WhiteboardRepository, service::WhiteboardService};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool, // Keeping db for other routes that aren't migrated yet
    pub jwt_secret: String,
    pub media_dir: String,
    pub auth_service: Arc<AuthService>,
    pub card_service: Arc<CardService>,
    pub workspace_service: Arc<WorkspaceService>,
    pub whiteboard_service: Arc<WhiteboardService>,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        let jwt_secret = std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "dev-secret-please-change-in-production".to_string());
        let media_dir = std::env::var("MEDIA_DIR")
            .unwrap_or_else(|_| "./uploads".to_string());

        let auth_repo = AuthRepository::new(db.clone());
        let auth_service = Arc::new(AuthService::new(auth_repo, jwt_secret.clone()));

        let card_repo = CardRepository::new(db.clone());
        let card_service = Arc::new(CardService::new(card_repo));

        let workspace_repo = WorkspaceRepository::new(db.clone());
        let workspace_service = Arc::new(WorkspaceService::new(workspace_repo));

        let whiteboard_repo = WhiteboardRepository::new(db.clone());
        let whiteboard_service = Arc::new(WhiteboardService::new(whiteboard_repo));

        Self {
            db,
            jwt_secret,
            media_dir,
            auth_service,
            card_service,
            workspace_service,
            whiteboard_service,
        }
    }
}
