"""
Dilly LLM client - Anthropic Claude. Chat completion for auditor, voice, and tools.
"""

import json
import os
from typing import Any, Optional


def get_chat_completion(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    max_tokens: int = 16000,
    temperature: float = 0.1,
) -> Optional[str]:
    """
    Send system + user to Claude and return the assistant message text.
    Uses ANTHROPIC_API_KEY. Returns None on failure or missing key.

    Cost optimization: for any system prompt >= 1024 tokens (~4000 chars)
    we wrap it in an ephemeral prompt-cache block. Anthropic serves cache
    reads at 10% of the normal input price within a 5-minute window.
    Dozens of Dilly call sites pass the same large system prompt across
    users in quick succession (fit narratives, memory extraction,
    insights letter) — caching slashes their input bill without any
    caller code changes.
    """
    try:
        from anthropic import Anthropic
    except ImportError:
        return None
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None
    model = (model or os.environ.get("DILLY_LLM_MODEL") or os.environ.get("MERIDIAN_LLM_MODEL") or "claude-haiku-4-5-20251001").strip()

    # Wrap the system prompt in a cache block when it's long enough to
    # be worth caching. The 4000-char threshold is ~1k tokens — below
    # that the cache overhead eats the savings.
    if isinstance(system, str) and len(system) >= 4000:
        system_param: Any = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
    else:
        system_param = system

    try:
        client = Anthropic(api_key=api_key, timeout=45.0)
        response = client.messages.create(
            model=model,
            system=system_param,
            messages=[{"role": "user", "content": user}],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        text = response.content[0].text if response.content else None
        return (text or "").strip() or None
    except Exception:
        return None


def stream_chat_completion(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    max_tokens: int = 400,
    temperature: float = 0.4,
):
    """
    Stream tokens from Claude. Yields string chunks as they arrive.
    Yields nothing (empty iterator) on failure or missing key.
    """
    try:
        from anthropic import Anthropic
    except ImportError:
        return
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return
    model = (model or os.environ.get("DILLY_LLM_MODEL_LIGHT") or os.environ.get("MERIDIAN_LLM_MODEL_LIGHT") or "claude-haiku-4-5-20251001").strip()
    try:
        client = Anthropic(api_key=api_key)
        with client.messages.stream(
            model=model,
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=max_tokens,
            temperature=temperature,
        ) as stream:
            for text in stream.text_stream:
                if text:
                    yield text
    except Exception:
        return


def get_light_model() -> str:
    """Return the 'light' model name for cheaper calls (Voice, explain-delta).
    Reads MERIDIAN_LLM_MODEL_LIGHT env var; defaults to claude-haiku-4-5."""
    return (os.environ.get("DILLY_LLM_MODEL_LIGHT") or os.environ.get("MERIDIAN_LLM_MODEL_LIGHT") or "claude-haiku-4-5-20251001").strip()


def get_strong_model() -> str:
    """Return the 'strong' model for complex reasoning (deep-dive Voice questions).
    Reads MERIDIAN_LLM_MODEL env var; defaults to claude-sonnet-4."""
    return (os.environ.get("DILLY_LLM_MODEL") or os.environ.get("MERIDIAN_LLM_MODEL") or "claude-sonnet-4-6").strip()


def get_chat_completion_with_tools(
    system: str,
    user: str,
    tools: list[dict],
    *,
    model: Optional[str] = None,
    max_tokens: int = 800,
    temperature: float = 0.4,
) -> dict[str, Any] | None:
    """
    Chat completion with tool/function calling support.
    Returns dict with "content" (str or None) and "tool_calls" (list of {id, name, arguments}).
    Returns None on failure or missing key.
    """
    try:
        from anthropic import Anthropic
    except ImportError:
        return None
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None
    model = (model or os.environ.get("DILLY_LLM_MODEL_LIGHT") or os.environ.get("MERIDIAN_LLM_MODEL_LIGHT") or "claude-haiku-4-5-20251001").strip()

    # Convert OpenAI-style tools to Anthropic format
    anthropic_tools = []
    for t in tools:
        fn = t.get("function", t)
        anthropic_tools.append({
            "name": fn.get("name", ""),
            "description": fn.get("description", ""),
            "input_schema": fn.get("parameters", {}),
        })

    try:
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            system=system,
            messages=[{"role": "user", "content": user}],
            tools=anthropic_tools,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        content = None
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                content = (block.text or "").strip() or None
            elif block.type == "tool_use":
                tool_calls.append({
                    "id": block.id,
                    "name": block.name,
                    "arguments": block.input or {},
                })
        return {"content": content, "tool_calls": tool_calls}
    except Exception:
        return None


def is_llm_available() -> bool:
    """True if ANTHROPIC_API_KEY is set."""
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        import logging
        logging.warning("[llm_client] ANTHROPIC_API_KEY not found in env. Available keys: %s",
                       [k for k in os.environ if "API" in k or "KEY" in k or "ANTHROPIC" in k])
    return bool(key)
