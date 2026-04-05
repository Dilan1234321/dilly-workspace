"""
Recruiter semantic search: load indexed candidates, embed role, k-NN + filters + score blend.

Used by POST /recruiter/search. The matching engine only considers candidates in Dilly profiles:
- Candidate pool is exclusively memory/dilly_profiles (one folder per user: profile.json + candidate_index.json).
- No other source (e.g. parsed_resumes, external DB) is used. Only users who have a Dilly profile folder
  with both profile and index are searchable by recruiters.

Quality bar (Mercor-grade):
- Consistent: same role_description + filters → same ordering (tie-break by email); deterministic scores.
- Schema-tolerant: defensive load (try/except on JSON, float coercion); filters accept list or single value; missing keys → defaults.
- Bounded: limit/offset enforced by API layer (1–100, ≥0); no unbounded iteration.
- Documented contract: see below.

Contract:
- load_indexed_candidates(): returns list of dicts from dilly_profiles only (email, candidate_id, embedding, skill_tags, major, majors, school_id, job_locations, track, smart, grit, build, final_score, name). Skips bad/missing data; never raises.
- search(role_description, filters?, sort?, limit?, offset?, required_skills?, min_smart?, min_grit?, min_build?): returns {"candidates": [...], "total": N}. Candidates exclude embedding. On embed failure or ImportError returns {"candidates": [], "total": 0}. Filter keys: major (list or single), school_id, cities (list), track; min_smart/min_grit/min_build applied as hard cut. Sort may include top_pct_sgb (avg top % for Smart/Grit/Build vs peers), top_pct_final, top_pct_ats, top_pct_general (blend); lower top % = stronger vs cohort; missing metrics sort last.
Ref: projects/dilly/docs/RECRUITER_SEMANTIC_MATCHING_SPEC.md
"""

from __future__ import annotations

import json
import math
import os
import time
import hashlib
from concurrent.futures import ThreadPoolExecutor
from typing import Any

# Resolve workspace root (this file is in projects/dilly/api/)
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", ".."))
# Recruiter pool: only memory/dilly_profiles. Do not add other sources (e.g. parsed_resumes alone).
_PROFILES_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
_PROFILE_FILENAME = "profile.json"
_INDEX_FILENAME = "candidate_index.json"

# --- LLM rerank cache (short TTL, in-memory) ---
_RERANK_CACHE_TTL_S = 10 * 60  # 10 minutes
_rerank_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}  # key -> (expires_epoch_s, payload)

# --- Search speed caches ---
_EMBED_CACHE_TTL_S = 10 * 60  # 10 minutes
_embed_cache: dict[str, tuple[float, list[float]]] = {}  # role_hash -> (expires, embedding)

_ROLE_SPEC_CACHE_TTL_S = 10 * 60  # 10 minutes
_role_spec_cache: dict[str, tuple[float, dict]] = {}  # role_hash -> (expires, role_spec)

_CANDIDATES_CACHE_TTL_S = 5 * 60  # 5 minutes
_candidates_cache: tuple[float, float, list[dict[str, Any]]] | None = None  # (expires, dir_mtime, candidates)


def _hash_text(s: str) -> str:
    return hashlib.sha256((s or "").encode("utf-8")).hexdigest()


def _correct_jd_typos(raw: str) -> str:
    """
    Use LLM to correct typos and obvious misspellings in a job description.
    Handles serious typos (e.g. 'softwre eng', 'machne lerning', 'progrm managr').
    Returns the corrected text, or the original if correction fails or is unchanged.
    """
    raw = (raw or "").strip()
    if not raw or len(raw) < 3:
        return raw
    try:
        from dilly_core.llm_client import get_chat_completion, get_light_model
    except Exception:
        return raw
    if not (os.environ.get("OPENAI_API_KEY") or "").strip():
        return raw
    system = (
        "You correct typos and misspellings in job descriptions. "
        "Fix spelling errors, transposed letters, missing letters, and obvious abbreviations. "
        "Preserve meaning, structure, and intent. Do not add or remove content. "
        "Return ONLY the corrected text, nothing else. No quotes, no explanation."
    )
    user = raw[:3000]
    out = get_chat_completion(system, user, model=get_light_model(), max_tokens=3500, temperature=0.0)
    if not out or not out.strip():
        return raw
    corrected = out.strip()
    # Remove surrounding quotes if LLM added them
    for q in ('"', "'", "`"):
        if corrected.startswith(q) and corrected.endswith(q) and len(corrected) >= 2:
            corrected = corrected[1:-1].strip()
    if not corrected:
        return raw
    # Only return corrected if it's meaningfully different (avoid trivial whitespace changes)
    if corrected.lower().strip() == raw.lower().strip():
        return raw
    return corrected


def _get_cached_embedding(role_description: str) -> list[float] | None:
    """Return cached embedding if valid, else None."""
    role_trimmed = (role_description or "").strip()
    if not role_trimmed:
        return None
    key = _hash_text(role_trimmed[:2400])
    now = time.time()
    hit = _embed_cache.get(key)
    if hit:
        exp, emb = hit
        if exp > now:
            return emb
        _embed_cache.pop(key, None)
    return None


def _set_cached_embedding(role_description: str, embedding: list[float]) -> None:
    role_trimmed = (role_description or "").strip()
    if not role_trimmed or not embedding:
        return
    key = _hash_text(role_trimmed[:2400])
    now = time.time()
    if len(_embed_cache) > 100:
        for k in list(_embed_cache.keys())[:40]:
            exp, _ = _embed_cache.get(k, (0.0, []))
            if exp <= now:
                _embed_cache.pop(k, None)
    _embed_cache[key] = (now + _EMBED_CACHE_TTL_S, embedding)


def _get_cached_role_spec(role_description: str) -> dict[str, list[str]] | None:
    """Return cached role_spec (must_have, nice_to_have) if valid, else None."""
    role_trimmed = (role_description or "").strip()
    if not role_trimmed:
        return None
    key = _hash_text(role_trimmed[:2400])
    now = time.time()
    hit = _role_spec_cache.get(key)
    if hit:
        exp, spec = hit
        if exp > now:
            return spec
        _role_spec_cache.pop(key, None)
    return None


def _set_cached_role_spec(role_description: str, spec: dict[str, list[str]]) -> None:
    role_trimmed = (role_description or "").strip()
    if not role_trimmed:
        return
    key = _hash_text(role_trimmed[:2400])
    now = time.time()
    if len(_role_spec_cache) > 100:
        for k in list(_role_spec_cache.keys())[:40]:
            exp, _ = _role_spec_cache.get(k, (0.0, {}))
            if exp <= now:
                _role_spec_cache.pop(k, None)
    _role_spec_cache[key] = (now + _ROLE_SPEC_CACHE_TTL_S, spec)


