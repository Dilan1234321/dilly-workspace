"""
aha_signals_store — lightweight Postgres-backed store for the "aha
moment" signal collector.

Product context (from founder conversation):
  Testers tell us the app is confusing. Founder can't name the single
  moment a user says "oh I GET it." Without real data we'd be
  guessing. This module persists one-line responses from testers to
  the question "What's starting to make sense for you about Dilly?"
  fired once per user ~5 minutes into their first session.

Design intent:
  - ONE row per user ever. If they respond, that's the answer. No
    edit. No re-prompt. The first thing that made sense to them IS
    the signal; later reflection is post-rationalization.
  - Skippable. A skip is also signal — it tells us this user
    bounced before the aha moment landed.
  - Zero LLM cost. Read raw responses in a weekly dashboard and
    spot patterns by hand. At 20 testers that's eyeball-able.
  - No PII beyond email. Free-text responses are saved verbatim.
  - Schema matches llm_usage_log's pattern (idempotent CREATE IF
    NOT EXISTS, same _conn() helper, same DATABASE_URL fallback).

Future:
  - When volume > a few hundred signals, add an LLM clustering pass
    (one-time, weekly) that groups free-text responses. For now,
    manual review is cheaper and more honest.
"""

from __future__ import annotations

import os
from typing import Any, Optional

import psycopg2
from psycopg2.extras import RealDictCursor


# ─────────────────────────────────────────────────────────────────────
# DB connection. Reuses the same env-var pattern as llm_usage_log —
# prefer DATABASE_URL (Railway) and fall back to DILLY_DB_* for
# local dev. Falls back to None on any config error so callers can
# no-op instead of blocking the request.

def _conn():
    """Short-lived connection. Identical three-layer fallback as
    llm_usage_log: DATABASE_URL → PG* → DILLY_DB_*."""
    db_url = (os.environ.get("DATABASE_URL") or "").strip()
    if db_url:
        return psycopg2.connect(db_url, sslmode="require", connect_timeout=3)
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
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", ""),
        database=os.environ.get("DILLY_DB_NAME", "dilly"),
        user=os.environ.get("DILLY_DB_USER", "dilly_admin"),
        password=os.environ.get("DILLY_DB_PASSWORD", ""),
        sslmode="require",
        connect_timeout=3,
    )


_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS aha_signals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  email        TEXT NOT NULL UNIQUE,
  response     TEXT,
  skipped      BOOLEAN NOT NULL DEFAULT FALSE,
  minutes_in_app INT,
  plan         TEXT,
  user_path    TEXT,
  app_mode     TEXT
);

CREATE INDEX IF NOT EXISTS idx_aha_ts ON aha_signals (ts DESC);
CREATE INDEX IF NOT EXISTS idx_aha_path ON aha_signals (user_path) WHERE user_path IS NOT NULL;
"""


def ensure_schema() -> None:
    """Run once on startup. Idempotent, cheap."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(_SCHEMA_SQL)
    except Exception as e:
        import sys
        sys.stderr.write(f"[aha_signals] schema ensure failed: {e}\n")


def record_signal(
    email: str,
    *,
    response: Optional[str],
    skipped: bool,
    minutes_in_app: Optional[int] = None,
    plan: Optional[str] = None,
    user_path: Optional[str] = None,
    app_mode: Optional[str] = None,
) -> bool:
    """Insert (or skip if already exists) a signal for this email.
    ON CONFLICT DO NOTHING — the first response is the answer; we
    don't want to overwrite it with a later "here's what I MEANT"
    reflection.

    Returns True if a new row was inserted, False if this user had
    already responded.
    """
    if not email:
        return False
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO aha_signals
                      (email, response, skipped, minutes_in_app,
                       plan, user_path, app_mode)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO NOTHING
                    RETURNING id
                    """,
                    (
                        email.lower().strip(),
                        (response or "").strip()[:2000] or None,
                        bool(skipped),
                        minutes_in_app,
                        plan,
                        user_path,
                        app_mode,
                    ),
                )
                row = cur.fetchone()
                return row is not None
    except Exception as e:
        import sys
        sys.stderr.write(f"[aha_signals] record_signal failed: {e}\n")
        return False


def has_responded(email: str) -> bool:
    """Cheap check — avoids showing the prompt twice. Returns True
    on any row (response OR skip), False on no row OR DB error.

    On DB error we return False: better to risk showing the prompt
    a second time than to block a user who genuinely hasn't
    answered because their DB call timed out on the first open.
    """
    if not email:
        return False
    try:
        with _conn() as c:
            with c.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT 1 FROM aha_signals WHERE email = %s LIMIT 1",
                    (email.lower().strip(),),
                )
                return cur.fetchone() is not None
    except Exception:
        return False


# Ensure-schema on import. Safe because CREATE IF NOT EXISTS.
# Matches the llm_usage_log pattern so Railway cold-starts get the
# table ready before the first client request.
try:
    ensure_schema()
except Exception:
    pass


def list_recent(limit: int = 50) -> list[dict[str, Any]]:
    """Admin view — pull the most recent N signals for manual review.
    Called by an admin endpoint only."""
    try:
        with _conn() as c:
            with c.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT email, ts, response, skipped, minutes_in_app,
                           plan, user_path, app_mode
                    FROM aha_signals
                    ORDER BY ts DESC
                    LIMIT %s
                    """,
                    (int(max(1, min(500, limit))),),
                )
                return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []
