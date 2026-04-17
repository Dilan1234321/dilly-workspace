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
H1BVerdict = Literal["sponsors", "no_sponsor", "unclear"]
FairChanceVerdict = Literal["fair_chance", "standard", "unclear"]

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


# ── Combined classifier ────────────────────────────────────────────────────
# One prompt returns all three attribute verdicts. Cheaper than three
# separate calls (same input tokens, only output tokens triple — which
# are still tiny JSON). Used by the nightly backfill path.

_COMBINED_SYSTEM = (
    "You classify job descriptions by three independent attributes. "
    "Return ONE JSON object with exactly these keys:\n\n"
    '  "degree":       "required" | "not_required" | "unclear"\n'
    '  "h1b_sponsor":  "sponsors" | "no_sponsor"   | "unclear"\n'
    '  "fair_chance":  "fair_chance" | "standard"  | "unclear"\n\n'
    "Definitions:\n"
    "degree — does this role require a 4-year degree?\n"
    "  required:     bachelor's or higher is a hard requirement with no alternative.\n"
    "  not_required: degree is optional, or equivalent experience / GED accepted.\n"
    "  unclear:      preferred-but-not-required, or education not discussed.\n\n"
    "h1b_sponsor — does the employer sponsor H-1B visas for this role?\n"
    "  sponsors:     description explicitly welcomes visa sponsorship, OR the employer is "
    "on the well-known sponsor shortlist (major tech firms, most F500 engineering orgs). "
    "Words like 'will sponsor', 'visa sponsorship available', 'H-1B'.\n"
    "  no_sponsor:   description explicitly says 'must be authorized to work in US without "
    "sponsorship', 'no sponsorship', 'US citizen only', 'security clearance required' "
    "(federal/defense roles effectively cannot sponsor).\n"
    "  unclear:      nothing said about work authorization.\n\n"
    "fair_chance — is this role fair-chance friendly (accepts candidates with a record)?\n"
    "  fair_chance:  explicit fair-chance language, 'ban the box' compliant, "
    "'background check considered on individualized basis', known fair-chance employers "
    "(Second Chance Business Coalition, Dave's Killer Bread, Nehemiah Mfg, Greyston Bakery).\n"
    "  standard:     description requires no-criminal-background, clean record, "
    "DOJ/defense/finance roles with background-disqualifying requirements.\n"
    "  unclear:      background check not discussed.\n\n"
    "Return ONLY the JSON object. No markdown fences, no prose."
)


def classify_all_attributes(description: str, client=None) -> dict:
    """
    Classify a single description into all three attribute verdicts in
    one model call. Returns {degree, h1b_sponsor, fair_chance} with
    'unclear' as the default for any value that fails to parse.
    """
    default = {"degree": "unclear", "h1b_sponsor": "unclear", "fair_chance": "unclear"}
    text = _clean_description(description)
    if len(text) < 40:
        return default

    try:
        if client is None:
            import anthropic
            client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

        resp = client.messages.create(
            model=_MODEL,
            max_tokens=150,
            system=_COMBINED_SYSTEM,
            messages=[{"role": "user", "content": text}],
        )
        raw = (resp.content[0].text or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:].strip()

        data = json.loads(raw)
        out = dict(default)
        for k in ("degree", "h1b_sponsor", "fair_chance"):
            v = str(data.get(k, "")).lower().strip()
            # Defensive: only accept valid values per column.
            if k == "degree" and v in ("required", "not_required", "unclear"):
                out[k] = v
            elif k == "h1b_sponsor" and v in ("sponsors", "no_sponsor", "unclear"):
                out[k] = v
            elif k == "fair_chance" and v in ("fair_chance", "standard", "unclear"):
                out[k] = v
        return out
    except Exception as e:
        logger.warning("classify_all_attributes failed: %s", e)
        return default


def classify_all_attributes_batch(rows, api_key: str | None = None, max_rows: int | None = None):
    """Iterate rows, yield (id, verdicts_dict) tuples. Same shape as the
    degree-only batcher — caller writes back and commits."""
    import anthropic
    client = anthropic.Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY", ""))

    processed = 0
    for row in rows:
        if max_rows is not None and processed >= max_rows:
            return
        jid = row.get("id")
        desc = row.get("description") or ""
        verdicts = classify_all_attributes(desc, client=client)
        yield jid, verdicts
        processed += 1
