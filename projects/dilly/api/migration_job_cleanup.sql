-- Migration: job_cleanup_support
-- Run once against your dilly.db
-- Adds infrastructure for the background listing cleanup job

-- 1. Ensure listings table has an `active` flag
--    (If your listings table already has this column, this will be a no-op error — safe to ignore)
ALTER TABLE listings ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

-- 2. Audit log for removed listings
--    So you can always see what was removed and why
CREATE TABLE IF NOT EXISTS listing_removal_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id      TEXT NOT NULL,
    company         TEXT NOT NULL,
    title           TEXT NOT NULL,
    reason          TEXT NOT NULL,
    removed_at      TEXT NOT NULL
);

-- 3. Ensure user_applications stores a snapshot of the job info
--    This way, if a listing is deleted, the user's tracker still shows
--    the company name, title, and URL they applied to.
--    (If these columns already exist, these will be no-op errors — safe to ignore)
ALTER TABLE user_applications ADD COLUMN company_snapshot TEXT;
ALTER TABLE user_applications ADD COLUMN title_snapshot TEXT;
ALTER TABLE user_applications ADD COLUMN url_snapshot TEXT;

-- 4. Backfill snapshots from current listings data
--    Run this ONCE before enabling the cron job
UPDATE user_applications
SET
    company_snapshot = (SELECT company FROM listings WHERE listings.id = user_applications.listing_id),
    title_snapshot   = (SELECT title   FROM listings WHERE listings.id = user_applications.listing_id),
    url_snapshot     = (SELECT url     FROM listings WHERE listings.id = user_applications.listing_id)
WHERE company_snapshot IS NULL;