"""
LLM usage ledger — per-call cost telemetry.

Purpose: stop flying blind on LLM spend. Every Anthropic call writes one
row with input/output tokens + computed cost so we can answer "which
user, which feature, how much per month" with SQL instead of guesswork.

Used by api.llm_call (the shared wrapper). Every Anthropic call in the
codebase should route through that wrapper — the raw client.messages.
create() call sites are being migrated off one by one.

Retention: 90 days per-row (enforced by purge_old_rows() — schedule via
a daily cron). Longer aggregates can be rolled up into a separate table
later if we need them, but 90 days of per-row data is enough for the
"is this user abusing, did yesterday's cost-cut land" questions.

Schema lives in the same Postgres as everything else (dilly DB).
Failures are fail-open: if the ledger write raises, the LLM call must
still succeed. Bad logging should never break a user's chat reply.
"""

from __future__ import annotations

import os
import time
from typing import Any, Optional

import psycopg2
from psycopg2.extras import RealDictCursor


# ─────────────────────────────────────────────────────────────────────
# Pricing (Haiku 4.5 — current as of 2026-04)
# ─────────────────────────────────────────────────────────────────────
# USD per 1M tokens. If the price changes we update here; historical
# rows already carry their own cost_usd column so they stay correct.
# cache_write is the 25%-over-input premium for writing to the cache.

_PRICES_USD_PER_M = {
    "claude-haiku-4-5-20251001": {
        "input":       0.80,
        "cache_write": 1.00,   # 25% premium over base input
        "cache_read":  0.08,   # 90% discount on cached reads
        "output":      4.00,
    },
    "claude-haiku-4-5": {  # short alias
        "input": 0.80, "cache_write": 1.00, "cache_read": 0.08, "output": 4.00,
    },
    # Legacy Haiku 3.5 — kept so any lingering calls log correctly.
    "claude-3-5-haiku-20241022": {
        "input": 0.80, "cache_write": 1.00, "cache_read": 0.08, "output": 4.00,
    },
    # OpenAI backend models (split-brain: used for extraction, narrative,
    # audit explains, ATS, voice post-processing — everything except the
    # user-facing /ai/chat call, which stays on Haiku).
    # OpenAI auto-caches prefix content and bills cached tokens at ~50%
    # of fresh input. There's no explicit cache_write premium — the first
    # call just pays full rate like normal input.
    "gpt-4o-mini": {
        "input":       0.15,
        "cache_write": 0.15,   # no write premium on OpenAI
        "cache_read":  0.075,  # 50% off input for cached prefix
        "output":      0.60,
    },
    "gpt-4o-mini-2024-07-18": {
        "input": 0.15, "cache_write": 0.15, "cache_read": 0.075, "output": 0.60,
    },
}


