"""
Chat-thread store. a lightweight record of every /ai/chat conversation
so the AI overlay's "past conversations" panel actually has something
to show.

Separate from:
  - conversation_output_store. that's the Voice feature's rich
    per-conversation extraction. Voice-only. Chats went unrecorded
    until this store existed.
  - memory_surface_store. that stores *extracted facts*, not the
    conversation transcript itself.

Zero LLM cost. Each entry is a summary snapshot of the chat session:
  - conv_id: the deterministic hash the chat endpoint already uses
  - first_user_message: the first thing the user said (truncated). This
    becomes the thread title in the UI.
  - last_assistant_message: preview of the most recent reply
  - last_turn_at: updated each turn
  - turn_count: incremented each turn

Storage: per-user JSON file alongside conversation_outputs.json. File-
based to match the existing pattern; caps at _MAX_THREADS (100) and
drops the oldest when full.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from projects.dilly.api.profile_store import get_profile_folder_path

_THREADS_FILENAME = "chat_threads.json"
_MAX_THREADS = 100
_PREVIEW_LEN = 160         # user-message preview length
_ASSISTANT_PREVIEW_LEN = 220
# Full-transcript cap per thread. Keeps file size bounded so the
# overlay's "past conversations → tap to replay" feature doesn't
# balloon a user's profile folder. 40 turns ≈ 80 messages ≈ ~20KB.
_MAX_MESSAGES_PER_THREAD = 80


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _path(email: str) -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        return ""
    return os.path.join(folder, _THREADS_FILENAME)


# ── PostgreSQL backend (durable across Railway deploys) ─────────────
# Was filesystem-only. On Railway the disk wipes on every deploy —
# users would lose chat history after each ship. PG keeps it durable
# across deploys, restarts, sign-out/sign-in, and hard refreshes.
# File path is kept as a one-time migration source on first read +
# as a fallback when PG is unavailable.

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS chat_threads (
  email                  TEXT NOT NULL,
  conv_id                TEXT NOT NULL,
  first_user_message     TEXT,
  last_assistant_message TEXT,
  first_turn_at          TEXT,
  last_turn_at           TEXT,
  turn_count             INT DEFAULT 0,
  mode                   TEXT,
  messages               JSONB DEFAULT '[]'::jsonb,
  kept                   BOOLEAN DEFAULT FALSE,
  name                   TEXT,
  PRIMARY KEY (email, conv_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_threads_email_last
  ON chat_threads (email, last_turn_at DESC);
"""

_schema_ensured = False


def _ensure_schema() -> None:
    global _schema_ensured
    if _schema_ensured:
        return
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(_SCHEMA_SQL)
        _schema_ensured = True
    except Exception:
        # If PG is unavailable on import we fall back to file path.
        pass


def _row_to_dict(row: tuple) -> dict[str, Any]:
    return {
        "email": row[0],
        "conv_id": row[1],
        "first_user_message": row[2],
        "last_assistant_message": row[3],
        "first_turn_at": row[4],
        "last_turn_at": row[5],
        "turn_count": int(row[6] or 0),
        "mode": row[7],
        "messages": row[8] or [],
        "kept": bool(row[9]),
        "name": row[10],
    }


def _pg_load(email: str) -> list[dict[str, Any]] | None:
    _ensure_schema()
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT email, conv_id, first_user_message, last_assistant_message, "
                    "first_turn_at, last_turn_at, turn_count, mode, messages, kept, name "
                    "FROM chat_threads WHERE LOWER(email) = LOWER(%s) "
                    "ORDER BY last_turn_at DESC LIMIT %s",
                    (email, _MAX_THREADS),
                )
                rows = cur.fetchall()
                return [_row_to_dict(r) for r in rows]
    except Exception:
        return None


