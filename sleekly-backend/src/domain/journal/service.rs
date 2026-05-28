use chrono::NaiveDate;
use uuid::Uuid;

use super::models::*;
use super::repository::JournalRepository;
use crate::errors::Result;

pub struct JournalService {
    repo: JournalRepository,
}

impl JournalService {
    pub fn new(repo: JournalRepository) -> Self {
        Self { repo }
    }

    /// Compute the emotional mood score from mood + reflection answers.
    ///
    /// `mood_score = base_mood_points + (yes_count / 6) * 3`
    /// clamped to [1.0, 10.0].
    fn compute_mood_score(mood: Option<&str>, reflections: &serde_json::Value) -> f64 {
        let base = mood
            .and_then(Mood::from_str_opt)
            .map(|m| m.base_score())
            .unwrap_or(5.0);

        let yes_count = reflections
            .as_array()
            .map(|arr| arr.iter().filter(|v| v.as_bool() == Some(true)).count())
            .unwrap_or(0);

        let bonus = (yes_count as f64 / 6.0) * 3.0;
        (base + bonus).clamp(1.0, 10.0)
    }

    /// Save (create or update) a journal entry for a given date.
    pub async fn save_entry(
        &self,
        user_id: Uuid,
        date: NaiveDate,
        req: SaveJournalEntryRequest,
    ) -> Result<JournalEntry> {
        let reflections = req
            .reflection_answers
            .as_ref()
            .cloned()
            .unwrap_or(serde_json::json!([]));

        let mood_score =
            Self::compute_mood_score(req.mood.as_deref(), &reflections);

        self.repo.upsert_entry(user_id, date, mood_score, &req).await
    }

    /// Get the entry for a specific date (populates latest vision and returns mock if empty).
    pub async fn get_entry(
        &self,
        user_id: Uuid,
        date: NaiveDate,
    ) -> Result<Option<JournalEntry>> {
        let entry = self.repo.get_entry_by_date(user_id, date).await?;
        let latest_vision = self.repo.get_latest_vision(user_id).await?;

        match entry {
            Some(mut e) => {
                e.long_term_vision = latest_vision;
                Ok(Some(e))
            }
            None => {
                if let Some(vision) = latest_vision {
                    Ok(Some(JournalEntry {
                        id: Uuid::nil(),
                        user_id,
                        entry_date: date,
                        mood: None,
                        mood_score: 5.0,
                        grateful_text: None,
                        content: None,
                        long_term_vision: Some(vision),
                        tiny_win: None,
                        reflection_answers: serde_json::json!([false, false, false, false, false, false]),
                        tags: serde_json::json!([]),
                        photo_urls: serde_json::json!([]),
                        created_at: chrono::Utc::now(),
                        updated_at: chrono::Utc::now(),
                    }))
                } else {
                    Ok(None)
                }
            }
        }
    }

    /// Get entries in a date range.
    pub async fn get_entries_range(
        &self,
        user_id: Uuid,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<JournalEntry>> {
        self.repo.get_entries_range(user_id, start, end).await
    }

    /// Get lightweight heatmap data for a given year.
    pub async fn get_heatmap(
        &self,
        user_id: Uuid,
        year: i32,
    ) -> Result<Vec<EmotionalHeatmapEntry>> {
        self.repo.get_heatmap_data(user_id, year).await
    }

    /// Delete an entry.
    pub async fn delete_entry(
        &self,
        user_id: Uuid,
        date: NaiveDate,
    ) -> Result<()> {
        self.repo.delete_entry(user_id, date).await
    }
}
