use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use axum::http::{header, HeaderValue};
use axum::response::IntoResponse;
use rand::Rng;

use crate::{
    auth::{create_token, AuthUser},
    errors::{AppError, Result},
    models::*,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/me", get(me))
        .route("/reset", post(reset_password))
}

async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<impl IntoResponse> {
    if req.username.len() < 3 {
        return Err(AppError::BadRequest("Username must be at least 3 characters".into()));
    }
    if req.password.len() < 4 {
        return Err(AppError::BadRequest("Password must be at least 4 characters".into()));
    }

    // Check if username is taken
    let existing: Option<User> = sqlx::query_as("SELECT * FROM users WHERE username = $1")
        .bind(&req.username)
        .fetch_optional(&state.db)
        .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Username already taken".into()));
    }

    let display_name = req.display_name.unwrap_or_else(|| req.username.clone());
    let password_hash = bcrypt::hash(&req.password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    // Generate recovery code
    let recovery_code: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(12)
        .map(char::from)
        .collect::<String>()
        .to_uppercase();
    let recovery_hash = bcrypt::hash(&recovery_code, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    let user: User = sqlx::query_as(
        r#"INSERT INTO users (username, display_name, password_hash, recovery_hash)
           VALUES ($1, $2, $3, $4)
           RETURNING *"#
    )
    .bind(&req.username)
    .bind(&display_name)
    .bind(&password_hash)
    .bind(&recovery_hash)
    .fetch_one(&state.db)
    .await?;

    let token = create_token(user.id, &user.username, &state.jwt_secret)
        .map_err(|e| AppError::Internal(e))?;

    let cookie = format!(
        "cc_token={}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax",
        token
    );

    let body = serde_json::json!({
        "user": {
            "id": user.id,
            "username": user.username,
            "displayName": user.display_name,
        },
        "recoveryCode": recovery_code
    });

    Ok((
        axum::http::StatusCode::CREATED,
        [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())],
        Json(body),
    ))
}

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse> {
    let user: User = sqlx::query_as("SELECT * FROM users WHERE username = $1")
        .bind(&req.username)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)?;

    let valid = bcrypt::verify(&req.password, &user.password_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    if !valid {
        return Err(AppError::Unauthorized);
    }

    let token = create_token(user.id, &user.username, &state.jwt_secret)
        .map_err(|e| AppError::Internal(e))?;

    let cookie = format!(
        "cc_token={}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax",
        token
    );

    let body = serde_json::json!({
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name,
    });

    Ok((
        axum::http::StatusCode::OK,
        [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())],
        Json(body),
    ))
}

async fn logout() -> impl IntoResponse {
    let cookie = "cc_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
    (
        [(header::SET_COOKIE, HeaderValue::from_str(cookie).unwrap())],
        Json(serde_json::json!({ "success": true })),
    )
}

async fn me(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let uid: uuid::Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(uid)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)?;

    Ok(Json(serde_json::json!({
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name,
    })))
}

async fn reset_password(
    State(state): State<AppState>,
    Json(req): Json<ResetPasswordRequest>,
) -> Result<Json<serde_json::Value>> {
    let user: User = sqlx::query_as("SELECT * FROM users WHERE username = $1")
        .bind(&req.username)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::BadRequest("User not found".into()))?;

    let recovery_hash = user.recovery_hash
        .ok_or(AppError::BadRequest("No recovery code set".into()))?;

    let valid = bcrypt::verify(&req.recovery_code, &recovery_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    if !valid {
        return Err(AppError::BadRequest("Invalid recovery code".into()));
    }

    let new_hash = bcrypt::hash(&req.new_password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&new_hash)
        .bind(user.id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
