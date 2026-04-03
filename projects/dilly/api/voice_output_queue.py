"""Background queue for asynchronous conversation output extraction jobs."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from projects.dilly.api.extract_conversation_outputs import run_extract_outputs

_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="voice-output-extract")


def enqueue_voice_output_extraction(uid: str, conv_id: str, messages: list[dict[str, Any]]) -> None:
    if not uid or not conv_id or not isinstance(messages, list) or not messages:
        return
    _EXECUTOR.submit(run_extract_outputs, uid, conv_id, messages)

