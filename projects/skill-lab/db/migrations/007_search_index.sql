-- Full-text search index for the "type your situation" feature. Zero-LLM:
-- Postgres tsvector matches natural-language queries against video title +
-- description + channel + cohort, ranked by ts_rank_cd blended with
-- quality_score. Also used by the command palette for video-level hits.

BEGIN;

-- Generated column stays in sync automatically; no trigger needed
ALTER TABLE skill_lab_videos
  ADD COLUMN IF NOT EXISTS search_doc tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(channel_title, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(cohort, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_skill_lab_videos_search_doc
  ON skill_lab_videos USING GIN (search_doc);

COMMIT;
