pub mod auth_routes;
pub mod workspace_routes;
pub mod card_routes;
pub mod whiteboard_routes;
pub mod media_routes;
pub mod health;

use axum::Router;
use crate::state::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth_routes::router())
        .nest("/workspace", workspace_routes::router())
        .nest("/cards", card_routes::router())
        .nest("/whiteboard", whiteboard_routes::router())
        .nest("/media", media_routes::router())
        .nest("/health", health::router())
}
