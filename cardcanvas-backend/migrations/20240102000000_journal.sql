-- Journal feature: daily diary entries with emotional tracking
-- Each user gets at most one entry per calendar day (enforced by UNIQUE constraint).

CREATE TABLE IF NOT EXISTS journal_entries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date          DATE NOT NULL,
    mood                TEXT,                                -- e.g. 'joyful','peaceful','grateful',...
    mood_score          DOUBLE PRECISION NOT NULL DEFAULT 5.0,  -- computed 1–10
    grateful_text       TEXT,                                -- "I'm grateful for…"
    content             TEXT,                                -- TipTap HTML (diary body)
    long_term_vision    TEXT,                                -- "My long-term vision…"
    tiny_win            TEXT,                                -- "My tiny win of the day"
    reflection_answers  JSONB NOT NULL DEFAULT '[]',         -- [true, false, …]
    tags                JSONB NOT NULL DEFAULT '[]',
    photo_urls          JSONB NOT NULL DEFAULT '[]',         -- ["/api/media/files/…", …]
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_journal_user_id    ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_user_date  ON journal_entries(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_mood       ON journal_entries(user_id, mood);
