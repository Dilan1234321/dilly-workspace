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


def _load(email: str) -> list[dict[str, Any]]:
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


def _save(email: str, threads: list[dict[str, Any]]) -> None:
    path = _path(email)
    if not path:
        return
    # Cap + sort by last_turn_at desc so we keep the most recent.
    try:
        threads.sort(key=lambda r: r.get("last_turn_at", ""), reverse=True)
    except Exception:
        pass
    if len(threads) > _MAX_THREADS:
        threads = threads[:_MAX_THREADS]
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


def list_threads(email: str, limit: int = 30) -> list[dict[str, Any]]:
    """Most recent chat threads, newest first."""
    if not email:
        return []
    threads = _load(email)
    threads.sort(key=lambda r: r.get("last_turn_at", ""), reverse=True)
    return threads[: max(1, min(200, int(limit)))]


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
