"""
Embedding utilities for candidate document and recruiter role search.

Uses a single model for both candidates and roles so similarity is comparable.

Quality bar (Mercor-grade):
- Bounded input: truncate at word boundary when over max_chars (no mid-word cut).
- No crash: return None on missing OPENAI_API_KEY, API error, or invalid response.
- Deterministic: same model name and input → same embedding (API is deterministic).

Contract:
- Input: text (str). Optional model, max_chars (default 8192).
- Output: list[float] (length = model dimension) or None.
- When key missing or API fails: None. Never raises.
Ref: projects/meridian/docs/RECRUITER_SEMANTIC_MATCHING_SPEC.md
"""

from __future__ import annotations

import os

# Model used for candidate doc and role description. Same for both so cosine similarity is meaningful.
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
# OpenAI dimension for text-embedding-3-small (1536). Used for validation.
DEFAULT_EMBEDDING_DIM = 1536
# Max input chars so we stay under model limit (8k tokens ~= 32k chars; we cap lower).
MAX_EMBEDDING_INPUT_CHARS = 8_192


def _truncate_at_word_boundary(text: str, max_chars: int) -> str:
    """Truncate at last space so we don't cut mid-word; else truncate at max_chars."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_space = truncated.rfind(" ")
    if last_space > max_chars // 2:
        return truncated[:last_space].rstrip()
    return truncated.rstrip()


def get_embedding(
    text: str,
    model: str | None = None,
    max_chars: int = MAX_EMBEDDING_INPUT_CHARS,
) -> list[float] | None:
    """
    Embed text with OpenAI. Returns list of floats or None on failure.
    Truncates at word boundary when over max_chars. Requires OPENAI_API_KEY.
    """
    if not text or not isinstance(text, str):
        return None
    model = (model or DEFAULT_EMBEDDING_MODEL).strip() or DEFAULT_EMBEDDING_MODEL
    text = text.strip()
    if not text:
        return None
    text = _truncate_at_word_boundary(text, max_chars)
    if not text:
        return None
    if not os.environ.get("OPENAI_API_KEY"):
        return None
    try:
        from openai import OpenAI
        client = OpenAI(timeout=30.0)
        resp = client.embeddings.create(model=model, input=text)
        if not resp or not resp.data or len(resp.data) == 0:
            return None
        vec = resp.data[0].embedding
        if not isinstance(vec, list) or len(vec) == 0:
            return None
        return [float(x) for x in vec]
    except Exception:
        return None