def _pg_upsert(email: str, threads: list[dict[str, Any]]) -> bool:
    _ensure_schema()
    try:
        from projects.dilly.api.database import get_db
        import psycopg2.extras
        # Build the upsert payload.
        rows = []
        for t in threads:
            rows.append((
                email,
                t.get("conv_id") or "",
                t.get("first_user_message"),
                t.get("last_assistant_message"),
                t.get("first_turn_at"),
                t.get("last_turn_at"),
                int(t.get("turn_count") or 0),
                t.get("mode"),
                json.dumps(t.get("messages") or []),
                bool(t.get("kept", False)),
                t.get("name"),
            ))
        if not rows:
            return True
        with get_db() as conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO chat_threads (
                        email, conv_id, first_user_message, last_assistant_message,
                        first_turn_at, last_turn_at, turn_count, mode, messages, kept, name
                    ) VALUES %s
                    ON CONFLICT (email, conv_id) DO UPDATE SET
                        first_user_message = EXCLUDED.first_user_message,
                        last_assistant_message = EXCLUDED.last_assistant_message,
                        first_turn_at = COALESCE(chat_threads.first_turn_at, EXCLUDED.first_turn_at),
                        last_turn_at = EXCLUDED.last_turn_at,
                        turn_count = EXCLUDED.turn_count,
                        mode = COALESCE(chat_threads.mode, EXCLUDED.mode),
                        messages = EXCLUDED.messages,
                        kept = EXCLUDED.kept,
                        name = COALESCE(EXCLUDED.name, chat_threads.name)
                    """,
                    rows,
                    template="(%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)",
                )
        return True
    except Exception:
        return False


def _pg_delete_overage(email: str) -> None:
    """Trim down to _MAX_THREADS rows, keeping all `kept=True` rows."""
    _ensure_schema()
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM chat_threads WHERE LOWER(email) = LOWER(%s) "
                    "AND kept = FALSE AND conv_id NOT IN ("
                    "  SELECT conv_id FROM chat_threads WHERE LOWER(email) = LOWER(%s) "
                    "  ORDER BY last_turn_at DESC LIMIT %s"
                    ")",
                    (email, email, _MAX_THREADS),
                )
    except Exception:
        pass


def _file_load(email: str) -> list[dict[str, Any]]:
    path = _path(email)
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [r for r in data if isinstance(r, dict) and r.get("conv_id")]


def _load(email: str) -> list[dict[str, Any]]:
    """Read threads from PostgreSQL (durable) with file-fallback for
    legacy data + transient PG outages. On first PG load we also
    migrate any leftover file-disk threads up to PG so historical
    data isn't lost when the user signs in after the deploy."""
    pg = _pg_load(email)
    if pg is not None:
        # If PG returned empty AND there's file data on disk (from
        # before the migration), upsert it and return it. One-time
        # migration per user.
        if not pg:
            file_data = _file_load(email)
            if file_data:
                _pg_upsert(email, file_data)
                return file_data
        return pg
    # PG totally unavailable — fall back to file.
    return _file_load(email)


def _save(email: str, threads: list[dict[str, Any]]) -> None:
    # Sort by last_turn_at desc so the most recent are first.
    try:
        threads.sort(key=lambda r: r.get("last_turn_at", ""), reverse=True)
    except Exception:
        pass
    # Trim to the cap, but NEVER drop threads the user pinned with
    # the Keep button. Product promise: Dilly shows your 5 most
    # recent unless you pin them. We keep the existing _MAX_THREADS
    # (100) as a hard upper bound for safety, but pinned rows are
    # immune to the rolling trim inside that window.
    if len(threads) > _MAX_THREADS:
        kept = [r for r in threads if r.get("kept") is True]
        unkept = [r for r in threads if r.get("kept") is not True]
        budget = max(0, _MAX_THREADS - len(kept))
        threads = kept + unkept[:budget]
        # Re-sort so the output is still time-ordered.
        try:
            threads.sort(key=lambda r: r.get("last_turn_at", ""), reverse=True)
        except Exception:
            pass
    # Try PG first (durable across Railway deploys). File write is the
    # belt-and-suspenders fallback so single-instance dev still works
    # if PG is down.
    pg_ok = _pg_upsert(email, threads)
    if pg_ok:
        _pg_delete_overage(email)
    # Always also write to file as a local backup. Cheap; no harm.
    path = _path(email)
    if not path:
        return
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(threads, f, ensure_ascii=False)
        os.replace(tmp, path)
    except Exception:
        # Storage failures never break the chat response.
        pass


def _truncate(text: str, limit: int) -> str:
    t = (text or "").strip().replace("\n", " ")
    if len(t) <= limit:
        return t
    return t[: limit - 1].rstrip() + "…"


