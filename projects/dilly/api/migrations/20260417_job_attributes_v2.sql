-- Add h1b_sponsor + fair_chance attribute columns to internships.
-- Same semantics as degree_required in v1:
--   'required'/'not_required'/'unclear'/NULL — don't filter NULL out yet,
--   the classifier catches up nightly.
--
-- These power the international_grad path's sponsor filter and the
-- formerly_incarcerated path's fair-chance filter. Both are strict opt-in
-- filters (only visible to users on those paths), so showing 'unclear'
-- alongside confirmed matches is the right default — we'd rather show a
-- borderline job than hide a potentially-right one.

ALTER TABLE internships
    ADD COLUMN IF NOT EXISTS h1b_sponsor TEXT,
    ADD COLUMN IF NOT EXISTS fair_chance TEXT;

CREATE INDEX IF NOT EXISTS idx_internships_h1b
    ON internships (created_at DESC)
    WHERE h1b_sponsor IN ('sponsors', 'unclear') AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_internships_fair_chance
    ON internships (created_at DESC)
    WHERE fair_chance IN ('fair_chance', 'unclear') AND status = 'active';
