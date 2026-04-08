-- ═══════════════════════════════════════════════════════════════════════
-- Tier 2 Rubric Scoring Cutover — 2026-04-08
-- ═══════════════════════════════════════════════════════════════════════
--
-- This migration is OPTIONAL. The rubric cutover works without running
-- any SQL — the main migration is the code deploy itself (rubric scorer
-- integrated into /audit/v2 and /resume/audit endpoints) plus the mobile
-- ScoringMigrationModal that prompts existing users to re-audit.
--
-- Running this SQL gives you:
--   1. A `scoring_version` column on audit_results for forensics
--   2. A backfill of existing rows as 'legacy_v1' so you can filter
--      historical audits from new rubric-scored audits in SQL
--   3. An optional unique constraint / index on latest-per-user lookups
--
-- ⚠️  BEFORE RUNNING
--   - Take a RDS snapshot first. `aws rds create-db-snapshot` or via
--     the Railway dashboard if you have one-click snapshot
--   - Run against a staging copy first if you have one
--   - All changes are idempotent (safe to re-run)
--
-- ⚠️  WHAT THIS DOES NOT DO
--   - Does NOT drop any data
--   - Does NOT rename the audit_results table
--   - Does NOT modify existing rows other than backfilling the new column
--   - Does NOT affect any other table
--
-- Run it as a superuser or the same role your app uses:
--     psql "$DATABASE_URL" -f migrations/20260408_rubric_cutover.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Add scoring_version column to audit_results
--    Tracks which scoring engine produced each audit:
--      'legacy_v1'  — old dilly_core.auditor.run_audit (pre 2026-04-08)
--      'rubric_v2'  — new dilly_core.rubric_scorer (Tier 2 cutover)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE audit_results
    ADD COLUMN IF NOT EXISTS scoring_version TEXT DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Backfill existing rows as 'legacy_v1'
--    All rows present at the time of this migration were produced by
--    the legacy auditor. Any row inserted AFTER this migration by the
--    new code should explicitly set scoring_version='rubric_v2'.
-- ─────────────────────────────────────────────────────────────────────

UPDATE audit_results
   SET scoring_version = 'legacy_v1'
 WHERE scoring_version IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Index for fast filtering by scoring version
--    Useful for analytics queries like "average composite by version"
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_results_scoring_version
    ON audit_results (scoring_version);

-- ─────────────────────────────────────────────────────────────────────
-- 4. (Optional) index to speed up "latest audit per user" lookups
--    If you already have this, the IF NOT EXISTS is a no-op.
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_results_user_created
    ON audit_results (user_id, created_at DESC);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- Post-migration verification queries
-- ═══════════════════════════════════════════════════════════════════════
--
-- Run these after the migration to verify:
--
--   SELECT scoring_version, COUNT(*) FROM audit_results GROUP BY scoring_version;
--     → Should show 'legacy_v1' with the total row count
--
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name='audit_results' AND column_name='scoring_version';
--     → Should return one row with type 'text'
--
--   SELECT indexname FROM pg_indexes WHERE tablename='audit_results';
--     → Should include idx_audit_results_scoring_version
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- Rollback (if needed)
-- ═══════════════════════════════════════════════════════════════════════
--
-- This migration is non-destructive — rollback is not technically needed
-- (the old code paths still work and ignore the new column). But if you
-- want to remove the added column:
--
--   BEGIN;
--   DROP INDEX IF EXISTS idx_audit_results_scoring_version;
--   ALTER TABLE audit_results DROP COLUMN IF EXISTS scoring_version;
--   COMMIT;
-- ═══════════════════════════════════════════════════════════════════════
