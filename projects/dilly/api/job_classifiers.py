"""
Job attribute classifiers.

Small, cheap Haiku calls that turn a free-form job description into
structured boolean(ish) attributes we can index and filter on.

Why this exists:
  Our filters (no-degree, H-1B sponsor, fair-chance, remote-only, etc.)
  were all keyword heuristics on the `description` column. Keywords
  miss a lot of jobs and mis-classify others. A single Haiku call per
  job is ~$0.0003; at ~5k new jobs/month that's ~$1.50/month to get
  structured, accurate filters. Worth it.

Design rules:
  - Every classifier returns one of {'required', 'not_required',
    'unclear'} plus nothing else. Keep it boring.
  - Never throw. A classification failure returns 'unclear' so the
    caller can still save a value and not re-process the row forever.
  - One Anthropic call per classifier invocation, max 60 output tokens.
    If you add more attributes later, batch them into a single call.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Literal

logger = logging.getLogger(__name__)

DegreeVerdict = Literal["required", "not_required", "unclear"]

# Classifier model — Haiku 4.5. Cheap, fast, accurate enough for
# two-label binary+unclear classification.
_MODEL = "claude-haiku-4-5-20251001"

_SYSTEM = (
    "You classify job descriptions by whether a 4-year college degree is "
    "required to be considered for the role.\n\n"
    "Return ONE of three verdicts as JSON:\n"
    '  {"verdict": "required"}     — the job requires a bachelor\'s or higher.\n'
    '  {"verdict": "not_required"} — the job explicitly welcomes candidates without a degree, '
    "or accepts equivalent experience in lieu of one.\n"
    '  {"verdict": "unclear"}      — degree is preferred but not hard-required, '
    "or the description doesn't say anything about education.\n\n"
    "Rules:\n"
    "- 'Bachelor degree preferred' with no alternative path = 'unclear'.\n"
    "- 'Bachelor degree or equivalent experience' = 'not_required'.\n"
    "- 'High school diploma or GED' with no bachelor mention = 'not_required'.\n"
    "- A description that never mentions education = 'unclear'.\n"
    "- Return ONLY the JSON. No markdown, no prose, no other keys."
)


def _clean_description(desc: str, max_chars: int = 3500) -> str:
    """Strip HTML, collapse whitespace, cap length for the model input."""
    if not desc:
        return ""
    txt = re.sub(r"<[^>]+>", " ", desc)
    txt = re.sub(r"\s+", " ", txt).strip()
    return txt[:max_chars]


def classify_degree_requirement(description: str, client=None) -> DegreeVerdict:
    """
    Classify a single job description.

    Pass a pre-built anthropic.Anthropic client via `client` when calling
    from a batch loop — reusing the client avoids per-call TLS handshakes.
    Without it, the function builds its own.
    """
    text = _clean_description(description)
    if len(text) < 40:
        # Nothing to work with.
        return "unclear"

    try:
        if client is None:
            import anthropic
            client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

        resp = client.messages.create(
            model=_MODEL,
            max_tokens=60,
            system=_SYSTEM,
            messages=[{"role": "user", "content": text}],
        )
        raw = (resp.content[0].text or "").strip()

        # Some models sometimes wrap JSON in ```. Strip defensively.
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:].strip()

        data = json.loads(raw)
        verdict = str(data.get("verdict", "")).lower().strip()
        if verdict in ("required", "not_required", "unclear"):
            return verdict  # type: ignore[return-value]
        return "unclear"
    except Exception as e:
        logger.warning("classify_degree_requirement failed: %s", e)
        return "unclear"


def classify_degree_requirements_batch(rows, api_key: str | None = None, max_rows: int | None = None):
    """
    Classify many rows in a single process. `rows` is an iterable of
    {id, description} dicts. Yields (id, verdict) tuples.

    The caller is responsible for writing the verdicts back to the DB
    and for committing. This function only knows about the model.

    `max_rows` caps the iteration to keep cron runs bounded and
    predictable. None = no cap.
    """
    import anthropic
    client = anthropic.Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY", ""))

    processed = 0
    for row in rows:
        if max_rows is not None and processed >= max_rows:
            return
        jid = row.get("id")
        desc = row.get("description") or ""
        verdict = classify_degree_requirement(desc, client=client)
        yield jid, verdict
        processed += 1