def _cost_usd(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> float:
    """Compute cost in USD for one LLM call. Returns 0.0 if the model
    isn't in our price table (don't blow up on new models, just log
    and investigate later)."""
    price = _PRICES_USD_PER_M.get(model) or _PRICES_USD_PER_M["claude-haiku-4-5"]
    # Cached reads are separate from fresh input. If the Anthropic SDK
    # reports both cache_read and input tokens, the input field already
    # excludes the cached portion — no double counting.
    fresh_input = max(0, int(input_tokens) - int(cache_read_tokens))
    c = (
        fresh_input         * price["input"]       / 1_000_000.0
      + int(cache_read_tokens)  * price["cache_read"]  / 1_000_000.0
      + int(cache_write_tokens) * price["cache_write"] / 1_000_000.0
      + int(output_tokens)  * price["output"]      / 1_000_000.0
    )
    return round(c, 8)


# ─────────────────────────────────────────────────────────────────────
# DB connection
# ─────────────────────────────────────────────────────────────────────

def _conn():
    """Short-lived connection. The ledger write is cheap — one INSERT —
    so we don't bother pooling here.

    Three-layer env-var fallback so this works in any hosting setup:
      1. DATABASE_URL (Railway's default, most managed Postgres providers)
      2. PGHOST/PGDATABASE/PGUSER/PGPASSWORD (standard libpq names,
         Railway also sets these for some Postgres add-ons)
      3. DILLY_DB_HOST/NAME/USER/PASSWORD (local-dev convention)

    When none are set, psycopg2 defaults to connecting to a local
    Unix socket that doesn't exist, producing the "connection to
    server on socket /var/run/postgresql/.s.PGSQL.5432" error the
    user saw in Railway logs. This fallback ladder avoids that.
    """
    db_url = (os.environ.get("DATABASE_URL") or "").strip()
    if db_url:
        return psycopg2.connect(db_url, sslmode="require", connect_timeout=3)
    # Railway / libpq-standard names.
    pg_host = (os.environ.get("PGHOST") or "").strip()
    if pg_host:
        return psycopg2.connect(
            host=pg_host,
            database=os.environ.get("PGDATABASE") or "",
            user=os.environ.get("PGUSER") or "",
            password=os.environ.get("PGPASSWORD") or "",
            port=int(os.environ.get("PGPORT") or "5432"),
            sslmode="require",
            connect_timeout=3,
        )
    # Local-dev convention — last resort.
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", ""),
        database=os.environ.get("DILLY_DB_NAME", "dilly"),
        user=os.environ.get("DILLY_DB_USER", "dilly_admin"),
        password=os.environ.get("DILLY_DB_PASSWORD", ""),
        sslmode="require",
        connect_timeout=3,
    )


