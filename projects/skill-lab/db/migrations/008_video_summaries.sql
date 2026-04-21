-- Per-video bulleted summary. Written at ingest time (or backfill), served
-- directly on the video page. Two sources:
--   'chapters' — parsed from the creator's own timestamped chapter markers
--                in the video description. Free, already-structured.
--   'ai'       — Haiku pass over the transcript when no chapters exist.
--                Cached forever, so it's effectively free at request time.
--
-- Apply:
--   psql "$DATABASE_URL" -f db/migrations/008_video_summaries.sql

BEGIN;

ALTER TABLE skill_lab_videos
    ADD COLUMN IF NOT EXISTS summary TEXT,
    ADD COLUMN IF NOT EXISTS summary_source TEXT, -- 'chapters' | 'ai' | null
    ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_skill_lab_videos_has_summary
    ON skill_lab_videos ((summary IS NOT NULL));

COMMIT;
