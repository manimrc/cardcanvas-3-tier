use sqlx::{PgPool, postgres::PgPoolOptions};

pub async fn create_pool() -> anyhow::Result<PgPool> {
    let url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&url)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    tracing::info!("Database migrations applied successfully");
    Ok(())
}
