-- Dilly Profiles Phase 2: profile_facts table for AI-extracted user knowledge
-- Run against dilly-db RDS instance: psql -h dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com -U dilly_admin -d dilly

CREATE TABLE IF NOT EXISTS profile_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL CHECK (char_length(label) <= 80),
  value TEXT NOT NULL CHECK (char_length(value) <= 500),
  source TEXT NOT NULL DEFAULT 'voice',
  confidence TEXT NOT NULL DEFAULT 'medium',
  action_type TEXT,
  action_payload JSONB,
  shown_to_user BOOLEAN NOT NULL DEFAULT false,
  conv_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary lookup: all facts for a user, newest first
CREATE INDEX IF NOT EXISTS idx_profile_facts_email_updated
  ON profile_facts (email, updated_at DESC);

-- Filter by category (e.g., show all hobbies, all skills)
CREATE INDEX IF NOT EXISTS idx_profile_facts_email_category
  ON profile_facts (email, category);

-- Dedup check: prevent duplicate (email, category, label) pairs
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_facts_dedup
  ON profile_facts (email, category, label);

-- Narrative summary stored on students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS dilly_narrative TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS dilly_narrative_updated_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS voice_session_captures JSONB DEFAULT '[]';
