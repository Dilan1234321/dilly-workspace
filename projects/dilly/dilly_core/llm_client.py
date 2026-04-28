"""
Dilly LLM client - routes between Anthropic Claude (user-facing) and
OpenAI GPT-4o-mini (backend work). Chat completion for auditor, voice,
extraction, and tools.

Split-brain design:
  - User-facing replies (routers/ai.py /ai/chat) call Anthropic directly.
  - Everything else (extraction, narrative, audit explain, ATS, voice
    post-processing) routes through this file. When
    DILLY_BACKEND_PROVIDER=openai, every call here goes to GPT-4o-mini
    instead of Haiku. ~7x cheaper per call, with no user-visible output
    quality change since these tasks are JSON / structured categorization
    where both models are comparable.

Switch back anytime with DILLY_BACKEND_PROVIDER=anthropic (or unset).
"""

import json
import os
from typing import Any, Optional


def _provider() -> str:
    """Which provider to use for non-user-facing LLM work.
    Returns 'openai' or 'anthropic'. Default: anthropic (safe fallback
    if OPENAI_API_KEY is missing)."""
    p = (os.environ.get("DILLY_BACKEND_PROVIDER") or "").strip().lower()
    if p == "openai" and os.environ.get("OPENAI_API_KEY", "").strip():
        return "openai"
    return "anthropic"


def _openai_model() -> str:
    """Default OpenAI model for backend work. Override with env var."""
    return (os.environ.get("DILLY_OPENAI_MODEL") or "gpt-4o-mini").strip()


def _get_chat_completion_openai(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    max_tokens: int = 16000,
    temperature: float = 0.1,
    log_email: str = "",
    log_feature: str = "other",
    log_metadata: Optional[dict] = None,
) -> Optional[str]:
    """OpenAI path. Same signature as the Anthropic version so callers
    don't care which backend ran.

    OpenAI-specific notes:
      - No prompt caching marker needed. OpenAI auto-caches prefixes
        server-side without any explicit control. ~50% discount on
        repeated long prompts, no code required.
      - System message goes as its own role="system" chat message.
      - gpt-4o-mini max output is 16k tokens; request cap is honored.
    """
    try:
        from openai import OpenAI
    except ImportError:
        return None
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    chosen = (model or _openai_model()).strip()
    try:
        client = OpenAI(api_key=api_key, timeout=45.0)
        response = client.chat.completions.create(
            model=chosen,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        # Cost ledger. OpenAI's usage object exposes prompt_tokens /
        # completion_tokens / prompt_tokens_details.cached_tokens. We
        # translate to the same fields log_usage expects.
        try:
            from projects.dilly.api.llm_usage_log import log_usage
            usage = getattr(response, "usage", None)
            prompt_tok = int(getattr(usage, "prompt_tokens", 0) or 0)
            out_tok = int(getattr(usage, "completion_tokens", 0) or 0)
            cached_tok = 0
            details = getattr(usage, "prompt_tokens_details", None)
            if details is not None:
                cached_tok = int(getattr(details, "cached_tokens", 0) or 0)
            # Anthropic split input_tokens (fresh) and cache_read; OpenAI
            # reports prompt_tokens = fresh + cached combined. Pass the
            # total as input_tokens and cached separately — _cost_usd
            # handles the double-count correctly (fresh = input - cached).
            log_usage(
                log_email, log_feature, chosen,
                input_tokens=prompt_tok,
                output_tokens=out_tok,
                cache_read_tokens=cached_tok,
                cache_write_tokens=0,
                request_id=getattr(response, "id", None),
                metadata=log_metadata or {"route": "dilly_core/llm_client.py"},
            )
        except Exception:
            pass  # cost logging failures never break the chat
        msg = response.choices[0].message if response.choices else None
        text = (getattr(msg, "content", None) or "") if msg else ""
        return text.strip() or None
    except Exception:
        return None


def get_chat_completion(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    max_tokens: int = 16000,
    temperature: float = 0.1,
    # Cost ledger attribution. Callers that know the user + feature
    # should pass them so per-user spend can be tracked. Default
    # anonymous + FEATURES.OTHER so we don't break any call sites
    # that haven't been updated yet.
    log_email: str = "",
    log_feature: str = "other",
    log_metadata: Optional[dict] = None,
) -> Optional[str]:
    """
    Send system + user to whichever backend is selected (see _provider()).
    Returns the assistant message text, or None on failure.

    Default provider: Anthropic Claude (claude-haiku-4-5).
    Set DILLY_BACKEND_PROVIDER=openai to route through GPT-4o-mini.
    The `model` kwarg still wins if explicitly passed.

    Cost optimization (Anthropic path): for any system prompt >= 1024
    tokens (~4000 chars) we wrap it in an ephemeral prompt-cache block.
    OpenAI auto-caches prefixes server-side so no wrapping is needed.
    """
    # Route to OpenAI if configured. Only skip this when the caller
    # explicitly passed a Claude-family model (we never send claude-*
    # names to OpenAI since it would fail).
    caller_forced_anthropic = bool(model and model.lower().startswith("claude"))
    if _provider() == "openai" and not caller_forced_anthropic:
        return _get_chat_completion_openai(
            system, user,
            model=None if (model and model.lower().startswith("claude")) else model,
            max_tokens=max_tokens,
            temperature=temperature,
            log_email=log_email,
            log_feature=log_feature,
            log_metadata=log_metadata,
        )

    try:
        from anthropic import Anthropic
    except ImportError:
        return None
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None
    model = (model or os.environ.get("DILLY_LLM_MODEL") or os.environ.get("MERIDIAN_LLM_MODEL") or "claude-haiku-4-5-20251001").strip()

    # Wrap the system prompt in a cache block. Cache write costs 1.25x
    # input price and cache reads cost 0.10x — so caching pays off
    # after just ~1.3 reads. Anthropic's MINIMUM cacheable size for
    # Haiku is 2048 tokens (~8000 chars) so we only wrap above that
    # — under it the SDK will reject the cache_control marker. The
    # main voice system prompt is well above this; the profile
    # extractor is below and can't be cached at this layer.
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
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response
            log_from_anthropic_response(
                log_email, log_feature, response,
                metadata=log_metadata or {"route": "dilly_core/llm_client.py"},
            )
        except Exception:
            pass
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

    Caches the system prompt when long enough to be worth caching.
    Without this, voice chat was paying full input cost on a 5k–8k
    token system prompt every turn instead of the 90%-off cache rate.
    """
    try:
        from anthropic import Anthropic
    except ImportError:
        return
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return
    model = (model or os.environ.get("DILLY_LLM_MODEL_LIGHT") or os.environ.get("MERIDIAN_LLM_MODEL_LIGHT") or "claude-haiku-4-5-20251001").strip()
    if isinstance(system, str) and len(system) >= 4000:
        system_param: Any = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
    else:
        system_param = system
    try:
        client = Anthropic(api_key=api_key)
        with client.messages.stream(
            model=model,
            system=system_param,
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
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response("", FEATURES.OTHER, response,
                                        metadata={"route": "dilly_core/llm_client.py tool"})
        except Exception:
            pass
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
