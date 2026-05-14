use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub jwt_secret: String,
    pub media_dir: String,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "dev-secret-please-change-in-production".to_string()),
            media_dir: std::env::var("MEDIA_DIR")
                .unwrap_or_else(|_| "./uploads".to_string()),
        }
    }
}
