-- ═══════════════════════════════════════════════════════════════════════
-- Backfill user_type on Dilly profiles - 2026-04-21
-- ═══════════════════════════════════════════════════════════════════════
--
-- WHY
--   Before the Skill Lab sign-up fix that PATCHes user_type at verify-code
--   time (deployed 2026-04-21), profiles created via Skill Lab had their
--   user_type field left unset. Dilly's canonical URL rule at
--   api/routers/profile.py:1599 defaults unset -> "student" -> /s/{slug},
--   which is wrong for people who picked "Anyone else" at sign-up.
--
--   This migration writes user_type explicitly on every row where it's
--   currently NULL or empty, using the email domain as the heuristic:
--     - email ends in ".edu" -> "student"
--     - everything else      -> "general"
--
--   .edu is the most reliable signal because Dilly's sign-up flow for
--   students enforces a .edu address at the backend validation step
--   (api/routers/auth.py:74-77). If a row has a .edu email it came
--   through the student path; anything else came through the general
--   path.
--
-- ⚠️  BEFORE RUNNING
--   - Take an RDS snapshot first
--   - Run against staging if you have one
--   - All changes are idempotent (safe to re-run)
--
-- ⚠️  WHAT THIS DOES NOT DO
--   - Does NOT overwrite any existing user_type value, even if it looks
--     wrong. The code path for new signups is already fixed; stale bad
--     values in prod should be hand-corrected, not mass-overwritten.
--   - Does NOT touch users created via the mobile app - those always
--     had user_type set during onboarding.
--   - Does NOT drop, rename, or delete any data.
--
--     psql "$DATABASE_URL" -f migrations/20260421_backfill_user_type.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Dry-run: count how many rows each arm will touch
--    Uncomment (or run outside the transaction) if you want to preview
--    before applying. The UPDATE statements below are idempotent so you
--    can also just run them and check row counts from psql output.
-- ─────────────────────────────────────────────────────────────────────

-- SELECT
--   COUNT(*) FILTER (WHERE email ILIKE '%.edu')     AS will_set_student,
--   COUNT(*) FILTER (WHERE email NOT ILIKE '%.edu') AS will_set_general,
--   COUNT(*)                                        AS total_unset
-- FROM users
-- WHERE COALESCE(NULLIF(profile_json->>'user_type', ''), NULL) IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Backfill .edu accounts as "student"
--    jsonb `||` operator merges the new key into the existing blob and
--    overwrites nothing else. We also guard on "is currently unset" so
--    rerunning the migration is a no-op.
-- ─────────────────────────────────────────────────────────────────────

UPDATE users
   SET profile_json = profile_json || jsonb_build_object('user_type', 'student')
 WHERE email ILIKE '%.edu'
   AND COALESCE(NULLIF(profile_json->>'user_type', ''), NULL) IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Backfill non-.edu accounts as "general"
-- ─────────────────────────────────────────────────────────────────────

UPDATE users
   SET profile_json = profile_json || jsonb_build_object('user_type', 'general')
 WHERE email NOT ILIKE '%.edu'
   AND COALESCE(NULLIF(profile_json->>'user_type', ''), NULL) IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Verification: confirm zero rows remain unset
--    If this SELECT returns 0 rows the backfill is complete. If it
--    returns anything, investigate before COMMIT.
-- ─────────────────────────────────────────────────────────────────────

SELECT email,
       profile_json->>'user_type' AS user_type
  FROM users
 WHERE COALESCE(NULLIF(profile_json->>'user_type', ''), NULL) IS NULL
 LIMIT 20;

COMMIT;
