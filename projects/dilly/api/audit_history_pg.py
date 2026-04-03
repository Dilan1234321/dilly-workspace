"""
Postgres-backed audit history. Drop-in replacement for audit_history.py.
"""

import json
import time
import uuid

import psycopg2
import psycopg2.extras
from projects.dilly.api.database import get_db
from projects.dilly.api.profile_store_pg import get_profile


# ── 10. save_audit (append_audit) ─────────────────────────────────────────────

def append_audit(email: str, summary: dict) -> None:
    """
    Insert one audit result for this user.
    summary keys match AuditResponseV2: final_score, scores{smart,grit,build},
    detected_track, candidate_name, major, findings, recommendations, evidence,
    peer_percentiles, dilly_take, strongest_signal, skill_tags, + raw full dict.
    """
    email = (email or "").strip().lower()
    if not email:
        return

    user = _get_user_id(email)
    if not user:
        return

    scores = summary.get("scores") or {}
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO audit_results (
                user_id, email, final_score, smart, grit, build,
                track, candidate_name, major,
                findings, recommendations, evidence,
                peer_percentiles, dilly_take,
                strongest_signal, skill_tags, raw_audit
            ) VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s::jsonb, %s::jsonb, %s::jsonb,
                %s::jsonb, %s,
                %s, %s::jsonb, %s::jsonb
            )
            """,
            (
                user["id"],
                email,
                summary.get("final_score"),
                scores.get("smart"),
                scores.get("grit"),
                scores.get("build"),
                summary.get("detected_track") or summary.get("track"),
                summary.get("candidate_name"),
                summary.get("major"),
                json.dumps(summary.get("findings") or []),
                json.dumps(summary.get("recommendations") or []),
                json.dumps(summary.get("evidence") or {}),
                json.dumps(summary.get("peer_percentiles") or {}),
                summary.get("dilly_take"),
                summary.get("strongest_signal"),
                json.dumps(summary.get("skill_tags") or []),
                json.dumps(summary),
            ),
        )

    # Also write latest audit snapshot into profile_json so all screens
    # can read scores/findings/recommendations from /profile directly.
    try:
        from projects.dilly.api.profile_store import save_profile
        save_profile(email, {
            "latest_audit": {
                "id": summary.get("id"),
                "ts": summary.get("ts"),
                "final_score": summary.get("final_score"),
                "scores": scores,
                "detected_track": summary.get("detected_track") or summary.get("track"),
                "candidate_name": summary.get("candidate_name"),
                "major": summary.get("major"),
                "audit_findings": summary.get("audit_findings") or summary.get("findings") or [],
                "recommendations": summary.get("recommendations") or [],
                "evidence": summary.get("evidence") or {},
                "evidence_quotes": summary.get("evidence_quotes") or {},
                "peer_percentiles": summary.get("peer_percentiles") or {},
                "dilly_take": summary.get("dilly_take"),
                "strongest_signal_sentence": summary.get("strongest_signal_sentence") or summary.get("strongest_signal"),
                "skill_tags": summary.get("skill_tags") or [],
                "benchmark_copy": summary.get("benchmark_copy") or {},
            },
            "overall_smart": scores.get("smart"),
            "overall_grit": scores.get("grit"),
            "overall_build": scores.get("build"),
            "overall_dilly_score": summary.get("final_score"),
            "has_run_first_audit": True,
            "onboarding_complete": True,
        })
    except Exception:
        pass


# ── 11. get_latest_audit ──────────────────────────────────────────────────────

def get_latest_audit(email: str) -> dict | None:
    """Return the most recent audit for this user, or None."""
    email = (email or "").strip().lower()
    if not email:
        return None
    user = _get_user_id(email)
    if not user:
        return None
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT * FROM audit_results
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user["id"],),
        )
        row = cur.fetchone()
        return _row_to_audit(dict(row)) if row else None


# ── 12. get_audit_history ─────────────────────────────────────────────────────

def get_audits(email: str) -> list:
    """Return all audits for this user, newest first."""
    email = (email or "").strip().lower()
    if not email:
        return []
    user = _get_user_id(email)
    if not user:
        return []
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT * FROM audit_results
            WHERE user_id = %s
            ORDER BY created_at DESC
            """,
            (user["id"],),
        )
        return [_row_to_audit(dict(r)) for r in cur.fetchall()]


# ── normalize_audit_id_key (kept for compatibility) ───────────────────────────

def normalize_audit_id_key(val: object) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    return s.lower().replace("-", "")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_id(email: str) -> dict | None:
    """Return {id} row from users table for this email."""
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        return dict(row) if row else None


def _row_to_audit(row: dict) -> dict:
    """Convert an audit_results row to the summary dict callers expect."""
    # Start from raw_audit if present (full fidelity)
    raw = row.get("raw_audit")
    if isinstance(raw, dict):
        out = dict(raw)
    elif isinstance(raw, str):
        try:
            out = json.loads(raw)
        except Exception:
            out = {}
    else:
        out = {}

    # Overlay structured columns (authoritative)
    out["id"] = str(row.get("id") or out.get("id") or "")
    out["ts"] = row["created_at"].timestamp() if row.get("created_at") else out.get("ts", time.time())
    raw_fs = row.get("final_score") if row.get("final_score") is not None else out.get("final_score")
    out["final_score"] = float(raw_fs) if raw_fs is not None else None
    out["detected_track"] = row.get("track") or out.get("detected_track")
    out["candidate_name"] = row.get("candidate_name") or out.get("candidate_name")
    out["major"] = row.get("major") or out.get("major")
    out["dilly_take"] = row.get("dilly_take") or out.get("dilly_take")

    smart = row.get("smart")
    grit = row.get("grit")
    build = row.get("build")
    if smart is not None or grit is not None or build is not None:
        out["scores"] = {
            "smart": float(smart) if smart is not None else None,
            "grit": float(grit) if grit is not None else None,
            "build": float(build) if build is not None else None,
        }

    peer = row.get("peer_percentiles")
    if peer:
        out["peer_percentiles"] = dict(peer) if isinstance(peer, dict) else peer

    return out
