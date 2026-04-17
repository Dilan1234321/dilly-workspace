-- Structured job attribute columns on internships.
--
-- These replace fragile keyword heuristics in the /v2/internships/feed
-- filter path with pre-classified values, so filters like "no degree
-- required" (and future H-1B sponsorship, fair-chance, etc.) become
-- fast, accurate, and indexable.
--
-- Values for text classification columns:
--   'required'     — the description clearly requires this
--   'not_required' — the description clearly does not require this
--   'unclear'      — Haiku couldn't decide (or description too vague)
--   NULL           — not yet classified
--
-- Filters should include 'not_required' and (usually) 'unclear' so we
-- don't hide borderline jobs from users who opt into the filter.

ALTER TABLE internships
    ADD COLUMN IF NOT EXISTS degree_required TEXT,
    ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- Partial index so the classifier batch job can find un-classified
-- active jobs quickly, without bloating the index with every active row.
CREATE INDEX IF NOT EXISTS idx_internships_unclassified_degree
    ON internships (created_at DESC)
    WHERE degree_required IS NULL AND status = 'active';

-- Partial index for the filter path (only the jobs users actually want
-- when the no-degree pill is on).
CREATE INDEX IF NOT EXISTS idx_internships_no_degree
    ON internships (created_at DESC)
    WHERE degree_required IN ('not_required', 'unclear') AND status = 'active';
