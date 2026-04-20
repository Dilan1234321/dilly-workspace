-- Add language filtering and cohort-fit keyword matching.

BEGIN;

-- Language of the video (ISO 639-1, e.g. 'en', 'es', 'pt', 'hi', 'fr', 'zh').
-- NULL means YouTube didn't report one. Default to 'en' for existing rows since
-- the first ingest pass only searched relevanceLanguage=en.
ALTER TABLE skill_lab_videos
    ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

CREATE INDEX IF NOT EXISTS idx_skill_lab_videos_cohort_lang_score
    ON skill_lab_videos (cohort, language, quality_score DESC);


-- Per-cohort keyword allowlist: video's title + description must contain at
-- least one of these phrases (case-insensitive) to be considered on-topic.
CREATE TABLE IF NOT EXISTS skill_lab_cohort_keywords (
    cohort   TEXT NOT NULL,
    keyword  TEXT NOT NULL,
    weight   NUMERIC(4,2) NOT NULL DEFAULT 1.0,
    PRIMARY KEY (cohort, keyword)
);


-- Per-cohort denylist: if title + description contains any of these, drop the
-- video regardless of other signals. Catches spam, vlogs, reviews, drama.
CREATE TABLE IF NOT EXISTS skill_lab_cohort_denylist (
    cohort   TEXT NOT NULL,
    phrase   TEXT NOT NULL,
    PRIMARY KEY (cohort, phrase)
);

-- Global denylist applies to all cohorts (spam patterns we never want).
CREATE TABLE IF NOT EXISTS skill_lab_global_denylist (
    phrase  TEXT PRIMARY KEY
);

INSERT INTO skill_lab_global_denylist (phrase) VALUES
    ('reaction video'),
    ('vlog'),
    ('unboxing'),
    ('top 10 celebrities'),
    ('celebrity gossip'),
    ('prank'),
    ('try not to laugh'),
    ('asmr'),
    ('mukbang')
ON CONFLICT DO NOTHING;

COMMIT;
