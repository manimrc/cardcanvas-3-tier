use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    errors::{AppError, Result},
    infrastructure::auth::AuthUser,
    state::AppState,
};
use super::models::*;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/range", get(get_entries_range))
        .route("/heatmap/:year", get(get_heatmap))
        .route("/:date", get(get_entry).put(save_entry).delete(delete_entry))
}

/// GET /journal/:date
async fn get_entry(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(date_str): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
        .map_err(|_| AppError::BadRequest("Invalid date format, expected YYYY-MM-DD".into()))?;

    match state.journal_service.get_entry(uid, date).await? {
        Some(entry) => Ok(Json(serde_json::to_value(entry).unwrap())),
        None => Ok(Json(serde_json::json!(null))),
    }
}

/// PUT /journal/:date
async fn save_entry(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(date_str): Path<String>,
    Json(req): Json<SaveJournalEntryRequest>,
) -> Result<Json<JournalEntry>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
        .map_err(|_| AppError::BadRequest("Invalid date format, expected YYYY-MM-DD".into()))?;

    let entry = state.journal_service.save_entry(uid, date, req).await?;
    Ok(Json(entry))
}

/// DELETE /journal/:date
async fn delete_entry(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(date_str): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
        .map_err(|_| AppError::BadRequest("Invalid date format, expected YYYY-MM-DD".into()))?;

    state.journal_service.delete_entry(uid, date).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

/// GET /journal/range?start=YYYY-MM-DD&end=YYYY-MM-DD
async fn get_entries_range(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Query(params): Query<JournalRangeQuery>,
) -> Result<Json<Vec<JournalEntry>>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let entries = state
        .journal_service
        .get_entries_range(uid, params.start, params.end)
        .await?;
    Ok(Json(entries))
}

/// GET /journal/heatmap/:year
async fn get_heatmap(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(year): Path<i32>,
) -> Result<Json<Vec<EmotionalHeatmapEntry>>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let data = state.journal_service.get_heatmap(uid, year).await?;
    Ok(Json(data))
}
