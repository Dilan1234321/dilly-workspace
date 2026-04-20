-- Learning receipts: the evidence trail behind every skill claim.
-- One row per (user, video). seconds_engaged accumulates across sessions.
-- articulation is the user's one-sentence takeaway (optional).
--
-- Apply with:
--   psql "$DATABASE_URL" -f projects/skill-lab/db/migrations/005_learning_receipts.sql

BEGIN;

CREATE TABLE IF NOT EXISTS skill_lab_learning_receipts (
    user_email          TEXT NOT NULL,
    video_id            TEXT NOT NULL REFERENCES skill_lab_videos(id) ON DELETE CASCADE,
    cohort              TEXT NOT NULL,
    seconds_engaged     INTEGER NOT NULL DEFAULT 0,
    articulation        TEXT,
    articulation_quality NUMERIC(5,2),
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_email, video_id)
);

CREATE INDEX IF NOT EXISTS idx_receipts_user_cohort
    ON skill_lab_learning_receipts (user_email, cohort);
CREATE INDEX IF NOT EXISTS idx_receipts_user_recent
    ON skill_lab_learning_receipts (user_email, last_seen_at DESC);

COMMIT;
