"""Background queue for asynchronous memory extraction jobs."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from projects.dilly.api.memory_extraction import run_extraction

_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="memory-extract")


def enqueue_memory_extraction(uid: str, conv_id: str, messages: list[dict[str, Any]]) -> None:
    if not uid or not conv_id or not isinstance(messages, list) or not messages:
        return
    _EXECUTOR.submit(run_extraction, uid, conv_id, messages)

