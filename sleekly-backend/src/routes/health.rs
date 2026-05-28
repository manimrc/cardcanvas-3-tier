use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use crate::state::AppState;
use serde_json::json;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(health_check))
}

async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    match sqlx::query("SELECT count(*) FROM cards").fetch_one(&state.db).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "service": "sleekly-backend",
                "version": env!("CARGO_PKG_VERSION"),
                "database": "connected"
            })),
        ),
        Err(err) => {
            tracing::error!(message = "Database health check failed", error = ?err);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "status": "error",
                    "service": "sleekly-backend",
                    "version": env!("CARGO_PKG_VERSION"),
                    "database": "disconnected"
                })),
            )
        }
    }
}
