use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use super::models::{EmotionalHeatmapEntry, JournalEntry, SaveJournalEntryRequest};
use crate::errors::Result;

pub struct JournalRepository {
    pool: PgPool,
}

impl JournalRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Fetch a single entry for a given user and date.
    pub async fn get_entry_by_date(
        &self,
        user_id: Uuid,
        date: NaiveDate,
    ) -> Result<Option<JournalEntry>> {
        let entry = sqlx::query_as(
            r#"SELECT id, user_id, entry_date, mood, mood_score, grateful_text,
                      content, long_term_vision, tiny_win, reflection_answers,
                      tags, photo_urls, created_at, updated_at
               FROM journal_entries
               WHERE user_id = $1 AND entry_date = $2"#,
        )
        .bind(user_id)
        .bind(date)
        .fetch_optional(&self.pool)
        .await?;
        Ok(entry)
    }

    /// Upsert: insert a new entry or update an existing one for the same (user, date).
    pub async fn upsert_entry(
        &self,
        user_id: Uuid,
        date: NaiveDate,
        mood_score: f64,
        req: &SaveJournalEntryRequest,
    ) -> Result<JournalEntry> {
        let reflection_answers = req
            .reflection_answers
            .clone()
            .unwrap_or(serde_json::json!([]));
        let tags = req.tags.clone().unwrap_or(serde_json::json!([]));
        let photo_urls = req.photo_urls.clone().unwrap_or(serde_json::json!([]));

        let entry = sqlx::query_as(
            r#"INSERT INTO journal_entries
                   (user_id, entry_date, mood, mood_score, grateful_text, content,
                    long_term_vision, tiny_win, reflection_answers, tags, photo_urls)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (user_id, entry_date) DO UPDATE SET
                   mood               = EXCLUDED.mood,
                   mood_score          = EXCLUDED.mood_score,
                   grateful_text       = EXCLUDED.grateful_text,
                   content             = EXCLUDED.content,
                   long_term_vision    = EXCLUDED.long_term_vision,
                   tiny_win            = EXCLUDED.tiny_win,
                   reflection_answers  = EXCLUDED.reflection_answers,
                   tags                = EXCLUDED.tags,
                   photo_urls          = EXCLUDED.photo_urls,
                   updated_at          = NOW()
               RETURNING id, user_id, entry_date, mood, mood_score, grateful_text,
                         content, long_term_vision, tiny_win, reflection_answers,
                         tags, photo_urls, created_at, updated_at"#,
        )
        .bind(user_id)
        .bind(date)
        .bind(&req.mood)
        .bind(mood_score)
        .bind(&req.grateful_text)
        .bind(&req.content)
        .bind(&req.long_term_vision)
        .bind(&req.tiny_win)
        .bind(&reflection_answers)
        .bind(&tags)
        .bind(&photo_urls)
        .fetch_one(&self.pool)
        .await?;

        Ok(entry)
    }

    /// Fetch all entries for a user within a date range (inclusive).
    pub async fn get_entries_range(
        &self,
        user_id: Uuid,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<JournalEntry>> {
        let entries = sqlx::query_as(
            r#"SELECT id, user_id, entry_date, mood, mood_score, grateful_text,
                      content, long_term_vision, tiny_win, reflection_answers,
                      tags, photo_urls, created_at, updated_at
               FROM journal_entries
               WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3
               ORDER BY entry_date ASC"#,
        )
        .bind(user_id)
        .bind(start)
        .bind(end)
        .fetch_all(&self.pool)
        .await?;
        Ok(entries)
    }

    /// Lightweight heatmap data: just date + mood_score for an entire year.
    pub async fn get_heatmap_data(
        &self,
        user_id: Uuid,
        year: i32,
    ) -> Result<Vec<EmotionalHeatmapEntry>> {
        let data = sqlx::query_as(
            r#"SELECT entry_date, mood_score
               FROM journal_entries
               WHERE user_id = $1
                 AND EXTRACT(YEAR FROM entry_date) = $2
               ORDER BY entry_date ASC"#,
        )
        .bind(user_id)
        .bind(year)
        .fetch_all(&self.pool)
        .await?;
        Ok(data)
    }

    /// Delete an entry for a given user and date.
    pub async fn delete_entry(&self, user_id: Uuid, date: NaiveDate) -> Result<()> {
        sqlx::query("DELETE FROM journal_entries WHERE user_id = $1 AND entry_date = $2")
            .bind(user_id)
            .bind(date)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
