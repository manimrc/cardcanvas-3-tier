use chrono::NaiveDate;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

/// Supported mood values for a journal entry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Mood {
    Joyful,
    Peaceful,
    Grateful,
    Content,
    Neutral,
    Tired,
    Anxious,
    Sad,
    Frustrated,
}

impl Mood {
    /// Base emotional score for this mood (1–10 scale).
    pub fn base_score(&self) -> f64 {
        match self {
            Mood::Joyful     => 10.0,
            Mood::Peaceful   => 9.0,
            Mood::Grateful   => 8.0,
            Mood::Content    => 7.0,
            Mood::Neutral    => 5.0,
            Mood::Tired      => 4.0,
            Mood::Anxious    => 3.0,
            Mood::Sad        => 2.0,
            Mood::Frustrated => 1.0,
        }
    }

    /// Convert from a DB string.
    pub fn from_str_opt(s: &str) -> Option<Self> {
        match s {
            "joyful"     => Some(Mood::Joyful),
            "peaceful"   => Some(Mood::Peaceful),
            "grateful"   => Some(Mood::Grateful),
            "content"    => Some(Mood::Content),
            "neutral"    => Some(Mood::Neutral),
            "tired"      => Some(Mood::Tired),
            "anxious"    => Some(Mood::Anxious),
            "sad"        => Some(Mood::Sad),
            "frustrated" => Some(Mood::Frustrated),
            _            => None,
        }
    }

    /// Serialize to DB string.
    pub fn as_str(&self) -> &'static str {
        match self {
            Mood::Joyful     => "joyful",
            Mood::Peaceful   => "peaceful",
            Mood::Grateful   => "grateful",
            Mood::Content    => "content",
            Mood::Neutral    => "neutral",
            Mood::Tired      => "tired",
            Mood::Anxious    => "anxious",
            Mood::Sad        => "sad",
            Mood::Frustrated => "frustrated",
        }
    }
}

/// A single daily journal entry as stored in the database.
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct JournalEntry {
    pub id: Uuid,
    pub user_id: Uuid,
    pub entry_date: NaiveDate,
    pub mood: Option<String>,
    pub mood_score: f64,
    pub grateful_text: Option<String>,
    pub content: Option<String>,
    pub long_term_vision: Option<String>,
    pub tiny_win: Option<String>,
    pub reflection_answers: serde_json::Value,
    pub tags: serde_json::Value,
    pub photo_urls: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Request body for creating / updating a journal entry (PUT /journal/:date).
#[derive(Debug, Deserialize, Validate)]
pub struct SaveJournalEntryRequest {
    pub mood: Option<String>,
    pub grateful_text: Option<String>,
    pub content: Option<String>,
    pub long_term_vision: Option<String>,
    pub tiny_win: Option<String>,
    pub reflection_answers: Option<serde_json::Value>,
    pub tags: Option<serde_json::Value>,
    pub photo_urls: Option<serde_json::Value>,
}

/// Query params for fetching entries in a date range.
#[derive(Debug, Deserialize)]
pub struct JournalRangeQuery {
    pub start: NaiveDate,
    pub end: NaiveDate,
}

/// Lightweight heatmap data point.
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct EmotionalHeatmapEntry {
    pub entry_date: NaiveDate,
    pub mood_score: f64,
}
