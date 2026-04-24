-- Persist which Getting Started steps a user has permanently completed.
-- Once a step ID lands in this array it is never shown again, even if
-- the underlying predicate flips back (e.g. user deletes their only win).
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS getting_started_dismissed TEXT[] DEFAULT '{}';
