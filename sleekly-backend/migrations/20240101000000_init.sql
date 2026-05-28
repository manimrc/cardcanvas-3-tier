-- Sleekly PostgreSQL Schema
-- Run via: sqlx migrate run

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      TEXT UNIQUE NOT NULL,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    recovery_hash TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS folders (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boards (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id  UUID REFERENCES folders(id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    title      TEXT,
    url        TEXT,
    content    TEXT,
    x          DOUBLE PRECISION NOT NULL DEFAULT 0,
    y          DOUBLE PRECISION NOT NULL DEFAULT 0,
    width      DOUBLE PRECISION,
    height     DOUBLE PRECISION,
    color      TEXT,
    tags       JSONB NOT NULL DEFAULT '[]',
    is_locked  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whiteboard (
    board_id   UUID PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    elements   JSONB NOT NULL DEFAULT '[]',
    app_state  JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    mime_type  TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    -- For Phase 1: store path; Phase 3: store Azure Blob name
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cards_user_id  ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_board_id ON cards(board_id);
CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
