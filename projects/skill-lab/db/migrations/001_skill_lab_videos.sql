-- Skill Lab schema (Postgres). Lives in the same database as Dilly core.
-- Apply with: psql "$DATABASE_URL" -f projects/skill-lab/db/migrations/001_skill_lab_videos.sql

BEGIN;

CREATE TABLE IF NOT EXISTS skill_lab_videos (
    id              TEXT PRIMARY KEY,             -- YouTube video id
    title           TEXT NOT NULL,
    description     TEXT,
    channel_id      TEXT NOT NULL,
    channel_title   TEXT NOT NULL,
    cohort          TEXT NOT NULL,                -- matches COHORTS[].name (display name)
    duration_sec    INTEGER NOT NULL DEFAULT 0,
    view_count      BIGINT NOT NULL DEFAULT 0,
    like_count      BIGINT NOT NULL DEFAULT 0,
    comment_count   BIGINT NOT NULL DEFAULT 0,
    subscriber_count BIGINT NOT NULL DEFAULT 0,   -- channel subs at time of fetch
    published_at    TIMESTAMPTZ NOT NULL,
    thumbnail_url   TEXT NOT NULL DEFAULT '',
    quality_score   NUMERIC(5,2) NOT NULL DEFAULT 0,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_lab_videos_cohort_score
    ON skill_lab_videos (cohort, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_skill_lab_videos_published
    ON skill_lab_videos (cohort, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_lab_videos_duration
    ON skill_lab_videos (cohort, duration_sec);


CREATE TABLE IF NOT EXISTS skill_lab_saved_videos (
    user_id       TEXT NOT NULL,
    video_id      TEXT NOT NULL REFERENCES skill_lab_videos(id) ON DELETE CASCADE,
    saved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    progress_sec  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_lab_saved_user_recent
    ON skill_lab_saved_videos (user_id, saved_at DESC);


-- Per-cohort search queries used by the nightly ingest script. Keeping these
-- in the DB means we can tune them without shipping a new deploy.
CREATE TABLE IF NOT EXISTS skill_lab_cohort_queries (
    cohort     TEXT NOT NULL,
    query      TEXT NOT NULL,
    weight     NUMERIC(4,2) NOT NULL DEFAULT 1.0,  -- multiplier on quality_score for this query
    PRIMARY KEY (cohort, query)
);

COMMIT;