def record_turn(
    email: str,
    conv_id: str,
    user_message: str,
    assistant_message: str,
    mode: str | None = None,
) -> None:
    """
    Upsert the thread for this conv_id. Called from /ai/chat after each
    successful reply. Bumps turn_count, updates last_assistant_message,
    and sets first_user_message on the first turn only.

    Failures are silent. the chat response never waits on this.
    """
    if not email or not conv_id:
        return
    try:
        threads = _load(email)
        now = _now_iso()
        idx = next((i for i, r in enumerate(threads) if r.get("conv_id") == conv_id), -1)
        user_preview = _truncate(user_message, _PREVIEW_LEN)
        asst_preview = _truncate(assistant_message, _ASSISTANT_PREVIEW_LEN)
        if idx >= 0:
            row = threads[idx]
            row["last_turn_at"] = now
            row["last_assistant_message"] = asst_preview
            row["turn_count"] = int(row.get("turn_count") or 0) + 1
            # Only set first_user_message if we missed it initially.
            if not row.get("first_user_message"):
                row["first_user_message"] = user_preview
            if mode and not row.get("mode"):
                row["mode"] = mode
            # Append the full messages to the rolling transcript so
            # "past conversations → tap to replay" can render them.
            msgs = row.get("messages") or []
            if user_message:
                msgs.append({"role": "user",      "content": user_message, "at": now})
            if assistant_message:
                msgs.append({"role": "assistant", "content": assistant_message, "at": now})
            if len(msgs) > _MAX_MESSAGES_PER_THREAD:
                msgs = msgs[-_MAX_MESSAGES_PER_THREAD:]
            row["messages"] = msgs
        else:
            first_msgs: list[dict[str, Any]] = []
            if user_message:
                first_msgs.append({"role": "user",      "content": user_message, "at": now})
            if assistant_message:
                first_msgs.append({"role": "assistant", "content": assistant_message, "at": now})
            threads.append({
                "conv_id":                conv_id,
                "first_user_message":     user_preview,
                "last_assistant_message": asst_preview,
                "first_turn_at":          now,
                "last_turn_at":           now,
                "turn_count":             1,
                "mode":                   mode or "coaching",
                "messages":               first_msgs,
            })
        _save(email, threads)
    except Exception:
        pass


def list_threads(email: str, limit: int = 5) -> list[dict[str, Any]]:
    """Return the user's past chat threads for the history panel.

    Product policy: Dilly shows the 5 most recent UNLESS the user
    tapped the Keep button on a thread. Kept threads always appear
    first, then the most recent unkept threads fill the remainder.
    So if the cap is 5 and the user has 2 kept + 10 unkept, they
    see 2 kept + 3 most-recent-unkept = 5 total.

    `limit` is the total cap. Default is 5 to match the copy shown
    to the user. A larger limit is allowed for admin/debug calls.
    """
    if not email:
        return []
    threads = _load(email)
    threads.sort(key=lambda r: r.get("last_turn_at", ""), reverse=True)
    cap = max(1, min(200, int(limit)))
    kept = [r for r in threads if r.get("kept") is True]
    unkept = [r for r in threads if r.get("kept") is not True]
    # Kept threads always show. Fill remainder from unkept in time
    # order (already sorted). If kept alone exceeds cap, show all
    # kept — we do not hide a pin from the user.
    if len(kept) >= cap:
        return kept
    return kept + unkept[: cap - len(kept)]


def set_kept(email: str, conv_id: str, kept: bool) -> bool:
    """Flip the 'kept' flag on a thread. Kept threads are immune to
    the rolling 5-cap and hard-cap trims. Returns True on success."""
    if not email or not conv_id:
        return False
    try:
        threads = _load(email)
        found = False
        for row in threads:
            if row.get("conv_id") == conv_id:
                row["kept"] = bool(kept)
                found = True
                break
        if not found:
            return False
        _save(email, threads)
        return True
    except Exception:
        return False


def get_thread(email: str, conv_id: str) -> dict[str, Any] | None:
    if not email or not conv_id:
        return None
    for r in _load(email):
        if r.get("conv_id") == conv_id:
            return r
    return None


def get_thread_messages(email: str, conv_id: str) -> list[dict[str, Any]]:
    """Return the full turn-by-turn message list for a conversation,
    in chronological order. Empty list if the thread has no stored
    transcript (older threads recorded before the `messages` field
    was added will return empty)."""
    row = get_thread(email, conv_id)
    if not row:
        return []
    msgs = row.get("messages") or []
    if not isinstance(msgs, list):
        return []
    return [m for m in msgs if isinstance(m, dict) and (m.get("content") or "").strip()]


def delete_thread(email: str, conv_id: str) -> bool:
    if not email or not conv_id:
        return False
    threads = _load(email)
    new = [r for r in threads if r.get("conv_id") != conv_id]
    if len(new) == len(threads):
        return False
    _save(email, new)
    return True