# ─────────────────────────────────────────────────────────────────────
# Schema — idempotent. Called on module import; if a row already
# exists we do nothing. Safe to call on every cold start.
# ─────────────────────────────────────────────────────────────────────

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS llm_usage_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts               TIMESTAMPTZ NOT NULL DEFAULT now(),
  email            TEXT NOT NULL,
  plan             TEXT,
  feature          TEXT NOT NULL,
  model            TEXT NOT NULL,
  input_tokens     INT NOT NULL DEFAULT 0,
  output_tokens    INT NOT NULL DEFAULT 0,
  cache_read_tokens  INT NOT NULL DEFAULT 0,
  cache_write_tokens INT NOT NULL DEFAULT 0,
  cost_usd         NUMERIC(12, 8) NOT NULL DEFAULT 0,
  latency_ms       INT,
  ok               BOOLEAN NOT NULL DEFAULT TRUE,
  error_code       TEXT,
  request_id       TEXT,
  session_id       TEXT,
  metadata         JSONB
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_email_ts
  ON llm_usage_log (email, ts DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_ts
  ON llm_usage_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_feature_ts
  ON llm_usage_log (feature, ts DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_plan_ts
  ON llm_usage_log (plan, ts DESC) WHERE plan IS NOT NULL;
"""


def ensure_schema() -> None:
    """Run once on startup. Idempotent, cheap."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(_SCHEMA_SQL)
    except Exception as e:
        # Never block startup on this. We'll just miss logging until
        # the DB comes back.
        import sys
        sys.stderr.write(f"[llm_usage_log] schema ensure failed: {e}\n")


# Ensure-schema on import. Safe because CREATE IF NOT EXISTS.
try:
    ensure_schema()
except Exception:
    pass


# ─────────────────────────────────────────────────────────────────────
# Write one row
# ─────────────────────────────────────────────────────────────────────

def log_usage(
    email: str,
    feature: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    *,
    plan: Optional[str] = None,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    latency_ms: Optional[int] = None,
    ok: bool = True,
    error_code: Optional[str] = None,
    request_id: Optional[str] = None,
    session_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Record one LLM call. Fail-open — never raises into the caller.

    Caller passes the feature name (e.g. 'chat', 'resume_generate',
    'fit_narrative'). Use the canonical names so the SQL aggregates
    are clean. See FEATURES below."""
    try:
        cost = _cost_usd(model, input_tokens, output_tokens,
                         cache_read_tokens, cache_write_tokens)
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute("""
                    INSERT INTO llm_usage_log
                        (email, plan, feature, model,
                         input_tokens, output_tokens,
                         cache_read_tokens, cache_write_tokens,
                         cost_usd, latency_ms, ok, error_code,
                         request_id, session_id, metadata)
                    VALUES
                        (%s, %s, %s, %s,
                         %s, %s,
                         %s, %s,
                         %s, %s, %s, %s,
                         %s, %s, %s::jsonb)
                """, (
                    email, plan, feature, model,
                    int(input_tokens), int(output_tokens),
                    int(cache_read_tokens), int(cache_write_tokens),
                    cost, latency_ms, ok, error_code,
                    request_id, session_id,
                    _json_dumps(metadata) if metadata else None,
                ))
    except Exception as e:
        # Don't crash the caller if the log write fails.
        import sys
        sys.stderr.write(f"[llm_usage_log] write failed: {e}\n")


def _json_dumps(d: Any) -> str:
    import json
    try:
        return json.dumps(d, default=str)[:8000]
    except Exception:
        return "{}"


def log_from_anthropic_response(
    email: str,
    feature: str,
    response: Any,
    *,
    plan: Optional[str] = None,
    latency_ms: Optional[int] = None,
    session_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Shortcut: extract token counts from an Anthropic SDK response
    object and log. Handles the usual shape:
        response.usage.input_tokens
        response.usage.output_tokens
        response.usage.cache_read_input_tokens   (may be absent)
        response.usage.cache_creation_input_tokens (may be absent)
    """
    try:
        usage = getattr(response, "usage", None)
        if usage is None:
            return
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
        cache_write = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
        model = getattr(response, "model", "") or "claude-haiku-4-5"
        request_id = getattr(response, "id", None)
        log_usage(
            email, feature, model, input_tokens, output_tokens,
            plan=plan,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            latency_ms=latency_ms,
            request_id=request_id,
            session_id=session_id,
            metadata=metadata,
        )
    except Exception as e:
        import sys
        sys.stderr.write(f"[llm_usage_log] log_from_anthropic_response failed: {e}\n")


# ─────────────────────────────────────────────────────────────────────
# Canonical feature names — keep aggregates clean
# ─────────────────────────────────────────────────────────────────────
# Every call site must pass one of these (or we add new ones here).
# The SQL dashboards key off these exact strings, so consistency
# matters more than cleverness.

class FEATURES:
    CHAT                  = "chat"
    CHAT_FLUSH            = "chat_flush"         # the on-exit extraction
    EXTRACTION            = "extraction"         # mid-turn (safety net)
    NARRATIVE_REGEN       = "narrative_regen"
    FIT_NARRATIVE         = "fit_narrative"
    RESUME_GENERATE       = "resume_generate"
    RESUME_FACT_RANK      = "resume_fact_rank"   # the rank-Haiku pre-pass
    RESUME_KW_CHECK       = "resume_keyword_check"
    INTERVIEW_PREP_DECK   = "interview_prep_deck"
    INTERVIEW_FEEDBACK    = "interview_feedback"
    AI_ARENA              = "ai_arena"
    WEEKLY_BRIEF          = "weekly_brief"
    WWT_LETTER            = "wwt_letter"
    CHAPTER               = "chapter"          # weekly scheduled session
    THREAT_SCAN           = "threat_scan"
    AUDIT                 = "audit"
    JOBS_NARRATIVE        = "jobs_narrative"
    JOB_CLASSIFIER        = "job_classifier"
    COHORT_SCORER         = "cohort_scorer"
    AI_DISRUPTION         = "ai_disruption"
    INSIGHTS              = "insights"
    PROFILE               = "profile_assist"
    OTHER                 = "other"


# ─────────────────────────────────────────────────────────────────────
# Aggregations — consumed by the /admin/cost endpoint
# ─────────────────────────────────────────────────────────────────────

def get_top_line(days: int = 30) -> dict:
    """Top-line dashboard numbers. Safe to call from an admin endpoint.

    Returns:
      {
        total_cost, total_calls, unique_users,
        per_feature: [{feature, cost, calls}],
        per_plan: [{plan, cost, calls, users}],
        top_users: [{email, cost, calls}],
        daily: [{day, cost, calls}]
      }
    """
    out: dict = {
        "total_cost": 0.0, "total_calls": 0, "unique_users": 0,
        "per_feature": [], "per_plan": [], "top_users": [], "daily": [],
    }
    try:
        with _conn() as c:
            with c.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT COALESCE(SUM(cost_usd), 0) AS total_cost,
                           COUNT(*) AS total_calls,
                           COUNT(DISTINCT email) AS unique_users
                    FROM llm_usage_log
                    WHERE ts > now() - (%s || ' days')::interval
                """, (days,))
                row = cur.fetchone() or {}
                out["total_cost"] = float(row.get("total_cost") or 0)
                out["total_calls"] = int(row.get("total_calls") or 0)
                out["unique_users"] = int(row.get("unique_users") or 0)

                cur.execute("""
                    SELECT feature,
                           SUM(cost_usd) AS cost,
                           COUNT(*)     AS calls
                    FROM llm_usage_log
                    WHERE ts > now() - (%s || ' days')::interval
                    GROUP BY feature ORDER BY cost DESC
                """, (days,))
                out["per_feature"] = [
                    {"feature": r["feature"], "cost": float(r["cost"] or 0), "calls": int(r["calls"] or 0)}
                    for r in cur.fetchall()
                ]

                cur.execute("""
                    SELECT COALESCE(plan, 'unknown') AS plan,
                           SUM(cost_usd) AS cost,
                           COUNT(*)     AS calls,
                           COUNT(DISTINCT email) AS users
                    FROM llm_usage_log
                    WHERE ts > now() - (%s || ' days')::interval
                    GROUP BY plan ORDER BY cost DESC
                """, (days,))
                out["per_plan"] = [
                    {"plan": r["plan"], "cost": float(r["cost"] or 0),
                     "calls": int(r["calls"] or 0), "users": int(r["users"] or 0)}
                    for r in cur.fetchall()
                ]

                cur.execute("""
                    SELECT email, SUM(cost_usd) AS cost, COUNT(*) AS calls
                    FROM llm_usage_log
                    WHERE ts > now() - (%s || ' days')::interval
                    GROUP BY email ORDER BY cost DESC LIMIT 20
                """, (days,))
                out["top_users"] = [
                    {"email": r["email"], "cost": float(r["cost"] or 0), "calls": int(r["calls"] or 0)}
                    for r in cur.fetchall()
                ]

                cur.execute("""
                    SELECT DATE(ts) AS day,
                           SUM(cost_usd) AS cost,
                           COUNT(*) AS calls
                    FROM llm_usage_log
                    WHERE ts > now() - (%s || ' days')::interval
                    GROUP BY DATE(ts) ORDER BY day
                """, (days,))
                out["daily"] = [
                    {"day": str(r["day"]), "cost": float(r["cost"] or 0), "calls": int(r["calls"] or 0)}
                    for r in cur.fetchall()
                ]
    except Exception as e:
        import sys
        sys.stderr.write(f"[llm_usage_log] get_top_line failed: {e}\n")
    return out


def get_user_detail(email: str, days: int = 30) -> dict:
    """One-user drilldown — every feature + monthly total."""
    out: dict = {"email": email, "total_cost": 0.0, "per_feature": [], "recent": []}
    try:
        with _conn() as c:
            with c.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT feature, SUM(cost_usd) AS cost, COUNT(*) AS calls,
                           SUM(input_tokens) AS in_toks, SUM(output_tokens) AS out_toks
                    FROM llm_usage_log
                    WHERE email = %s AND ts > now() - (%s || ' days')::interval
                    GROUP BY feature ORDER BY cost DESC
                """, (email, days))
                out["per_feature"] = [
                    {"feature": r["feature"], "cost": float(r["cost"] or 0),
                     "calls": int(r["calls"] or 0),
                     "in_tokens": int(r["in_toks"] or 0), "out_tokens": int(r["out_toks"] or 0)}
                    for r in cur.fetchall()
                ]
                out["total_cost"] = sum(x["cost"] for x in out["per_feature"])

                cur.execute("""
                    SELECT ts, feature, model, input_tokens, output_tokens, cost_usd, ok, error_code
                    FROM llm_usage_log
                    WHERE email = %s AND ts > now() - (%s || ' days')::interval
                    ORDER BY ts DESC LIMIT 100
                """, (email, days))
                out["recent"] = [
                    {"ts": str(r["ts"]), "feature": r["feature"], "model": r["model"],
                     "in_tokens": int(r["input_tokens"] or 0),
                     "out_tokens": int(r["output_tokens"] or 0),
                     "cost": float(r["cost_usd"] or 0),
                     "ok": bool(r["ok"]), "error_code": r["error_code"]}
                    for r in cur.fetchall()
                ]
    except Exception as e:
        import sys
        sys.stderr.write(f"[llm_usage_log] get_user_detail failed: {e}\n")
    return out


def get_session_cost(email: str, session_id: str) -> dict:
    """Sum cost for a given session (e.g. a chat conversation).

    Returns: {total_usd, calls, by_feature: [{feature, calls, usd}],
             debug: {recent_user_rows, recent_session_ids, ...}}
    Lets the chat UI surface the running per-conversation cost so
    cost claims are verifiable by the user instead of estimated.
    The debug block helps diagnose "shows 0¢" — it reports recent
    rows for the user and their session_ids so we can tell whether
    rows are being written but with the wrong session_id, or not
    being written at all.
    """
    out: dict = {"total_usd": 0.0, "calls": 0, "by_feature": [], "debug": {}}
    if not email or not session_id:
        out["debug"]["reason_skipped"] = f"missing email={bool(email)} session_id={bool(session_id)}"
        return out
    try:
        with _conn() as c:
            with c.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT feature,
                           COUNT(*) AS calls,
                           COALESCE(SUM(cost_usd), 0) AS usd
                    FROM llm_usage_log
                    WHERE email = %s AND session_id = %s
                    GROUP BY feature ORDER BY usd DESC
                """, (email, session_id))
                rows = cur.fetchall() or []
                out["by_feature"] = [
                    {"feature": r["feature"], "calls": int(r["calls"] or 0),
                     "usd": float(r["usd"] or 0)}
                    for r in rows
                ]
                out["total_usd"] = sum(x["usd"] for x in out["by_feature"])
                out["calls"] = sum(x["calls"] for x in out["by_feature"])

                # Diagnostic: what's actually in the log for this user
                # in the last 5 minutes? If we have rows but no match,
                # the session_id isn't being written; if zero rows, the
                # write itself is failing.
                cur.execute("""
                    SELECT session_id, feature, model, cost_usd,
                           input_tokens, output_tokens
                    FROM llm_usage_log
                    WHERE email = %s AND ts > now() - interval '5 minutes'
                    ORDER BY ts DESC LIMIT 20
                """, (email,))
                recent = cur.fetchall() or []
                out["debug"]["recent_5min_rows"] = len(recent)
                out["debug"]["recent_session_ids"] = list({
                    str(r["session_id"]) if r["session_id"] else "NULL"
                    for r in recent
                })
                out["debug"]["query_session_id"] = session_id
                out["debug"]["query_email"] = email
                out["debug"]["recent_features"] = list({r["feature"] for r in recent})
                out["debug"]["recent_total_usd"] = round(
                    sum(float(r["cost_usd"] or 0) for r in recent), 6
                )
    except Exception as e:
        import sys
        sys.stderr.write(f"[llm_usage_log] get_session_cost failed: {e}\n")
        out["debug"]["error"] = str(e)[:200]
    return out


# ─────────────────────────────────────────────────────────────────────
# Retention — purge rows older than 90 days
# ─────────────────────────────────────────────────────────────────────

def purge_old_rows(retention_days: int = 90) -> int:
    """Delete rows older than retention_days. Returns the number
    purged. Safe to call from a daily cron."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    "DELETE FROM llm_usage_log WHERE ts < now() - (%s || ' days')::interval",
                    (retention_days,),
                )
                return cur.rowcount or 0
    except Exception as e:
        import sys
        sys.stderr.write(f"[llm_usage_log] purge failed: {e}\n")
        return 0
