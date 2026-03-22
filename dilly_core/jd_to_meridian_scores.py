"""
JD → Meridian score requirements.

Given a job description (and optional title), infer the minimum Smart, Grit, and Build
scores (0–100) that indicate a strong fit for that role. Uses hybrid anchoring:
1. Infer track from JD (keyword-based)
2. Load baseline from benchmarks.json for that track
3. LLM adjusts from baseline (delta ±10 per dimension)
4. Apply aspirational uplift

Ref: projects/dilly/docs/RECRUITER_VIEW_JD_TO_SCORES.md
     projects/dilly/docs/SCORE_SCALE_WHAT_100_MEANS.md
"""

import json
import os
from typing import Any

# Aspirational uplift: add this to each dimension (capped at 100) so the bar we show
# is higher than a "bare minimum." Students aim higher, build stronger resumes.
JD_FIT_UPLIFT = int(os.environ.get("JD_FIT_UPLIFT", "5"))

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, ".."))
_BENCHMARKS_PATH = os.path.join(_WORKSPACE_ROOT, "projects", "dilly", "api", "benchmarks.json")
_EXAMPLES_PATH = os.path.join(_API_DIR, "jd_fit_examples.json")
_CORRECTIONS_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "jd_fit_corrections.jsonl")

_VALID_TRACKS = frozenset({
    "Pre-Health", "Pre-Law", "Tech", "Science", "Business", "Finance",
    "Consulting", "Communications", "Education", "Arts", "Humanities",
})

_FALLBACK = {"smart_min": 60, "grit_min": 60, "build_min": 60, "track": None, "signals": []}


