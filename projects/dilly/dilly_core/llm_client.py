"""
Meridian LLM client - OpenAI only. Chat completion for normalizer and auditor.
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
    Send system + user to the LLM and return the assistant message text.
    Uses OpenAI (OPENAI_API_KEY). Returns None on failure or missing key.
    """
    return _call_openai(system, user, model=model, max_tokens=max_tokens, temperature=temperature)


def _call_openai(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    max_tokens: int = 16000,
    temperature: float = 0.1,
) -> Optional[str]:
    """Call OpenAI API (or OpenAI-compatible via OPENAI_BASE_URL)."""
    try:
        from openai import OpenAI
    except ImportError:
        return None
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    model = (model or os.environ.get("MERIDIAN_LLM_MODEL") or "gpt-4o").strip()
    base_url = os.environ.get("OPENAI_BASE_URL", "").strip() or None
    try:
        client = OpenAI(api_key=api_key, base_url=base_url, timeout=45.0)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return (response.choices[0].message.content or "").strip() or None
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
    Stream tokens from OpenAI. Yields string chunks as they arrive.
    Yields nothing (empty iterator) on failure or missing key.
    """
    try:
        from openai import OpenAI
    except ImportError:
        return
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return
    model = (model or os.environ.get("MERIDIAN_LLM_MODEL_LIGHT") or "gpt-4o-mini").strip()
    base_url = os.environ.get("OPENAI_BASE_URL", "").strip() or None
    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
        with client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        ) as stream:
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield delta
    except Exception:
        return


def get_light_model() -> str:
    """Return the 'light' model name for cheaper calls (Voice, explain-delta).
    Reads MERIDIAN_LLM_MODEL_LIGHT env var; defaults to gpt-4o-mini."""
    return (os.environ.get("MERIDIAN_LLM_MODEL_LIGHT") or "gpt-4o-mini").strip()


def get_strong_model() -> str:
    """Return the 'strong' model for complex reasoning (deep-dive Voice questions).
    Reads MERIDIAN_LLM_MODEL env var; defaults to gpt-4o."""
    return (os.environ.get("MERIDIAN_LLM_MODEL") or "gpt-4o").strip()


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
        from openai import OpenAI
    except ImportError:
        return None
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    model = (model or os.environ.get("MERIDIAN_LLM_MODEL_LIGHT") or "gpt-4o-mini").strip()
    base_url = os.environ.get("OPENAI_BASE_URL", "").strip() or None
    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            tools=tools,
            tool_choice="auto",
            max_tokens=max_tokens,
            temperature=temperature,
        )
        msg = response.choices[0].message if response.choices else None
        if not msg:
            return None
        content = (msg.content or "").strip() or None
        tool_calls = []
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                fn = getattr(tc, "function", None) or {}
                name = getattr(fn, "name", None) or (fn.get("name") if isinstance(fn, dict) else None)
                args_str = getattr(fn, "arguments", None) or (fn.get("arguments", "{}") if isinstance(fn, dict) else "{}")
                try:
                    args = json.loads(args_str) if isinstance(args_str, str) else (args_str or {})
                except json.JSONDecodeError:
                    args = {}
                tool_calls.append({
                    "id": getattr(tc, "id", None) or "",
                    "name": name or "",
                    "arguments": args,
                })
        return {"content": content, "tool_calls": tool_calls}
    except Exception:
        return None


def is_llm_available() -> bool:
    """True if OPENAI_API_KEY is set."""
    return bool(os.environ.get("OPENAI_API_KEY", "").strip())
