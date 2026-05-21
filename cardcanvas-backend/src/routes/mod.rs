pub mod health;

use axum::Router;
use crate::state::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", crate::domain::auth::routes::router())
        .nest("/workspace", crate::domain::workspaces::routes::router())
        .nest("/cards", crate::domain::cards::routes::router())
        .nest("/whiteboard", crate::domain::whiteboards::routes::router())
        .nest("/media", crate::domain::media::routes::router())
        .nest("/journal", crate::domain::journal::routes::router())
        .nest("/health", health::router())
}