def _load_benchmarks() -> dict[str, Any]:
    """Load benchmarks.json. Returns {} on failure."""
    try:
        with open(_BENCHMARKS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _get_baseline_for_track(track: str) -> tuple[int, int, int]:
    """Get tier_1 (smart, grit, build) for track. Falls back to 65, 65, 65 if missing."""
    data = _load_benchmarks()
    t = data.get(track) or data.get("Humanities") or {}
    smart = t.get("Smart", {}).get("tier_1", 65)
    grit = t.get("Grit", {}).get("tier_1", 65)
    build = t.get("Build", {}).get("tier_1", 65)
    return (int(smart), int(grit), int(build))


def _load_corrections(track: str, limit: int = 2) -> list[dict[str, Any]]:
    """Load recruiter corrections from memory/jd_fit_corrections.jsonl. Convert to example format."""
    if not os.path.isfile(_CORRECTIONS_PATH):
        return []
    entries = []
    try:
        with open(_CORRECTIONS_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("track") != track:
                        continue
                    entries.append({
                        "jd_excerpt": (entry.get("job_description") or "")[:300],
                        "smart_min": entry.get("corrected_smart_min", 70),
                        "grit_min": entry.get("corrected_grit_min", 70),
                        "build_min": entry.get("corrected_build_min", 70),
                        "track": track,
                        "signals": ["Recruiter correction"],
                    })
                except (json.JSONDecodeError, TypeError):
                    continue
    except Exception:
        return []
    entries.reverse()
    return entries[:limit]


def _load_few_shot_examples(track: str, max_examples: int = 2) -> list[dict[str, Any]]:
    """Load examples from jd_fit_examples.json + recruiter corrections. Prefer same-track."""
    result: list[dict[str, Any]] = []
    corrections = _load_corrections(track, limit=max_examples)
    result.extend(corrections)
    if len(result) >= max_examples:
        return result[:max_examples]
    try:
        with open(_EXAMPLES_PATH, "r", encoding="utf-8") as f:
            all_ex = json.load(f)
    except Exception:
        return result
    if not isinstance(all_ex, list):
        return result
    same_track = [e for e in all_ex if isinstance(e, dict) and e.get("track") == track]
    other = [e for e in all_ex if isinstance(e, dict) and e.get("track") != track]
    for e in same_track + other:
        if len(result) >= max_examples:
            break
        result.append(e)
    return result[:max_examples]


def _build_system_prompt(baseline_smart: int, baseline_grit: int, baseline_build: int, track: str) -> str:
    examples = _load_few_shot_examples(track, max_examples=2)
    examples_block = ""
    if examples:
        lines = []
        for i, ex in enumerate(examples, 1):
            jd = (ex.get("jd_excerpt") or "")[:300]
            sm = ex.get("smart_min", 70)
            gr = ex.get("grit_min", 70)
            bu = ex.get("build_min", 70)
            sigs = ex.get("signals") or []
            lines.append(f"Example {i} ({ex.get('track', '?')}): JD: \"{jd}...\" -> smart_min={sm}, grit_min={gr}, build_min={bu}. Signals: {sigs[:3]}")
        examples_block = "\n**Few-shot examples (use similar reasoning):**\n" + "\n".join(lines) + "\n\n"

    return f"""You are Dilly's job-readiness expert. Meridian scores candidates on three dimensions (0–100 each): Smart, Grit, Build. Your task is to infer the **minimum** scores for a **strong fit** for this role.

**Baseline for {track}:** Smart {baseline_smart}, Grit {baseline_grit}, Build {baseline_build}. These are our track benchmarks. Adjust up or down by at most ±10 per dimension based on JD specifics. If the JD stresses technical depth more than typical {track} roles, nudge Smart up. If it emphasizes leadership/ownership, nudge Grit up. If it requires portfolio/shipped work, nudge Build up.
{examples_block}
**Dimension definitions:**
- **Smart:** Academic/technical rigor — education, coursework, certifications, problem-solving. Higher when JD stresses degrees, GPA, quant skills, technical depth.
- **Grit:** Leadership, ownership, impact — driving outcomes, leading teams, resilience, quantifiable results. Higher when JD stresses "led," "drove," cross-functional impact.
- **Build:** Concrete proof — experience, projects, portfolio, shipped work, domain evidence. Higher when JD stresses years of experience, portfolio, projects.

**Output:** Single JSON only, no markdown. Use this exact shape:
{{"smart_min": <int>, "grit_min": <int>, "build_min": <int>, "track": "{track}", "signals": ["<reason for smart>", "<reason for grit>", "<reason for build>"]}}

- smart_min, grit_min, build_min: integers 0–100. Stay within ±10 of baseline unless JD strongly warrants it.
- track: "{track}" (use the provided track).
- signals: exactly 3 short strings (one per dimension), each under 80 chars."""


def _parse_response(raw: str | None) -> dict[str, Any] | None:
    """Extract JSON from LLM response and validate. Returns None on failure."""
    if not raw or not raw.strip():
        return None
    text = raw.strip()
    # Strip markdown code block if present
    for prefix in ("```json", "```"):
        if prefix in text:
            try:
                start = text.index(prefix) + len(prefix)
                end = text.find("```", start)
                if end == -1:
                    end = len(text)
                text = text[start:end].strip()
            except ValueError:
                pass
            break
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    smart = data.get("smart_min")
    grit = data.get("grit_min")
    build = data.get("build_min")
    if smart is None or grit is None or build is None:
        return None
    try:
        smart = int(smart)
        grit = int(grit)
        build = int(build)
    except (TypeError, ValueError):
        return None
    if not (0 <= smart <= 100 and 0 <= grit <= 100 and 0 <= build <= 100):
        return None
    track = data.get("track")
    if track is not None and not isinstance(track, str):
        track = None
    if track is not None:
        track = track.strip() or None
    signals = data.get("signals")
    if not isinstance(signals, list):
        signals = []
    signals = [str(s).strip()[:80] for s in signals if s][:3]
    return {
        "smart_min": smart,
        "grit_min": grit,
        "build_min": build,
        "track": track,
        "signals": signals,
    }


def _apply_uplift(parsed: dict[str, Any], uplift: int) -> dict[str, Any]:
    """Add uplift to each dimension, cap at 100."""
    if uplift <= 0:
        return parsed
    return {
        **parsed,
        "smart_min": min(100, parsed["smart_min"] + uplift),
        "grit_min": min(100, parsed["grit_min"] + uplift),
        "build_min": min(100, parsed["build_min"] + uplift),
    }


def _validate_and_clamp(parsed: dict[str, Any], track: str) -> dict[str, Any]:
    """Clamp scores to reasonable range per track."""
    lo, hi = 50, 95  # reasonable bounds
    smart = max(lo, min(hi, parsed.get("smart_min", 60)))
    grit = max(lo, min(hi, parsed.get("grit_min", 60)))
    build = max(lo, min(hi, parsed.get("build_min", 60)))
    return {
        **parsed,
        "smart_min": smart,
        "grit_min": grit,
        "build_min": build,
        "track": track if track in _VALID_TRACKS else None,
    }


def jd_to_meridian_scores(
    job_description: str,
    job_title: str | None = None,
    *,
    uplift: int | None = None,
) -> dict[str, Any]:
    """
    Infer Meridian score requirements from a job description.

    Args:
        job_description: Full JD text (or excerpt, at least a few sentences).
        job_title: Optional role title (e.g. "Software Engineer Intern").
        uplift: Optional override for JD_FIT_UPLIFT (default from env or 5).

    Returns:
        {
            "smart_min": int (0–100),
            "grit_min": int,
            "build_min": int,
            "min_final_score": int (average of three, rounded),
            "track": str | None,
            "signals": list[str] (length 0–3),
            "unavailable": bool (True if LLM failed or missing key),
        }
        On failure or missing OPENAI_API_KEY: returns fallback (60, 60, 60) and unavailable=True.
    """
    uplift = uplift if uplift is not None else JD_FIT_UPLIFT
    try:
        from dilly_core.llm_client import get_chat_completion
        from dilly_core.jd_track_inference import infer_track_from_jd
    except ImportError:
        out = {**_FALLBACK, "min_final_score": 60, "unavailable": True}
        return _apply_uplift(out, uplift)

    if not os.environ.get("OPENAI_API_KEY", "").strip():
        out = {**_FALLBACK, "min_final_score": 60, "unavailable": True}
        return _apply_uplift(out, uplift)

    jd_text = (job_description or "").strip()[:8000]
    if not jd_text:
        out = {**_FALLBACK, "min_final_score": 60, "unavailable": True}
        return _apply_uplift(out, uplift)

    title_str = (job_title or "").strip() or None
    track = infer_track_from_jd(jd_text, title_str) or "Humanities"
    baseline_smart, baseline_grit, baseline_build = _get_baseline_for_track(track)
    system = _build_system_prompt(baseline_smart, baseline_grit, baseline_build, track)

    title_line = f"Job title: {title_str}\n\n" if title_str else ""
    user = f"{title_line}Job description:\n{jd_text}"

    raw = get_chat_completion(
        system,
        user,
        max_tokens=600,
        temperature=0.1,
    )
    parsed = _parse_response(raw)
    if not parsed:
        out = {**_FALLBACK, "min_final_score": 60, "unavailable": True}
        return _apply_uplift(out, uplift)

    validated = _validate_and_clamp(parsed, track)
    applied = _apply_uplift(validated, uplift)
    avg = round(
        (applied["smart_min"] + applied["grit_min"] + applied["build_min"]) / 3.0
    )
    return {
        **applied,
        "min_final_score": min(100, avg),
        "unavailable": False,
    }


def jd_to_required_scores_for_job(
    job_description: str,
    job_title: str | None = None,
    *,
    uplift: int | None = None,
) -> dict[str, Any] | None:
    """
    Same as jd_to_meridian_scores but returns a shape suitable for
    required_scores / target-reach: min_smart, min_grit, min_build, min_final_score, track.
    Returns None when unavailable (so caller can skip or use fallback).
    """
    result = jd_to_meridian_scores(
        job_description,
        job_title=job_title,
        uplift=uplift,
    )
    if result.get("unavailable"):
        return None
    return {
        "min_smart": result["smart_min"],
        "min_grit": result["grit_min"],
        "min_build": result["build_min"],
        "min_final_score": result["min_final_score"],
        "track": result.get("track"),
    }