def _cache_get(key: str) -> list[dict[str, Any]] | None:
    now = time.time()
    hit = _rerank_cache.get(key)
    if not hit:
        return None
    exp, payload = hit
    if exp <= now:
        _rerank_cache.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: list[dict[str, Any]]) -> None:
    # Simple bounded cleanup: drop expired entries opportunistically
    now = time.time()
    if len(_rerank_cache) > 200:
        for k in list(_rerank_cache.keys())[:80]:
            exp, _ = _rerank_cache.get(k, (0.0, []))
            if exp <= now:
                _rerank_cache.pop(k, None)
    _rerank_cache[key] = (now + _RERANK_CACHE_TTL_S, payload)


def _llm_rerank_candidates(role_description: str, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    LLM rerank for top-K candidates.
    Returns list of {candidate_id, rerank_score, rerank_reason} (same length as candidates when possible).
    Deterministic-ish: low temperature, strict JSON parsing, fallbacks.
    """
    if not candidates or not (role_description or "").strip():
        return []
    try:
        from dilly_core.llm_client import get_chat_completion
    except ImportError:
        return []
    if not (os.environ.get("OPENAI_API_KEY") or "").strip():
        return []

    # Cache key: role text + candidate ids (order-sensitive)
    role_hash = _hash_text(role_description.strip()[:2400])
    ids = [str(c.get("candidate_id") or "").strip() for c in candidates]
    ids_hash = _hash_text("|".join(ids))
    cache_key = f"rerank:v7:{role_hash}:{ids_hash}"  # v7: sort fix; v6: prompt requires true fit %, full range
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    # Rich candidate cards: tags + evidence + experience + audit data
    cards = []
    for c in candidates:
        v2_tags = c.get("skill_tags_v2") or c.get("skill_tags") or []
        evidence = c.get("tag_evidence") if isinstance(c.get("tag_evidence"), dict) else {}
        evidence = {k: (v[:2] if isinstance(v, list) else v) for k, v in evidence.items() if k in set(v2_tags)}
        card: dict[str, Any] = {
            "candidate_id": c.get("candidate_id"),
            "name": c.get("name"),
            "majors": c.get("majors") or ([c.get("major")] if c.get("major") else []),
            "minors": c.get("minors") or [],
            "school_id": c.get("school_id"),
            "track": c.get("track"),
            "skill_tags_v2": v2_tags,
            "tag_evidence": evidence,
            "must_have_tags": c.get("must_have_tags") or [],
            "nice_to_have_tags": c.get("nice_to_have_tags") or [],
            "smart": c.get("smart"),
            "grit": c.get("grit"),
            "build": c.get("build"),
            "final_score": c.get("final_score"),
            "semantic_score": c.get("semantic_score"),
            "skill_fit_score": c.get("skill_fit_score"),
            "must_have_quality": c.get("must_have_quality"),
            "dilly_fit_score": c.get("dilly_fit_score"),
        }
        if c.get("experience_highlights"):
            card["experience_highlights"] = c["experience_highlights"]
        take = c.get("dilly_take") or c.get("meridian_take")
        if take:
            card["dilly_take"] = take
        if c.get("audit_evidence"):
            card["audit_evidence"] = c["audit_evidence"]
        if c.get("application_target"):
            card["application_target"] = c["application_target"]
        cards.append(card)

    system = (
        "You are Dilly's recruiter-grade reranker. Be CANDID and DIRECT — never sugarcoat.\n"
        "Given a job description and rich candidate cards, rerank candidates by likely fit.\n"
        "Each card may include: skill_tags_v2, tag_evidence (proof per skill), "
        "experience_highlights (company, role, bullets), dilly_take (one-line audit summary), "
        "audit_evidence (smart/grit/build quotes), application_target, majors, minors.\n\n"
        "Evaluation priorities:\n"
        "1. Must-have skill coverage backed by REAL evidence (tag_evidence + experience_highlights).\n"
        "2. Depth of relevant experience — prefer candidates who BUILT, SHIPPED, or LED projects "
        "over those who merely listed a skill.\n"
        "3. Application target alignment (if candidate seeks internship and JD is internship, that's a plus).\n"
        "4. Dilly scores (smart, grit, build) as tiebreakers.\n\n"
        "HONESTY RULES:\n"
        "- If a candidate is genuinely an exceptional match, SAY SO clearly. Don't hold back.\n"
        "- If a candidate has gaps, NAME the gaps. Don't paper over weaknesses.\n"
        "- 'Currently learning X' is NOT the same as 'built X in production'. Be precise.\n\n"
        "fit_level (REQUIRED per candidate):\n"
        "- \"Standout\" — for candidates who genuinely deserve it. Direct proven experience that matches the role exceptionally. "
        "Only when evidence is undeniable (e.g. held the exact role, built the exact thing). "
        "There can be multiple Standouts; give it to everyone who qualifies. Don't limit to one, but don't inflate either.\n"
        "- \"Strong fit\" — solid relevant experience with good evidence.\n"
        "- \"Moderate fit\" — some relevant skills/experience but notable gaps.\n"
        "- \"Developing\" — limited evidence for this role; mostly learning or tangential.\n\n"
        "rerank_reason MUST cite specific evidence: name the company, project, or achievement. "
        "For Standout/Strong: lead with what makes them great. "
        "For Moderate/Developing: name what's missing or weak.\n\n"
        "rerank_score (CRITICAL): Assign each candidate their TRUE fit percentage 0-100. "
        "Use the full range: exceptional matches 75-100, strong 55-74, moderate 35-54, developing 15-34, poor fit 0-14. "
        "Every candidate must get a DIFFERENT score — use decimals (e.g. 27.3, 27.8, 26.4, 28.1) so no two are identical. "
        "Consider semantic_score, skill_fit_score, dilly_fit_score as inputs, but apply your judgment: "
        "someone with weak evidence for key skills should score lower; someone with proven depth should score higher.\n\n"
        "Return strict JSON: an array of objects, one per candidate, each with: "
        "candidate_id (string), rerank_score (0-100 number, one decimal, UNIQUE per candidate), "
        "fit_level (string), rerank_reason (one sentence, <=200 chars). "
        "Higher score = better fit for THIS role."
    )
    user = json.dumps(
        {
            "job_description": role_description.strip()[:2400],
            "candidates": cards,
        },
        ensure_ascii=False,
    )
    # ~80 tokens per candidate (candidate_id, score, fit_level, reason)
    max_tokens = min(8000, max(2000, len(candidates) * 100))
    out = get_chat_completion(system, user, max_tokens=max_tokens, temperature=0.1)
    if not out or not out.strip():
        return []
    try:
        raw = out.strip()
        for start in ("```json", "```"):
            if start in raw:
                raw = raw.split(start, 1)[-1].split("```", 1)[0].strip()
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        by_id: dict[str, dict[str, Any]] = {}
        for item in data:
            if not isinstance(item, dict):
                continue
            cid = str(item.get("candidate_id") or "").strip()
            if not cid:
                continue
            try:
                score = float(item.get("rerank_score"))
            except Exception:
                continue
            score = max(0.0, min(100.0, score))
            reason = str(item.get("rerank_reason") or "").strip()
            if len(reason) > 220:
                reason = reason[:220]
            fit_level = str(item.get("fit_level") or "").strip()
            _VALID_FIT_LEVELS = {"Standout", "Strong fit", "Moderate fit", "Developing"}
            if fit_level not in _VALID_FIT_LEVELS:
                fit_level = ""
            by_id[cid] = {
                "candidate_id": cid,
                "rerank_score": round(score, 2),
                "rerank_reason": reason,
                "fit_level": fit_level,
            }

        # Preserve input order for items we can't map
        payload: list[dict[str, Any]] = []
        for cid in ids:
            if cid in by_id:
                payload.append(by_id[cid])
        if payload:
            _cache_set(cache_key, payload)
        return payload
    except Exception:
        return []

def _cosine_sim(a: list[float], b: list[float]) -> float:
    """Cosine similarity in [0, 1] (assuming non-negative embeddings). Clamp to [0, 1] for score."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a * norm_b <= 0:
        return 0.0
    sim = dot / (norm_a * norm_b)
    return max(0.0, min(1.0, (sim + 1) / 2))  # map [-1,1] -> [0,1] for typical embeddings


def _semantic_score(cos_sim: float) -> float:
    """Map cosine similarity to 0–100 semantic_score."""
    return round(50 + 50 * cos_sim, 2)


def _canon_tag(s: str) -> str:
    s = (s or "").strip().lower()
    s = s.replace("&", " and ")
    s = " ".join(s.split())
    return s

_TAG_ALIASES: dict[str, set[str]] = {
    "machine learning": {"ml", "machine learning", "ai", "artificial intelligence"},
    "data analysis": {"data analysis", "analytics", "data analytics"},
    "javascript": {"javascript", "js"},
}

_STRONG_EVIDENCE_WORDS = (
    # Action verbs only -- no nouns/adjectives that can appear in weak contexts
    "built", "engineered", "engineering", "trained", "deployed", "shipped",
    "implemented", "implementing", "developed", "developing", "launched",
    "managed", "managing", "created", "creating", "designed", "designing",
    "led", "leading", "automated", "automating", "optimized", "optimizing",
    "analyzed", "analyzing", "modeled", "modeling", "published", "presented",
    "coordinated", "coordinating",
    "processed", "processing", "maintained", "maintaining",
    "leveraged", "leveraging", "spearheaded", "spearheading",
    "directed", "directing", "architected", "architecting",
    "programmed", "programming", "executed", "executing",
    "integrated", "integrating", "configured", "configuring",
    "scaled", "scaling", "reduced", "reducing", "increased", "increasing",
    "improved", "improving", "oversaw", "overseeing", "supervised", "supervising",
    "founded", "co-founded", "facilitated", "facilitating",
    "delivered", "delivering", "secured", "securing",
    "negotiated", "negotiating", "researched", "researching",
    "prototyped", "prototyping", "refactored", "refactoring",
    "migrated", "migrating", "orchestrated", "orchestrating",
    "resolved", "resolving", "diagnosed", "diagnosing",
    "contributed", "contributing", "constructed", "constructing",
)
_WEAK_EVIDENCE_WORDS = (
    "learning", "currently learning", "familiar", "exposure", "interest in",
    "basic", "beginner", "introductory", "coursework",
    "studying", "enrolled", "intro to", "introduction to", "certificate in",
    "online course", "tutorial", "workshop", "audit course", "exploring",
)
import re as _re
_STRONG_RE = _re.compile(
    r"\b(?:" + "|".join(_re.escape(w) for w in _STRONG_EVIDENCE_WORDS) + r")\b",
    _re.IGNORECASE,
)
_WEAK_RE = _re.compile(
    r"\b(?:" + "|".join(_re.escape(w) for w in _WEAK_EVIDENCE_WORDS) + r")\b",
    _re.IGNORECASE,
)


def _tag_evidence_quality(tag: str, tag_evidence: dict[str, list[str]] | None) -> float:
    """
    Score 0.0–1.0 for how strongly the evidence supports a single tag.
    0.0 = tag not present or no evidence at all.
    0.15 = weak evidence only (learning/familiar/coursework).
    0.45 = neutral (tag present, evidence exists but no strong/weak signals).
    0.65 = medium (LLM-assessed medium confidence).
    1.0 = strong evidence (built/engineered/trained/deployed).

    Per-snippet evaluation: if a snippet contains BOTH strong and weak signals
    (e.g. "currently learning...predictive modeling"), weak wins because the
    candidate is describing what they're learning, not what they built.
    The final score is the best (max) across all snippets.

    Supports LLM-extracted evidence prefixed with [high], [medium], [low].
    """
    if not tag_evidence or not isinstance(tag_evidence, dict):
        return 0.45
    snippets = tag_evidence.get(tag) or []
    if not snippets:
        return 0.45

    # Evaluate each snippet independently; take the best score.
    # Use None as sentinel so we can distinguish "no signals found" from "weak".
    best: float | None = None
    for s in snippets[:4]:
        s_str = str(s)
        if s_str.startswith("[high]"):
            return 1.0
        if s_str.startswith("[medium]"):
            best = max(best or 0.0, 0.65)
            continue
        if s_str.startswith("[low]"):
            best = max(best or 0.0, 0.30)
            continue

        s_strong = bool(_STRONG_RE.search(s_str))
        s_weak = bool(_WEAK_RE.search(s_str))

        if s_strong and s_weak:
            best = max(best or 0.0, 0.30)
        elif s_strong:
            return 1.0
        elif s_weak:
            best = max(best or 0.0, 0.15)

    if best is not None:
        return best
    return 0.45


def _skill_fit_score(
    role_skills: list[str],
    candidate_tags: list[str],
    tag_evidence: dict[str, list[str]] | None = None,
) -> float:
    """
    Evidence-weighted overlap score 0–100.
    Each role skill matched in candidate tags is weighted by evidence quality (0.0–1.0).
    A "currently learning Python" match counts ~15% of a full hit;
    "engineered predictive engine" counts 100%.
    """
    if not role_skills:
        return 50.0

    cand = {_canon_tag(t) for t in (candidate_tags or []) if t and str(t).strip()}
    if not cand:
        return 0.0

    # Build reverse map: canonical_lower -> original tag name (for evidence lookup)
    cand_original: dict[str, str] = {}
    for t in (candidate_tags or []):
        c = _canon_tag(t)
        if c and c not in cand_original:
            cand_original[c] = str(t).strip()

    total_quality = 0.0
    for s in role_skills:
        r = _canon_tag(s)
        acceptable = _TAG_ALIASES.get(r, {r})
        matched_canon = None
        for a in acceptable:
            if a in cand:
                matched_canon = a
                break
        if matched_canon is None:
            continue
        original_tag = cand_original.get(matched_canon, s.strip())
        quality = _tag_evidence_quality(original_tag, tag_evidence)
        total_quality += quality

    return round(100 * total_quality / max(1, len(role_skills)), 1)


# Role-description keywords -> candidate skill tags we care about for skill_fit.
# When the recruiter doesn't provide required_skills, we derive from role text.
_ROLE_CODING_PHRASES = ("code", "coding", "programmer", "programming", "developer", "software", "technical", "engineer", "python", "java", "javascript", "sql")
_ROLE_CODING_TAGS = ["Python", "Java", "JavaScript", "SQL", "Data analysis"]
_ROLE_AI_ML_PHRASES = ("ai", "machine learning", "ml", "neural", "deep learning", "model", "models", "llm", "nlp", "computer vision")
# Option B: only this counts as satisfying "code AI models" (Research was over-matching Pre-Law etc.)
_ROLE_AI_ML_TAGS = ["Machine learning"]
_ROLE_LEADERSHIP_PHRASES = ("lead", "leader", "leadership", "manage", "management", "team lead", "head", "direct")
_ROLE_LEADERSHIP_TAGS = ["Leadership"]
_ROLE_VOLUNTEER_PHRASES = ("volunteer", "volunteering", "community service")
_ROLE_VOLUNTEER_TAGS = ["Volunteer"]

def _extract_role_skill_spec(role_description: str) -> dict[str, list[str]]:
    """
    Extract role skill spec from text.
    Returns {must_have: [...], nice_to_have: [...]} using controlled vocab.
    """
    if not role_description or not role_description.strip():
        return {"must_have": [], "nice_to_have": []}
    text = role_description.lower().strip()

    must: list[str] = []
    nice: list[str] = []

    # Controlled vocab / phrases → canonical tags
    vocab: list[tuple[tuple[str, ...], str, str]] = [
        (("machine learning", "ml", "deep learning", "neural", "computer vision", "nlp", "llm", "rag", "genai"), "Machine learning", "must"),
        (("python",), "Python", "must"),
        (("java script", "javascript", "js"), "JavaScript", "must"),
        (("sql",), "SQL", "must"),
        (("leadership", "team lead", "manage", "management", "lead "), "Leadership", "nice"),
        (("volunteer", "community service"), "Volunteer", "nice"),
        (("data analysis", "analytics", "data analytics"), "Data analysis", "nice"),
    ]

    for phrases, tag, tier in vocab:
        if any(p in text for p in phrases):
            (must if tier == "must" else nice).append(tag)

    # Back-compat heuristics (keep existing behavior as fallback)
    if any(p in text for p in _ROLE_LEADERSHIP_PHRASES):
        nice.extend(_ROLE_LEADERSHIP_TAGS)
    if any(p in text for p in _ROLE_VOLUNTEER_PHRASES):
        nice.extend(_ROLE_VOLUNTEER_TAGS)
    if any(p in text for p in _ROLE_AI_ML_PHRASES):
        must.extend(_ROLE_AI_ML_TAGS)
    elif any(p in text for p in _ROLE_CODING_PHRASES):
        nice.extend(_ROLE_CODING_TAGS)

    # Dedupe while preserving order, and ensure must_have dominates nice_to_have
    def _dedupe(xs: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for x in xs:
            if x and x not in seen:
                seen.add(x)
                out.append(x)
        return out

    must = _dedupe(must)
    nice = [x for x in _dedupe(nice) if x not in set(must)]
    return {"must_have": must, "nice_to_have": nice}


def _llm_extract_jd_tags(role_description: str) -> dict[str, list[str]]:
    """
    Use LLM to extract must/nice tags from role_description into our canonical ontology.
    Extraction-only: output must be strict JSON with canonical tag strings.
    Returns {"must_have": [...], "nice_to_have": [...]} or empty lists on failure.
    """
    role_description = (role_description or "").strip()
    if not role_description:
        return {"must_have": [], "nice_to_have": []}
    try:
        from dilly_core.llm_client import get_chat_completion
        from dilly_core.tag_ontology import all_vocab
    except Exception:
        return {"must_have": [], "nice_to_have": []}
    if not (os.environ.get("OPENAI_API_KEY") or "").strip():
        return {"must_have": [], "nice_to_have": []}

    canon = sorted(set(all_vocab().values()))
    system = (
        "You extract job requirements into Dilly canonical tags.\n"
        "Return ONLY strict JSON: {\"must_have\": [..], \"nice_to_have\": [..]}.\n"
        "Rules:\n"
        "- Tags MUST be chosen from the provided canonical list only.\n"
        "- must_have = true requirements (if missing, candidate likely not a fit).\n"
        "- nice_to_have = helpful but not required.\n"
        "- Keep lists short: must_have 2-6, nice_to_have 0-8.\n"
    )
    user = json.dumps(
        {
            "canonical_tags": canon,
            "job_description": role_description[:2400],
        },
        ensure_ascii=False,
    )
    out = get_chat_completion(system, user, max_tokens=500, temperature=0.0)
    if not out or not out.strip():
        return {"must_have": [], "nice_to_have": []}
    try:
        raw = out.strip()
        for start in ("```json", "```"):
            if start in raw:
                raw = raw.split(start, 1)[-1].split("```", 1)[0].strip()
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {"must_have": [], "nice_to_have": []}
        must = data.get("must_have") if isinstance(data.get("must_have"), list) else []
        nice = data.get("nice_to_have") if isinstance(data.get("nice_to_have"), list) else []
        canon_set = set(canon)
        must_clean = [str(x).strip() for x in must if str(x).strip() in canon_set]
        nice_clean = [str(x).strip() for x in nice if str(x).strip() in canon_set]
        # dedupe and ensure no overlap
        must_out = []
        seen = set()
        for t in must_clean:
            if t not in seen:
                seen.add(t)
                must_out.append(t)
        nice_out = []
        for t in nice_clean:
            if t in seen:
                continue
            if t not in nice_out:
                nice_out.append(t)
        return {"must_have": must_out[:6], "nice_to_have": nice_out[:8]}
    except Exception:
        return {"must_have": [], "nice_to_have": []}


def _postprocess_role_spec(role_description: str, spec: dict[str, list[str]]) -> dict[str, list[str]]:
    """
    Deterministic post-processing to prevent under-specified must-haves for certain prompts.
    Example: "build an AI model" should almost always require Python in addition to ML.
    """
    role_description = (role_description or "").strip().lower()
    must = [str(x).strip() for x in (spec.get("must_have") or []) if str(x).strip()]
    nice = [str(x).strip() for x in (spec.get("nice_to_have") or []) if str(x).strip()]
    must_set = set(must)

    import re as _re
    # If role asks to build/train an AI/ML model, ensure Python is a must-have.
    _has_ai = bool(_re.search(r"\bai\b", role_description) or "machine learning" in role_description or _re.search(r"\bml\b", role_description))
    _has_build = bool(_re.search(r"\b(build|train|model|predict|predictive|develop|engineer)\b", role_description))
    if _has_ai and _has_build:
        if "Machine learning" in must_set and "Python" not in must_set:
            if "Python" in nice:
                nice = [x for x in nice if x != "Python"]
            must.append("Python")
            must_set.add("Python")

    # dedupe, keep order, enforce no overlap
    out_must = []
    seen = set()
    for t in must:
        if t not in seen:
            seen.add(t)
            out_must.append(t)
    out_nice = []
    for t in nice:
        if t in seen:
            continue
        if t not in out_nice:
            out_nice.append(t)
    return {"must_have": out_must[:6], "nice_to_have": out_nice[:8]}


def _must_have_quality_score(
    must_have_tags: list[str],
    candidate_tags: list[str],
    tag_evidence: dict[str, list[str]] | None,
) -> float:
    """
    0–100 score: quality-weighted coverage of must-have tags.
    Incorporates both tag presence AND evidence quality.
    A weak-evidence match on all must-haves scores LOWER than a strong-evidence match on some.
    """
    mh = [str(t).strip() for t in (must_have_tags or []) if str(t).strip()]
    if not mh:
        return 100.0
    cand_set = {_canon_tag(t) for t in (candidate_tags or []) if t}
    cand_original: dict[str, str] = {}
    for t in (candidate_tags or []):
        c = _canon_tag(t)
        if c and c not in cand_original:
            cand_original[c] = str(t).strip()

    total = 0.0
    for tag in mh:
        r = _canon_tag(tag)
        acceptable = _TAG_ALIASES.get(r, {r})
        matched_canon = None
        for a in acceptable:
            if a in cand_set:
                matched_canon = a
                break
        if matched_canon is None:
            total += 0.0
            continue
        original_tag = cand_original.get(matched_canon, tag)
        quality = _tag_evidence_quality(original_tag, tag_evidence)
        total += quality
    return round(100 * total / max(1, len(mh)), 1)


def _extract_role_skills_from_description(role_description: str) -> list[str]:
    """Derive required skills from role text so skill_fit rewards the right candidates."""
    spec = _extract_role_skill_spec(role_description)
    return spec["must_have"] + spec["nice_to_have"]


def _dilly_fit_score(
    candidate_smart: float,
    candidate_grit: float,
    candidate_build: float,
    min_smart: int | None,
    min_grit: int | None,
    min_build: int | None,
) -> float:
    """Score 0–100: how well candidate meets min score bars. If no mins, return 50 (neutral)."""
    if min_smart is None and min_grit is None and min_build is None:
        return 50.0
    parts = []
    if min_smart is not None:
        parts.append(100 if candidate_smart >= min_smart else max(0, 100 * candidate_smart / min_smart))
    if min_grit is not None:
        parts.append(100 if candidate_grit >= min_grit else max(0, 100 * candidate_grit / min_grit))
    if min_build is not None:
        parts.append(100 if candidate_build >= min_build else max(0, 100 * candidate_build / min_build))
    if not parts:
        return 50.0
    return round(sum(parts) / len(parts), 1)


def _compact_experience(entries: list[dict], max_entries: int = 5, max_bullets: int = 2) -> list[dict]:
    """Trim structured experience to a compact form for the reranker payload."""
    out = []
    for e in (entries or [])[:max_entries]:
        if not isinstance(e, dict):
            continue
        bullets = e.get("bullets") or []
        out.append({
            "company": (e.get("company") or "")[:80],
            "role": (e.get("role") or "")[:80],
            "bullets": [str(b)[:160] for b in bullets[:max_bullets] if b],
        })
    return out


def _top_pct_sort_key(field: str):
    """Lower top % = stronger vs peers; missing values sort last."""

    def _key(x: dict) -> tuple:
        v = x.get(field)
        try:
            fv = float(v) if v is not None else 999.0
        except (TypeError, ValueError):
            fv = 999.0
        if fv <= 0:
            fv = 999.0
        return (fv, x.get("email") or "")

    return _key


def _load_indexed_candidates_impl() -> list[dict[str, Any]]:
    """
    Internal: actual load from disk. Used by load_indexed_candidates (which adds caching).
    """
    from .audit_history import get_audits
    from .ats_score_history import get_ats_score_percentile, get_ats_scores
    from .peer_benchmark import get_peer_percentile_final, get_peer_percentiles
    from .profile_store import get_profile

    try:
        from .dilly_profile_txt import (
            get_dilly_profile_txt_content,
            parse_structured_experience_from_profile_txt,
        )
    except ImportError:
        get_dilly_profile_txt_content = None
        parse_structured_experience_from_profile_txt = None

    out = []
    if not os.path.isdir(_PROFILES_DIR):
        return out
    for uid in sorted(os.listdir(_PROFILES_DIR)):
        folder = os.path.join(_PROFILES_DIR, uid)
        profile_path = os.path.join(folder, _PROFILE_FILENAME)
        index_path = os.path.join(folder, _INDEX_FILENAME)
        if not os.path.isfile(profile_path) or not os.path.isfile(index_path):
            continue
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                prof = json.load(f)
        except Exception:
            continue
        email = (prof.get("email") or "").strip().lower()
        if not email:
            continue
        status = (prof.get("profileStatus") or "").strip().lower()
        if status != "active":
            continue
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                idx = json.load(f)
        except Exception:
            continue
        emb = idx.get("embedding")
        if not isinstance(emb, list) or len(emb) == 0:
            continue
        try:
            vec = [float(x) for x in emb]
        except (TypeError, ValueError):
            continue
        audits = get_audits(email)
        latest = audits[0] if audits else {}
        scores = latest.get("scores") or {}

        # Structured experience from profile_txt (compact)
        experience_highlights: list[dict] = []
        if parse_structured_experience_from_profile_txt and get_dilly_profile_txt_content:
            try:
                ptxt = get_dilly_profile_txt_content(email, max_chars=10000)
                if ptxt:
                    experience_highlights = _compact_experience(
                        parse_structured_experience_from_profile_txt(ptxt)
                    )
            except Exception:
                pass

        # Audit evidence: smart/grit/build quotes (truncated)
        raw_ev = latest.get("evidence_quotes") or latest.get("evidence") or {}
        audit_evidence = {}
        if isinstance(raw_ev, dict):
            for k, v in raw_ev.items():
                if v and isinstance(v, str):
                    audit_evidence[k] = v[:200]

        tr = (latest.get("detected_track") or prof.get("track") or "").strip() or "Humanities"
        scores_dict = {
            "smart": float(scores.get("smart") or 0),
            "grit": float(scores.get("grit") or 0),
            "build": float(scores.get("build") or 0),
        }
        pp, _, _ = get_peer_percentiles(tr, scores_dict)
        peer_percentiles_out = pp
        top_pct_sgb = None
        if pp:
            tops = [max(1, min(100, 100 - int(pp[k]))) for k in ("smart", "grit", "build")]
            if len(tops) == 3:
                top_pct_sgb = round(sum(tops) / 3.0, 1)

        fs = float(latest.get("final_score") or 0)
        fpct, _, _ = get_peer_percentile_final(tr, fs)
        top_pct_final = None
        if fpct is not None:
            top_pct_final = float(max(1, min(100, 100 - int(fpct))))

        top_pct_ats = None
        ats_entries = get_ats_scores(email)
        if ats_entries and isinstance(ats_entries, list) and ats_entries and isinstance(ats_entries[0], dict):
            raw_ats = ats_entries[0].get("score")
            if raw_ats is not None:
                try:
                    ap = get_ats_score_percentile(int(round(float(raw_ats))))
                    if ap is not None:
                        top_pct_ats = float(max(1, min(100, 100 - int(ap))))
                except (TypeError, ValueError):
                    pass

        general_parts = [x for x in (top_pct_sgb, top_pct_final, top_pct_ats) if x is not None]
        top_pct_general = round(sum(general_parts) / len(general_parts), 1) if general_parts else None

        row = {
            "email": email,
            "candidate_id": uid,
            "embedding": vec,
            "skill_tags": [str(t) for t in (idx.get("skill_tags") or []) if t],
            "skill_tags_v2": [str(t) for t in (idx.get("skill_tags_v2") or []) if t] or [str(t) for t in (idx.get("skill_tags") or []) if t],
            "tag_evidence": idx.get("tag_evidence") if isinstance(idx.get("tag_evidence"), dict) else {},
            "major": (prof.get("major") or "").strip(),
            "majors": prof.get("majors") if isinstance(prof.get("majors"), list) else [],
            "minors": prof.get("minors") if isinstance(prof.get("minors"), list) else [],
            "school_id": (prof.get("school_id") or "").strip().lower(),
            "job_locations": prof.get("job_locations") if isinstance(prof.get("job_locations"), list) else [],
            "track": tr,
            "smart": scores_dict["smart"],
            "grit": scores_dict["grit"],
            "build": scores_dict["build"],
            "final_score": fs,
            "name": (prof.get("name") or "").strip(),
            "dilly_take": (latest.get("dilly_take") or latest.get("meridian_take") or "").strip()[:300],
            "audit_findings": [str(f)[:200] for f in (latest.get("audit_findings") or latest.get("findings") or [])[:5] if f],
            "audit_evidence": audit_evidence,
            "application_target": (prof.get("application_target") or latest.get("application_target") or "").strip(),
            "experience_highlights": experience_highlights,
            "peer_percentiles": peer_percentiles_out,
            "top_pct_sgb": top_pct_sgb,
            "top_pct_final": top_pct_final,
            "top_pct_ats": top_pct_ats,
            "top_pct_general": top_pct_general,
        }
        out.append(row)
    return out


def load_indexed_candidates() -> list[dict[str, Any]]:
    """
    Load all candidates from Dilly profiles only (memory/dilly_profiles).
    Cached for 5 minutes; invalidated when profiles dir mtime changes.
    """
    global _candidates_cache
    now = time.time()
    try:
        dir_mtime = os.path.getmtime(_PROFILES_DIR) if os.path.isdir(_PROFILES_DIR) else 0.0
    except OSError:
        dir_mtime = 0.0
    if _candidates_cache is not None:
        exp, cached_mtime, candidates = _candidates_cache
        if exp > now and cached_mtime == dir_mtime:
            return candidates
    candidates = _load_indexed_candidates_impl()
    _candidates_cache = (now + _CANDIDATES_CACHE_TTL_S, dir_mtime, candidates)
    return candidates


def search(
    role_description: str,
    filters: dict[str, Any] | None = None,
    sort: str = "match_score",
    limit: int = 50,
    offset: int = 0,
    required_skills: list[str] | None = None,
    min_smart: int | None = None,
    min_grit: int | None = None,
    min_build: int | None = None,
    *,
    skip_typo_correction: bool = False,
) -> dict[str, Any]:
    """
    Embed role, compute semantic + skill_fit + dilly_fit, filter, sort, paginate.
    Returns { "candidates": [...], "total": N }.
    Uses caches and parallelization for faster response.
    """
    filters = filters or {}
    role_trimmed = (role_description or "").strip()

    # Correct typos in JD; use corrected for search when it differs (unless skip_typo_correction)
    interpreted_as: str | None = None
    if role_trimmed and not skip_typo_correction:
        corrected = _correct_jd_typos(role_trimmed)
        if corrected and corrected.strip() and corrected.strip().lower() != role_trimmed.lower().strip():
            interpreted_as = corrected.strip()
            role_trimmed = interpreted_as

    def _fetch_embedding() -> list[float] | None:
        cached = _get_cached_embedding(role_trimmed)
        if cached is not None:
            return cached
        try:
            from dilly_core.embedding import get_embedding
            emb = get_embedding(role_trimmed or "")
            if emb:
                _set_cached_embedding(role_trimmed, emb)
            return emb
        except ImportError:
            return None

    def _fetch_role_spec() -> dict[str, list[str]]:
        if required_skills:
            return {"must_have": [str(s).strip() for s in required_skills if s and str(s).strip()], "nice_to_have": []}
        cached = _get_cached_role_spec(role_trimmed)
        if cached is not None:
            return cached
        spec = _llm_extract_jd_tags(role_trimmed)
        if not (spec.get("must_have") or spec.get("nice_to_have")):
            spec = _extract_role_skill_spec(role_trimmed)
        spec = _postprocess_role_spec(role_trimmed, spec)
        _set_cached_role_spec(role_trimmed, spec)
        return spec

    # Run embedding, role_spec, and candidate load in parallel
    with ThreadPoolExecutor(max_workers=3) as ex:
        fut_emb = ex.submit(_fetch_embedding)
        fut_spec = ex.submit(_fetch_role_spec)
        fut_cands = ex.submit(load_indexed_candidates)
        role_embedding = fut_emb.result()
        role_spec = fut_spec.result()
        candidates = fut_cands.result()

    if not role_embedding:
        return {"candidates": [], "total": 0}
    raw_major = filters.get("major")
    if isinstance(raw_major, list):
        filter_major = [str(m).strip().lower() for m in raw_major if m and str(m).strip()]
    elif raw_major:
        filter_major = [str(raw_major).strip().lower()]
    else:
        filter_major = []
    filter_track = (filters.get("track") or "").strip().lower()
    filter_school = (filters.get("school_id") or "").strip().lower()
    raw_cities = filters.get("cities")
    filter_cities = [str(x).strip().lower() for x in raw_cities] if isinstance(raw_cities, list) else []

    # Apply pre-filters (major, track, school, cities)
    def matches(c: dict) -> bool:
        if filter_major:
            c_major = (c.get("major") or "").strip().lower()
            c_majors = [str(m).strip().lower() for m in (c.get("majors") or []) if m]
            cand_majors = [c_major] + c_majors if c_major else c_majors
            if not cand_majors:
                return False
            if not any(m in filter_major for m in cand_majors):
                return False
        if filter_track and (c.get("track") or "").strip().lower() != filter_track:
            return False
        if filter_school and (c.get("school_id") or "").strip().lower() != filter_school:
            return False
        if filter_cities:
            fc_set = {str(x).strip().lower() for x in filter_cities}
            locs = [str(x).strip().lower() for x in (c.get("job_locations") or [])]
            if not any(loc in fc_set for loc in locs):
                return False
        return True

    filtered = [c for c in candidates if matches(c)]

    # Min score filters (hard cut)
    if min_smart is not None:
        filtered = [c for c in filtered if (c.get("smart") or 0) >= min_smart]
    if min_grit is not None:
        filtered = [c for c in filtered if (c.get("grit") or 0) >= min_grit]
    if min_build is not None:
        filtered = [c for c in filtered if (c.get("build") or 0) >= min_build]

    must_have = role_spec.get("must_have") or []
    nice_to_have = role_spec.get("nice_to_have") or []
    role_skills = must_have + nice_to_have

    # Weight tuning: when we have must-haves, we care more about skill_fit for top-10 precision.
    # Phase 2: blend feedback_score (shortlists + contacts - passes) into match.
    if must_have:
        w1, w2, w3, w4 = 0.40, 0.40, 0.14, 0.06
    elif role_skills:
        w1, w2, w3, w4 = 0.45, 0.32, 0.14, 0.09
    else:
        w1, w2, w3, w4 = 0.55, 0.18, 0.18, 0.09

    from .recruiter_feedback_store import get_feedback_scores
    feedback_scores = get_feedback_scores()

    scored = []
    for c in filtered:
        cos = _cosine_sim(role_embedding, c["embedding"])
        sem = _semantic_score(cos)
        cand_tags = c.get("skill_tags_v2") or c.get("skill_tags") or []
        tag_ev = c.get("tag_evidence") if isinstance(c.get("tag_evidence"), dict) else {}

        # Quality-weighted skill fit: each tag hit weighted by evidence strength
        skill = round(_skill_fit_score(role_skills, cand_tags, tag_ev), 2) if role_skills else 50.0

        # Must-have quality: how well does strong evidence back the critical requirements
        must_quality = _must_have_quality_score(must_have, cand_tags, tag_ev) if must_have else 100.0

        mer = _dilly_fit_score(
            c.get("smart") or 0, c.get("grit") or 0, c.get("build") or 0,
            min_smart, min_grit, min_build,
        )
        fb = feedback_scores.get(c.get("candidate_id") or "", 50.0)
        fb = max(0.0, min(100.0, float(fb)))
        fb = 35.0 + 0.3 * fb  # compress to [35,65]

        match_score = round(w1 * sem + w2 * skill + w3 * mer + w4 * fb, 2)

        # Must-have gating: quality-weighted must coverage drives penalties
        if must_have:
            if must_quality <= 0:
                match_score = round(match_score * 0.65, 2)
            elif must_quality < 25:
                match_score = round(match_score * 0.78, 2)
            elif must_quality < 50:
                match_score = round(match_score * 0.90, 2)
            elif must_quality >= 80:
                match_score = round(match_score * 1.05, 2)
        else:
            if role_skills and skill < 15:
                match_score = round(match_score * 0.90, 2)

        scored.append({
            **{k: v for k, v in c.items() if k != "embedding"},
            "match_score": match_score,
            "semantic_score": sem,
            "skill_fit_score": skill,
            "must_have_quality": round(must_quality, 1) if must_have else None,
            "must_have_tags": must_have,
            "nice_to_have_tags": nice_to_have,
            "dilly_fit_score": mer,
            "feedback_score": fb,
        })

    # Sort
    key_map = {
        "match_score": lambda x: (-(x.get("match_score") or 0), x.get("email") or ""),
        "smart": lambda x: (-(x.get("smart") or 0), x.get("email") or ""),
        "grit": lambda x: (-(x.get("grit") or 0), x.get("email") or ""),
        "build": lambda x: (-(x.get("build") or 0), x.get("email") or ""),
        "final_score": lambda x: (-(x.get("final_score") or 0), x.get("email") or ""),
        "major": lambda x: (x.get("major") or "", x.get("email") or ""),
        "school": lambda x: (x.get("school_id") or "", x.get("email") or ""),
        "top_pct_sgb": _top_pct_sort_key("top_pct_sgb"),
        "top_pct_final": _top_pct_sort_key("top_pct_final"),
        "top_pct_ats": _top_pct_sort_key("top_pct_ats"),
        "top_pct_general": _top_pct_sort_key("top_pct_general"),
    }
    sort_key = key_map.get(sort, key_map["match_score"])
    scored.sort(key=sort_key)

    total = len(scored)

    # --- Stage 2: LLM rerank for better precision ---
    # Only apply when sorting by match_score (otherwise respect requested sort).
    # Rerank all candidates so every card gets fit_level and rerank_reason from the AI.
    if sort == "match_score":
        top = scored
        reranked = _llm_rerank_candidates(role_trimmed, top)
        if reranked:
            by_id = {r["candidate_id"]: r for r in reranked if isinstance(r, dict) and r.get("candidate_id")}
            for row in top:
                cid = str(row.get("candidate_id") or "").strip()
                r = by_id.get(cid)
                if r:
                    row["rerank_score"] = r.get("rerank_score")
                    row["rerank_reason"] = r.get("rerank_reason")
                    row["fit_level"] = r.get("fit_level") or ""
                    if r.get("rerank_score") is not None:
                        rerank = round(float(r["rerank_score"]), 2)
                        orig = row.get("match_score") or 0
                        # Tie-breaker: if LLM returns same score for multiple candidates, blend in
                        # original algorithmic score so each gets a distinct displayed value
                        display = round(min(100.0, rerank + (orig % 1) * 0.5), 2)
                        row["match_score"] = display
                else:
                    # LLM didn't return this candidate — use dilly_take as fallback description
                    row["rerank_score"] = None
                    row["rerank_reason"] = (row.get("dilly_take") or row.get("meridian_take") or "").strip()[:200] or None
                    row["fit_level"] = None
            # Sort by match_score descending (highest first). For reranked candidates we've already
            # updated match_score to the display value; for non-reranked we keep the original.
            # Coerce to float to avoid string-sort issues (e.g. "65.8" vs "46.1").
            def _sort_key(x: dict) -> tuple:
                ms = x.get("match_score")
                try:
                    score = float(ms) if ms is not None else 0.0
                except (TypeError, ValueError):
                    score = 0.0
                return (-score, x.get("email") or "")
            scored.sort(key=_sort_key)
        else:
            # Ensure keys exist for UI consumers if desired
            for row in scored:
                row.setdefault("rerank_score", None)
                row.setdefault("rerank_reason", None)

    # Fallback: candidates not reranked (or without rerank_reason) get dilly_take as description
    for row in scored:
        if not row.get("rerank_reason"):
            take = (row.get("dilly_take") or row.get("meridian_take") or "").strip()[:200]
            if take:
                row["rerank_reason"] = take

    # Algo-based fallback: when dilly_take is also empty, use match_score for generic description
    for row in scored:
        if not row.get("rerank_reason"):
            ms = row.get("match_score") or 0
            if ms >= 55:
                row["rerank_reason"] = "Strong algorithmic match on role relevance and skills."
            elif ms >= 35:
                row["rerank_reason"] = "Moderate match; some relevant skills and experience."
            else:
                row["rerank_reason"] = "Limited match for this role based on current profile."
            if not row.get("fit_level"):
                row["fit_level"] = "Strong fit" if ms >= 55 else ("Moderate fit" if ms >= 35 else "Developing")

    # fit_level for candidates who got rerank_reason from dilly_take but LLM didn't return fit_level
    for row in scored:
        if row.get("rerank_reason") and not row.get("fit_level"):
            ms = row.get("match_score") or 0
            row["fit_level"] = "Strong fit" if ms >= 55 else ("Moderate fit" if ms >= 35 else "Developing")

    page = scored[offset : offset + limit]
    out: dict[str, Any] = {"candidates": page, "total": total}
    if interpreted_as:
        out["interpreted_as"] = interpreted_as
    return out


def _school_display_name(school_id: str) -> str:
    """Return human-readable school name from school_id."""
    sid = (school_id or "").strip().lower()
    if not sid:
        return ""
    try:
        from projects.dilly.api.schools import SCHOOLS
        s = SCHOOLS.get(sid)
        return (s.get("name") or school_id) if s else school_id
    except Exception:
        return school_id or ""


def find_similar_candidates(candidate_id: str, limit: int = 6, role_description: str | None = None) -> list[dict[str, Any]]:
    """
    Find candidates similar to the given one by embedding + scores.
    Returns list of {candidate_id, name, major, school, cohort, smart, grit, build, similarity_score[, match_score]}.
    When role_description is provided, also computes match_score (JD match) for each similar candidate.
    Excludes the target candidate.
    """
    candidate_id = (candidate_id or "").strip()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        return []
    limit = min(max(1, limit), 12)

    candidates = load_indexed_candidates()
    target = next((c for c in candidates if (c.get("candidate_id") or "").strip() == candidate_id), None)
    if not target or not target.get("embedding"):
        return []

    target_emb = target["embedding"]

    # When role_description provided, compute JD match scores (same logic as search)
    role_embedding: list[float] | None = None
    role_skills: list[str] = []
    must_have: list[str] = []
    w1, w2, w3, w4 = 0.55, 0.18, 0.18, 0.09
    feedback_scores: dict[str, float] = {}
    if (role_description or "").strip():
        try:
            from dilly_core.embedding import get_embedding
            role_embedding = get_embedding((role_description or "").strip())
        except ImportError:
            pass
        if role_embedding:
            role_spec = _llm_extract_jd_tags(role_description)
            if not (role_spec.get("must_have") or role_spec.get("nice_to_have")):
                role_spec = _extract_role_skill_spec(role_description)
            role_spec = _postprocess_role_spec(role_description, role_spec)
            must_have = role_spec.get("must_have") or []
            nice_to_have = role_spec.get("nice_to_have") or []
            role_skills = must_have + nice_to_have
            if must_have:
                w1, w2, w3, w4 = 0.40, 0.40, 0.14, 0.06
            elif role_skills:
                w1, w2, w3, w4 = 0.45, 0.32, 0.14, 0.09
            from .recruiter_feedback_store import get_feedback_scores
            feedback_scores = get_feedback_scores()

    scored: list[dict[str, Any]] = []
    for c in candidates:
        cid = (c.get("candidate_id") or "").strip()
        if cid == candidate_id:
            continue
        cos = _cosine_sim(target_emb, c.get("embedding") or [])
        # Blend embedding similarity with score similarity (Smart/Grit/Build)
        t_smart = target.get("smart") or 0
        t_grit = target.get("grit") or 0
        t_build = target.get("build") or 0
        c_smart = c.get("smart") or 0
        c_grit = c.get("grit") or 0
        c_build = c.get("build") or 0
        score_diff = abs(t_smart - c_smart) + abs(t_grit - c_grit) + abs(t_build - c_build)
        score_penalty = max(0, 1.0 - score_diff / 150.0)  # 150 total diff = 0 penalty
        sim = cos * 0.7 + score_penalty * 0.3
        major = (c.get("major") or "").strip()
        majors = c.get("majors") or []
        if majors and isinstance(majors, list):
            major = major or ", ".join(str(m) for m in majors if m)
        school_id = (c.get("school_id") or "").strip()
        school = _school_display_name(school_id) if school_id else ""
        cohort = (c.get("track") or "").strip()
        out: dict[str, Any] = {
            "candidate_id": cid,
            "name": (c.get("name") or "").strip() or "Candidate",
            "major": major,
            "school": school,
            "cohort": cohort,
            "smart": round(c_smart),
            "grit": round(c_grit),
            "build": round(c_build),
            "similarity_score": round(sim * 100, 1),
        }
        if role_embedding:
            cos = _cosine_sim(role_embedding, c.get("embedding") or [])
            sem = _semantic_score(cos)
            cand_tags = c.get("skill_tags_v2") or c.get("skill_tags") or []
            tag_ev = c.get("tag_evidence") if isinstance(c.get("tag_evidence"), dict) else {}
            skill = round(_skill_fit_score(role_skills, cand_tags, tag_ev), 2) if role_skills else 50.0
            mer = _dilly_fit_score(c_smart, c_grit, c.get("build") or 0, None, None, None)
            fb = feedback_scores.get(cid, 50.0)
            fb = max(0.0, min(100.0, float(fb)))
            fb = 35.0 + 0.3 * fb
            out["match_score"] = round(w1 * sem + w2 * skill + w3 * mer + w4 * fb, 2)
        scored.append(out)
    scored.sort(key=lambda x: -(x.get("similarity_score") or 0))
    return scored[:limit]
