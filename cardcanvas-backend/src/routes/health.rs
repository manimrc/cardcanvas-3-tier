use axum::{routing::get, Json, Router};

pub fn router() -> Router<crate::state::AppState> {
    Router::new()
        .route("/", get(health_check))
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "cardcanvas-backend",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
