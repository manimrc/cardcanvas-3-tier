use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    RequestPartsExt,
};
use axum_extra::TypedHeader;
use axum_extra::headers::{Authorization, authorization::Bearer};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String, // user id (UUID as string)
    pub username: String,
    pub exp: usize,
}

pub fn create_token(user_id: Uuid, username: &str, secret: &str) -> anyhow::Result<String> {
    let expiry = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(7))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user_id.to_string(),
        username: username.to_owned(),
        exp: expiry,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;

    Ok(token)
}

pub fn verify_token(token: &str, secret: &str) -> Option<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .ok()
    .map(|data| data.claims)
}

/// Extractor: pulls JWT from cookie OR Authorization Bearer header
pub struct AuthUser(pub Claims);

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = (StatusCode, axum::Json<serde_json::Value>);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> std::result::Result<Self, Self::Rejection> {
        // Try cookie first
        let cookie_token = parts
            .headers
            .get("cookie")
            .and_then(|v| v.to_str().ok())
            .and_then(|cookies| {
                cookies.split(';').find_map(|c| {
                    let c = c.trim();
                    if c.starts_with("cc_token=") {
                        Some(c["cc_token=".len()..].to_string())
                    } else {
                        None
                    }
                })
            });

        // Try Authorization Bearer header as fallback
        let bearer_token = parts
            .extract::<TypedHeader<Authorization<Bearer>>>()
            .await
            .ok()
            .map(|TypedHeader(Authorization(bearer))| bearer.token().to_owned());

        let token = cookie_token.or(bearer_token).ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({ "error": "Unauthorized" })),
            )
        })?;

        let claims = verify_token(&token, &state.jwt_secret).ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({ "error": "Invalid or expired token" })),
            )
        })?;

        Ok(AuthUser(claims))
    }
}
