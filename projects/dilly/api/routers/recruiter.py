"""
Recruiter API: semantic search and candidate detail. Auth via RECRUITER_API_KEY.
"""
import asyncio
import hashlib
import json
import os
import sys
import time

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse

from projects.dilly.api import deps
from projects.dilly.api.output_safety import REDIRECT_MESSAGE, sanitize_user_visible_assistant_text

# Workspace root for profile paths (api/routers/recruiter.py -> 4 levels up)
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

router = APIRouter(prefix="/recruiter", tags=["recruiter"])

# In-memory cache for candidate detail LLM results (why_fit, jd_evidence, experience ranking).
# Key = hash(candidate_id + role_description), TTL = 10 minutes.
_DETAIL_CACHE: dict[str, tuple[float, dict]] = {}
_DETAIL_CACHE_TTL = 600


def _detail_cache_key(candidate_id: str, role_description: str) -> str:
    raw = f"{candidate_id}|{role_description.strip()[:2400].lower()}"
    return hashlib.md5(raw.encode()).hexdigest()


def _detail_cache_get(key: str) -> dict | None:
    entry = _DETAIL_CACHE.get(key)
    if entry and (time.time() - entry[0]) < _DETAIL_CACHE_TTL:
        return entry[1]
    if entry:
        _DETAIL_CACHE.pop(key, None)
    return None


def _detail_cache_set(key: str, value: dict) -> None:
    if len(_DETAIL_CACHE) > 200:
        oldest = sorted(_DETAIL_CACHE, key=lambda k: _DETAIL_CACHE[k][0])[:100]
        for k in oldest:
            _DETAIL_CACHE.pop(k, None)
    _DETAIL_CACHE[key] = (time.time(), value)


@router.get("/check")
async def recruiter_check():
    """
    No auth. Returns whether RECRUITER_API_KEY is set on the server.
    Use this to debug: if recruiter_configured is false, add RECRUITER_API_KEY to .env and restart.
    If true but you still get 401, the key you paste in the UI must match that value exactly.
    """
    configured = bool((os.environ.get("RECRUITER_API_KEY") or "").strip())
    hint = None if configured else "Add RECRUITER_API_KEY to .env at workspace root (same folder as 'projects' and 'dilly_core'), then restart the API."
    return {"recruiter_configured": configured, "hint": hint}


@router.post("/search")
async def recruiter_search(request: Request, body: dict = Body(...)):
    """
    Semantic search for candidates by role description. Requires recruiter API key.
    Body: role_description, filters (major, school_id, cities, track, min_smart, min_grit, min_build),
    required_skills, sort, limit, offset.
    """
    deps.require_recruiter(request)
    role_description = (body.get("role_description") or "").strip()
    filters = body.get("filters") if isinstance(body.get("filters"), dict) else {}
    sort = (body.get("sort") or "match_score").strip()
    try:
        limit = min(max(1, int(body.get("limit", 50))), 100)
    except (TypeError, ValueError):
        limit = 50
    try:
        offset = max(0, int(body.get("offset", 0)))
    except (TypeError, ValueError):
        offset = 0
    required_skills = body.get("required_skills")
    if not isinstance(required_skills, list):
        required_skills = [s for s in (required_skills or "").split(",") if s.strip()] if required_skills else None
    min_smart = filters.get("min_smart")
    min_grit = filters.get("min_grit")
    min_build = filters.get("min_build")
    try:
        min_smart = int(min_smart) if min_smart is not None else None
    except (TypeError, ValueError):
        min_smart = None
    try:
        min_grit = int(min_grit) if min_grit is not None else None
    except (TypeError, ValueError):
        min_grit = None
    try:
        min_build = int(min_build) if min_build is not None else None
    except (TypeError, ValueError):
        min_build = None
    from projects.dilly.api.recruiter_search import search
    skip_typo_correction = bool(body.get("skip_typo_correction", False))
    result = search(
        role_description=role_description,
        filters=filters,
        sort=sort,
        limit=limit,
        offset=offset,
        required_skills=required_skills,
        min_smart=min_smart,
        min_grit=min_grit,
        min_build=min_build,
        skip_typo_correction=skip_typo_correction,
    )
    return result


@router.post("/typo-feedback")
async def recruiter_typo_feedback(request: Request, body: dict = Body(...)):
    """
    Record feedback on typo correction. Body: input (original JD), corrected (what Dilly showed),
    feedback ("correct" | "wrong"). When correct, Dilly takes note. When wrong, caller retries with skip_typo_correction.
    """
    deps.require_recruiter(request)
    input_text = (body.get("input") or "").strip()
    corrected = (body.get("corrected") or "").strip()
    feedback = (body.get("feedback") or "").strip().lower()
    if not input_text or not corrected:
        raise HTTPException(status_code=400, detail="input and corrected are required.")
    if feedback not in ("correct", "wrong"):
        raise HTTPException(status_code=400, detail="feedback must be 'correct' or 'wrong'.")
    from projects.dilly.api.recruiter_typo_feedback_store import append_typo_feedback
    if not append_typo_feedback(input_text, corrected, feedback):
        raise HTTPException(status_code=500, detail="Could not save feedback.")
    return {"ok": True}


@router.post("/jd-fit")
async def recruiter_jd_fit(request: Request, body: dict = Body(...)):
    """
    Infer Meridian score requirements from a job description (Smart/Grit/Build bars + track + signals).
    Requires recruiter API key. Body: job_description (required), job_title (optional).
    Returns smart_min, grit_min, build_min, min_final_score, track, signals, unavailable.
    Use these to pre-fill min filters when searching candidates.
    """
    deps.require_recruiter(request)
    jd = (body.get("job_description") or "").strip()
    title = body.get("job_title")
    if isinstance(title, str):
        title = title.strip() or None
    else:
        title = None
    if not jd:
        raise HTTPException(status_code=400, detail="job_description is required.")
    try:
        from dilly_core.jd_to_meridian_scores import jd_to_meridian_scores
        result = jd_to_meridian_scores(jd, job_title=title)
        return result
    except Exception:
        raise HTTPException(status_code=500, detail="Could not infer Dilly fit from job description.")


@router.post("/jd-fit-correction")
async def recruiter_jd_fit_correction(request: Request, body: dict = Body(...)):
    """
    Save a recruiter correction to JD fit bars. Used for feedback loop to improve accuracy.
    Body: job_description (required), job_title (optional), original_smart_min, original_grit_min,
    original_build_min, corrected_smart_min, corrected_grit_min, corrected_build_min, track (optional).
    """
    deps.require_recruiter(request)
    jd = (body.get("job_description") or "").strip()
    if not jd:
        raise HTTPException(status_code=400, detail="job_description is required.")
    title = body.get("job_title")
    if isinstance(title, str):
        title = title.strip() or None
    else:
        title = None
    try:
        orig_smart = int(body.get("original_smart_min", 0))
        orig_grit = int(body.get("original_grit_min", 0))
        orig_build = int(body.get("original_build_min", 0))
        corr_smart = int(body.get("corrected_smart_min", 0))
        corr_grit = int(body.get("corrected_grit_min", 0))
        corr_build = int(body.get("corrected_build_min", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="All bar values must be integers.")
    track = body.get("track")
    if isinstance(track, str):
        track = track.strip() or None
    else:
        track = None
    if not (0 <= orig_smart <= 100 and 0 <= orig_grit <= 100 and 0 <= orig_build <= 100):
        raise HTTPException(status_code=400, detail="Original bars must be 0–100.")
    if not (0 <= corr_smart <= 100 and 0 <= corr_grit <= 100 and 0 <= corr_build <= 100):
        raise HTTPException(status_code=400, detail="Corrected bars must be 0–100.")
    from projects.dilly.api.jd_fit_corrections_store import append_jd_fit_correction
    if not append_jd_fit_correction(
        job_description=jd,
        job_title=title,
        original_smart_min=orig_smart,
        original_grit_min=orig_grit,
        original_build_min=orig_build,
        corrected_smart_min=corr_smart,
        corrected_grit_min=corr_grit,
        corrected_build_min=corr_build,
        track=track,
    ):
        raise HTTPException(status_code=500, detail="Could not save correction.")
    return {"ok": True}


def _why_fit_bullets_for_role(profile_txt: str, role_description: str, fit_level: str = "") -> list[str]:
    """Generate 3 bullets on why this candidate fits the role, tone-matched to fit_level."""
    if not (profile_txt or "").strip() or not (role_description or "").strip():
        return []
    try:
        from dilly_core.llm_client import get_chat_completion
    except ImportError:
        return []
    if not os.environ.get("OPENAI_API_KEY"):
        return []

    fl = (fit_level or "").strip()
    if fl == "Standout":
        tone = (
            "This candidate is a STANDOUT fit — one of the best in the pool for this role. "
            "Write with strong conviction. Lead each bullet with their most impressive, directly relevant "
            "achievement. Use confident language ('exactly the profile', 'rare combination', 'proven track record'). "
            "Cite specific metrics, company names, and outcomes. Make it clear this person should be a top priority."
        )
    elif fl == "Strong fit":
        tone = (
            "This candidate is a strong fit for this role. "
            "Write with clear confidence. Cite specific experience and skills that directly match the JD. "
            "Use solid language ('well-positioned', 'demonstrated ability', 'directly relevant'). "
            "Name companies, projects, and concrete outcomes."
        )
    elif fl == "Moderate fit":
        tone = (
            "This candidate has some relevant experience but notable gaps for this role. "
            "Be honest and measured. Mention what IS relevant, but also acknowledge where experience "
            "is adjacent rather than direct. Use careful language ('some exposure to', 'foundational skills in', "
            "'could transfer'). Do not oversell."
        )
    elif fl == "Developing":
        tone = (
            "This candidate has limited direct experience for this role. "
            "Be candid. Mention any transferable skills or potential, but do not stretch thin evidence. "
            "Use honest language ('early-stage experience', 'currently developing', 'limited direct exposure'). "
            "If a bullet would be a reach, say so."
        )
    else:
        tone = (
            "Write balanced, evidence-based bullets. Cite specific experience, skills, or achievements "
            "from their profile. Be concise and recruiter-ready."
        )

    system = (
        "You are Meridian's recruiter-facing advisor. Given a candidate's Meridian profile and a "
        "job/role description, produce exactly 3 short bullets (one sentence each).\n\n"
        f"TONE INSTRUCTION: {tone}\n\n"
        "Each bullet must cite something specific from the candidate's profile. "
        "Never fabricate experience they don't have."
    )
    user = (
        f"Role description:\n{role_description.strip()[:2000]}\n\n"
        f"Candidate Meridian profile (excerpt):\n{profile_txt.strip()[:6000]}\n\n"
        "Respond with a JSON array of exactly 3 strings: [\"bullet 1\", \"bullet 2\", \"bullet 3\"]"
    )
    out = get_chat_completion(system, user, max_tokens=600, temperature=0.3)
    if not out or not out.strip():
        return []
    try:
        raw = out.strip()
        for start in ("```json", "```"):
            if start in raw:
                raw = raw.split(start, 1)[-1].split("```", 1)[0].strip()
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(b).strip()[:400] for b in data[:3] if b]
        return []
    except Exception:
        return []


def _why_bad_fit_bullets_for_role(profile_txt: str, role_description: str, jd_evidence_map: list[dict]) -> list[str]:
    """
    Generate 3 bullets on why this candidate is a bad fit for the role.
    Used when fit_level is Developing. Cites specific gaps, missing skills, weak evidence.
    """
    if not (profile_txt or "").strip() or not (role_description or "").strip():
        return []
    try:
        from dilly_core.llm_client import get_chat_completion
    except ImportError:
        return []
    if not os.environ.get("OPENAI_API_KEY"):
        return []

    red_items = [r for r in (jd_evidence_map or []) if r.get("status") == "red"]
    yellow_items = [r for r in (jd_evidence_map or []) if r.get("status") == "yellow"]
    gap_context = ""
    if red_items or yellow_items:
        parts = []
        if red_items:
            parts.append("Missing or weak on: " + "; ".join(r.get("requirement", "") for r in red_items[:5]))
        if yellow_items:
            parts.append("Partial/adjacent only: " + "; ".join(r.get("requirement", "") for r in yellow_items[:3]))
        gap_context = "\n\nGap analysis from JD mapping:\n" + "\n".join(parts)

    system = (
        "You are Meridian's recruiter-facing advisor. This candidate is a WEAK or POOR fit for the role. "
        "Produce exactly 3 short bullets (one sentence each) explaining WHY they are a bad fit.\n\n"
        "Be direct and specific. Cite what's missing, what's weak, or what doesn't align. "
        "Reference their profile — e.g. 'No evidence of X in their experience' or 'Experience at Y is tangential to the role's need for Z'. "
        "Never fabricate. Each bullet must be grounded in the profile or the gap analysis."
    )
    user = (
        f"Role description:\n{role_description.strip()[:2000]}\n\n"
        f"Candidate Meridian profile (excerpt):\n{profile_txt.strip()[:5000]}\n"
        f"{gap_context}\n\n"
        "Respond with a JSON array of exactly 3 strings: [\"bullet 1\", \"bullet 2\", \"bullet 3\"]"
    )
    out = get_chat_completion(system, user, max_tokens=600, temperature=0.3)
    if not out or not out.strip():
        return []
    try:
        raw = out.strip()
        for start in ("```json", "```"):
            if start in raw:
                raw = raw.split(start, 1)[-1].split("```", 1)[0].strip()
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(b).strip()[:400] for b in data[:3] if b]
        return []
    except Exception:
        return []


def _jd_to_evidence_map(profile_txt: str, role_description: str) -> list[dict]:
    """
    Return a compact JD-to-evidence map for recruiter scanning.
    Each item: {requirement, status: green|yellow|red, evidence: [..]}.
    """
    if not (profile_txt or "").strip() or not (role_description or "").strip():
        return []
    try:
        from dilly_core.llm_client import get_chat_completion
    except ImportError:
        return []
    if not os.environ.get("OPENAI_API_KEY"):
        return []
    system = """You are Meridian's recruiter-facing evaluator. You will map a job description to evidence in a candidate profile.\n\nOutput MUST be a JSON array (6 to 10 items). Each item MUST have:\n- requirement: short JD requirement (max 80 chars)\n- status: one of \"green\", \"yellow\", \"red\"\n- evidence: array of 1–2 short strings (each max 140 chars) citing specific experience/skills/metrics from the candidate profile.\n\nRules:\n- Prefer concrete requirements (skills, tools, responsibilities) over generic fluff.\n- green = strong direct evidence; yellow = partial/adjacent evidence; red = missing.\n- If red, evidence can be an empty array.\n- Be concise, recruiter-scannable.\n"""
    user = f"""Job description:\n{role_description.strip()[:2400]}\n\nCandidate Meridian profile (excerpt):\n{profile_txt.strip()[:6500]}\n\nReturn ONLY the JSON array."""
    out = get_chat_completion(system, user, max_tokens=900, temperature=0.2)
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
        cleaned: list[dict] = []
        for item in data[:10]:
            if not isinstance(item, dict):
                continue
            req_raw = str(item.get("requirement") or "").strip()[:160]
            req = _standardize_requirement_caps(req_raw)[:120]
            status = str(item.get("status") or "").strip().lower()
            if status not in ("green", "yellow", "red"):
                continue
            ev = item.get("evidence")
            if not isinstance(ev, list):
                ev = []
            evidence = [_standardize_acronyms_inline(str(x).strip())[:160] for x in ev if str(x).strip()]
            evidence = evidence[:2]
            if not req:
                continue
            cleaned.append({"requirement": req, "status": status, "evidence": evidence})
        return cleaned
    except Exception:
        return []


def _standardize_requirement_caps(text: str) -> str:
    """
    Standardize JD requirement capitalization for recruiter UI.
    Title Case with sensible exceptions (SQL/AWS/AI) + lowercase small words.
    """
    s = (text or "").strip()
    if not s:
        return ""
    s = s.rstrip(" .;:")
    small = {"and", "or", "to", "of", "in", "on", "for", "with", "at", "by", "from", "as", "via", "the", "a", "an"}
    acronyms = {
        "ai", "ml", "nlp", "sql", "etl", "api", "apis", "aws", "gcp", "azure", "saas", "bi", "crm", "erp",
        "kpi", "kpis", "okr", "okrs", "qa", "ui", "ux",
    }
    import re

    tokens = re.split(r"(\\s+|/|-)", s)  # keep separators
    out: list[str] = []
    word_index = 0
    for t in tokens:
        if not t or t.isspace() or t in {"/", "-"}:
            out.append(t)
            continue
        raw = t
        if any(ch.isdigit() for ch in raw) or any(ch in raw for ch in ["+", "#", "&"]):
            out.append(raw.upper() if raw.lower() in acronyms else raw)
            word_index += 1
            continue
        low = raw.lower()
        if low in acronyms:
            out.append(raw.upper())
        elif word_index > 0 and low in small:
            out.append(low)
        else:
            out.append(low[:1].upper() + low[1:])
        word_index += 1
    return "".join(out)


def _gap_summary_from_evidence(jd_evidence_map: list[dict]) -> str:
    """
    Build a one-line gap summary from jd_evidence_map: "Strong on X; weak on Y."
    """
    if not jd_evidence_map:
        return ""
    strong = [r["requirement"] for r in jd_evidence_map if r.get("status") == "green"]
    weak = [r["requirement"] for r in jd_evidence_map if r.get("status") == "red"]
    parts = []
    if strong:
        parts.append(f"Strong on {', '.join(strong[:3])}.")
    if weak:
        parts.append(f"Weak on {', '.join(weak[:3])}.")
    return " ".join(parts) if parts else ""


def _standardize_acronyms_inline(text: str) -> str:
    """
    Normalize common acronyms inside free-text evidence snippets (e.g., AI, ML, SQL, AWS).
    Only replaces whole-word matches, preserving the rest of the string.
    """
    s = (text or "").strip()
    if not s:
        return ""
    import re

    mapping = {
        "ai": "AI",
        "ml": "ML",
        "nlp": "NLP",
        "sql": "SQL",
        "etl": "ETL",
        "api": "API",
        "apis": "APIs",
        "aws": "AWS",
        "gcp": "GCP",
        "azure": "Azure",
        "saas": "SaaS",
        "bi": "BI",
        "crm": "CRM",
        "erp": "ERP",
        "kpi": "KPI",
        "kpis": "KPIs",
        "okr": "OKR",
        "okrs": "OKRs",
        "qa": "QA",
        "ui": "UI",
        "ux": "UX",
    }

    # Replace longer keys first (e.g., apis before api)
    for k in sorted(mapping.keys(), key=len, reverse=True):
        s = re.sub(rf"\\b{k}\\b", mapping[k], s, flags=re.IGNORECASE)
    return s


def _rank_structured_experience_for_role(structured_experience: list[dict], role_description: str) -> list[dict]:
    """
    Return structured experience reordered by relevance to the role, with optional matched_bullets.
    Output items: {entry_index, matched_bullets, relevance} for top entries; rest keep original order.
    """
    if not structured_experience or not (role_description or "").strip():
        return structured_experience or []
    try:
        from dilly_core.llm_client import get_chat_completion
    except ImportError:
        return structured_experience
    if not os.environ.get("OPENAI_API_KEY"):
        return structured_experience

    # Keep payload compact (avoid huge tokens)
    compact = []
    for idx, e in enumerate(structured_experience[:30]):
        compact.append({
            "entry_index": idx,
            "company": (e.get("company") or "")[:80],
            "role": (e.get("role") or "")[:80],
            "date": (e.get("date") or "")[:60],
            "bullets": [(b or "")[:160] for b in (e.get("bullets") or [])[:8]],
        })

    system = (
        "You are Meridian's recruiter assistant.\n"
        "Given a job description and a candidate's structured experience entries, "
        "rank the entries by relevance to the job.\n\n"
        "Return ONLY JSON with:\n"
        "{\n"
        "  \"ranking\": [\n"
        "    {\n"
        "      \"entry_index\": number,\n"
        "      \"relevance\": number,  // 0-100\n"
        "      \"matched_bullets\": [string, ...],  // 1-3 bullet snippets taken verbatim from that entry's bullets\n"
        "      \"fit_reason\": string  // One sentence (max 120 chars) explaining HOW this specific experience relates to the JD\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- Include 3 to 6 ranked entries max.\n"
        "- matched_bullets must be exact strings from the provided bullets.\n"
        "- fit_reason must be specific: name the skill, tool, or responsibility that overlaps with the JD.\n"
        "- Prefer entries with direct overlap to the JD responsibilities/tools.\n"
    )
    user = json.dumps({
        "job_description": role_description.strip()[:2400],
        "experience_entries": compact,
    })
    out = get_chat_completion(system, user, max_tokens=1100, temperature=0.2)
    if not out or not out.strip():
        return structured_experience
    try:
        raw = out.strip()
        for start in ("```json", "```"):
            if start in raw:
                raw = raw.split(start, 1)[-1].split("```", 1)[0].strip()
        data = json.loads(raw)
        ranking = data.get("ranking") if isinstance(data, dict) else None
        if not isinstance(ranking, list):
            return structured_experience
        top: list[dict] = []
        used = set()
        for r in ranking[:6]:
            if not isinstance(r, dict):
                continue
            try:
                idx = int(r.get("entry_index"))
            except Exception:
                continue
            if idx < 0 or idx >= len(structured_experience) or idx in used:
                continue
            used.add(idx)
            matched = r.get("matched_bullets")
            if not isinstance(matched, list):
                matched = []
            matched = [str(x).strip()[:200] for x in matched if str(x).strip()]
            rel = r.get("relevance")
            try:
                rel = max(0, min(100, int(rel)))
            except Exception:
                rel = 0
            fit_reason = str(r.get("fit_reason") or "").strip()[:150]
            entry = dict(structured_experience[idx])
            entry["relevance"] = rel
            entry["matched_bullets"] = matched[:3]
            if fit_reason:
                entry["fit_reason"] = fit_reason
            top.append(entry)

        # Append remaining entries in original order, without duplicates
        rest = []
        for i, e in enumerate(structured_experience):
            if i in used:
                continue
            rest.append(e)
        return top + rest
    except Exception:
        return structured_experience


@router.get("/candidates/batch")
async def recruiter_get_candidates_batch(request: Request, ids: str = ""):
    """Return minimal candidate info (candidate_id, name) for given ids. Query: ids=id1,id2,id3."""
    deps.require_recruiter(request)
    id_list = [x.strip() for x in (ids or "").split(",") if x.strip()]
    id_list = [x for x in id_list if len(x) == 16 and all(c in "0123456789abcdef" for c in x.lower())][:100]
    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
    out = []
    for cid in id_list:
        profile_path = os.path.join(profiles_dir, cid, "profile.json")
        if not os.path.isfile(profile_path):
            out.append({"candidate_id": cid, "name": None})
            continue
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                prof = json.load(f)
            name = (prof.get("name") or "").strip() or None
            out.append({"candidate_id": cid, "name": name})
        except Exception:
            out.append({"candidate_id": cid, "name": None})
    return {"candidates": out}


@router.get("/candidates/{candidate_id}")
async def recruiter_get_candidate(request: Request, candidate_id: str, role_description: str = "", fit_level: str = ""):
    """Return candidate detail for recruiter view. candidate_id is the 16-char profile uid. Optional role_description (JD they searched with) to get why_fit_bullets. Optional fit_level to adjust tone."""
    deps.require_recruiter(request)
    candidate_id = (candidate_id or "").strip()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
    profile_path = os.path.join(profiles_dir, candidate_id, "profile.json")
    if not os.path.isfile(profile_path):
        raise HTTPException(status_code=404, detail="Candidate not found.")
    try:
        with open(profile_path, "r", encoding="utf-8") as f:
            prof = json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not load candidate.")
    email = (prof.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.audit_history import get_audits
    from projects.dilly.api.dilly_profile_txt import (
        get_dilly_profile_txt_content,
        parse_structured_experience_from_profile_txt,
    )
    profile = get_profile(email) or prof
    audits = get_audits(email)
    latest = audits[0] if audits else {}
    scores = latest.get("scores") or {}
    profile_txt = get_dilly_profile_txt_content(email, max_chars=10000)
    structured_experience = parse_structured_experience_from_profile_txt(profile_txt) if profile_txt else []
    why_fit_bullets: list[str] = []
    why_bad_fit_bullets: list[str] = []
    jd_evidence_map: list[dict] = []
    role_trimmed = (role_description or "").strip()
    fit_level_trimmed = (fit_level or "").strip()
    if role_trimmed:
        ck = _detail_cache_key(candidate_id, role_trimmed + "|" + fit_level_trimmed)
        cached = _detail_cache_get(ck)
        if cached:
            why_fit_bullets = cached.get("why_fit_bullets") or []
            why_bad_fit_bullets = cached.get("why_bad_fit_bullets") or []
            jd_evidence_map = cached.get("jd_evidence_map") or []
            structured_experience = cached.get("structured_experience", structured_experience)
        else:
            loop = asyncio.get_event_loop()
            fut_evidence = loop.run_in_executor(None, _jd_to_evidence_map, profile_txt or "", role_trimmed)
            fut_ranked = loop.run_in_executor(None, _rank_structured_experience_for_role, structured_experience, role_trimmed)
            jd_evidence_map, structured_experience = await asyncio.gather(fut_evidence, fut_ranked)
            if fit_level_trimmed == "Developing":
                why_bad_fit_bullets = await loop.run_in_executor(
                    None, _why_bad_fit_bullets_for_role, profile_txt or "", role_trimmed, jd_evidence_map
                )
                why_fit_bullets = []
            else:
                why_fit_bullets = await loop.run_in_executor(
                    None, _why_fit_bullets_for_role, profile_txt or "", role_trimmed, fit_level_trimmed
                )
                why_bad_fit_bullets = []
            _detail_cache_set(ck, {
                "why_fit_bullets": why_fit_bullets,
                "why_bad_fit_bullets": why_bad_fit_bullets,
                "jd_evidence_map": jd_evidence_map,
                "structured_experience": structured_experience,
            })
    return {
        "candidate_id": candidate_id,
        "email": email,
        "name": (profile.get("name") or "").strip(),
        "major": (profile.get("major") or "").strip(),
        "majors": profile.get("majors") if isinstance(profile.get("majors"), list) else [],
        "school_id": (profile.get("school_id") or "").strip(),
        "cohort": (latest.get("detected_track") or profile.get("track") or "").strip(),
        "smart": scores.get("smart"),
        "grit": scores.get("grit"),
        "build": scores.get("build"),
        "final_score": latest.get("final_score"),
        "dilly_take": latest.get("dilly_take") or latest.get("meridian_take"),
        "application_target": profile.get("application_target") or latest.get("application_target"),
        "job_locations": profile.get("job_locations") if isinstance(profile.get("job_locations"), list) else [],
        "minors": [m for m in (profile.get("minors") or []) if isinstance(m, str) and m.strip() and m.strip().upper() not in ("N/A", "NA", "N", "A")],
        "structured_experience": structured_experience,
        "why_fit_bullets": why_fit_bullets,
        "why_bad_fit_bullets": why_bad_fit_bullets,
        "jd_evidence_map": jd_evidence_map,
        "jd_gap_summary": _gap_summary_from_evidence(jd_evidence_map),
        "pronouns": (profile.get("pronouns") or "").strip() or None,
        "linkedin_url": (profile.get("linkedin_url") or prof.get("linkedin_url") or "").strip() or None,
    }


# ---------------------------------------------------------------------------
# Ask AI (consultant-style recruiter assistant)
# ---------------------------------------------------------------------------

_ASK_AI_SYSTEM_PROMPT = (
    """You are an expert recruiter assistant for Meridian. Your job is to find evidence of high-performance traits in candidates. You must be EVIDENCE-BASED: only cite information that appears in the provided context. Never invent or assume facts.

Rules:
- If a student doesn't have a GitHub link for a project, look at their technical descriptions and Smart/Grit/Build evidence quotes to validate their logic and work ethic.
- Cite specific evidence when answering (e.g. "From their KVR Properties experience: '...'").
- If the context doesn't contain enough information to answer, say so clearly. Do not hallucinate.
- Be concise and recruiter-scannable. Use bullets when listing multiple points.
- Focus on Smart (analytical rigor, technical depth), Grit (persistence, ownership), and Build (shipping, impact) dimensions.

Formatting (use these in your responses; they render in the chat):
- **bold** for emphasis
- *italic* for subtle emphasis
- __underline__ for underlining
- ~~strikethrough~~ for crossed-out text
- [color]text[/color] for colored text (always bold). Colors: red, blue, green, yellow, orange, purple, pink, cyan, teal, gold, white, gray. Example: [green]Strong fit[/green]

Hard rule: Never output slurs, hate speech, or derogatory epithets targeting people or groups — not even when quoting the user or roleplaying. If asked to produce them, reply only with: """
    + REDIRECT_MESSAGE
)


def _build_ask_ai_context(
    profile_txt: str,
    evidence_quotes: dict,
    structured_experience: list,
    jd_evidence_map: list,
    role_description: str,
    name: str,
    smart: float | None,
    grit: float | None,
    build: float | None,
    dilly_take: str | None,
) -> str:
    """Build the context block injected into the Ask AI prompt."""
    parts = []
    parts.append("=== CANDIDATE PROFILE (Cleaned) ===")
    parts.append(profile_txt[:8000] if profile_txt else "(No profile on file)")
    parts.append("")
    parts.append("=== SMART / GRIT / BUILD EVIDENCE (verbatim from resume) ===")
    ev = evidence_quotes or {}
    for dim in ("smart", "grit", "build"):
        q = (ev.get(dim) or ev.get(dim.capitalize()) or "").strip()
        parts.append(f"{dim.upper()}: {q if q else '(no quote)'}")
    parts.append("")
    parts.append("=== SCORES ===")
    parts.append(f"Smart: {smart}, Grit: {grit}, Build: {build}")
    if dilly_take:
        parts.append(f"Dilly take: {dilly_take[:500]}")
    parts.append("")
    if structured_experience:
        parts.append("=== STRUCTURED EXPERIENCE (role-ranked) ===")
        for i, e in enumerate(structured_experience[:8], 1):
            role_str = f"{e.get('role', '')} · {e.get('company', '')}".strip(" ·")
            parts.append(f"{i}. {role_str}")
            if e.get("fit_reason"):
                parts.append(f"   Fit reason: {e['fit_reason']}")
            for b in (e.get("matched_bullets") or e.get("bullets") or [])[:3]:
                parts.append(f"   - {b}")
    if jd_evidence_map:
        parts.append("")
        parts.append("=== JD-TO-EVIDENCE MAP ===")
        for item in jd_evidence_map[:10]:
            status = item.get("status", "")
            req = item.get("requirement", "")
            ev_list = item.get("evidence") or []
            parts.append(f"[{status}] {req}")
            for ev_item in ev_list[:2]:
                parts.append(f"  → {ev_item}")
    if role_description:
        parts.append("")
        parts.append("=== ROLE DESCRIPTION (current search) ===")
        parts.append(role_description[:2000])
    return "\n".join(parts)


def _get_ask_ai_context_bundle(candidate_id: str, role_description: str) -> dict | None:
    """
    Load profile + audit context for Ask AI / compare follow-ups.
    Returns {"name": str, "context": str} or None if candidate missing.
    """
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.audit_history import get_audits
    from projects.dilly.api.dilly_profile_txt import (
        get_dilly_profile_txt_content,
        parse_structured_experience_from_profile_txt,
    )

    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
    profile_path = os.path.join(profiles_dir, candidate_id, "profile.json")
    if not os.path.isfile(profile_path):
        return None
    try:
        with open(profile_path, "r", encoding="utf-8") as f:
            prof = json.load(f)
    except Exception:
        return None
    email = (prof.get("email") or "").strip().lower()
    if not email:
        return None

    profile = get_profile(email) or prof
    audits = get_audits(email)
    latest = audits[0] if audits else {}
    scores = latest.get("scores") or {}
    profile_txt = get_dilly_profile_txt_content(email, max_chars=10000)
    structured_experience = parse_structured_experience_from_profile_txt(profile_txt) if profile_txt else []
    jd_evidence_map: list = []
    if role_description:
        jd_evidence_map = _jd_to_evidence_map(profile_txt or "", role_description)
        structured_experience = _rank_structured_experience_for_role(structured_experience, role_description)

    evidence_quotes = latest.get("evidence_quotes") or latest.get("evidence") or {}
    name = (profile.get("name") or prof.get("name") or "").strip() or "Candidate"
    smart = scores.get("smart")
    grit = scores.get("grit")
    build = scores.get("build")
    dilly_take = (latest.get("dilly_take") or latest.get("meridian_take") or "").strip()[:600] or None

    context = _build_ask_ai_context(
        profile_txt=profile_txt or "",
        evidence_quotes=evidence_quotes,
        structured_experience=structured_experience,
        jd_evidence_map=jd_evidence_map,
        role_description=role_description or "",
        name=name,
        smart=smart,
        grit=grit,
        build=build,
        dilly_take=dilly_take,
    )
    return {"name": name, "context": context}


def _stream_ask_ai(candidate_id: str, question: str, role_description: str):
    """Generator that yields SSE-formatted chunks from the LLM stream."""
    from dilly_core.llm_client import stream_chat_completion

    bundle = _get_ask_ai_context_bundle(candidate_id, role_description)
    if not bundle:
        profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
        profile_path = os.path.join(profiles_dir, candidate_id, "profile.json")
        if not os.path.isfile(profile_path):
            yield f"data: {json.dumps({'error': 'Candidate not found'})}\n\n"
        else:
            yield f"data: {json.dumps({'error': 'Could not load candidate'})}\n\n"
        return

    user_msg = f"Recruiter question about {bundle['name']}:\n\n{question.strip()}"
    system = f"{_ASK_AI_SYSTEM_PROMPT}\n\n{bundle['context']}"

    chunks: list[str] = []
    for chunk in stream_chat_completion(
        system=system,
        user=user_msg,
        model=os.environ.get("DILLY_LLM_MODEL") or "gpt-4o",
        max_tokens=2000,
        temperature=0.3,
    ):
        if chunk:
            chunks.append(chunk)
    full = sanitize_user_visible_assistant_text("".join(chunks))
    if full:
        yield f"data: {json.dumps({'text': full})}\n\n"
    yield "data: [DONE]\n\n"


def _stream_compare_ask_ai(
    candidate_id_a: str,
    candidate_id_b: str,
    question: str,
    role_description: str,
    comparison_summary: str = "",
):
    """SSE stream: follow-up questions for two candidates vs the same JD (Dilly Compare)."""
    from dilly_core.llm_client import stream_chat_completion

    ba = _get_ask_ai_context_bundle(candidate_id_a, role_description)
    bb = _get_ask_ai_context_bundle(candidate_id_b, role_description)
    if not ba:
        yield f"data: {json.dumps({'error': 'First candidate not found or could not be loaded.'})}\n\n"
        return
    if not bb:
        yield f"data: {json.dumps({'error': 'Second candidate not found or could not be loaded.'})}\n\n"
        return

    cs = (comparison_summary or "").strip()[:4000]
    blocks = [
        "The recruiter is comparing TWO candidates for the same role. Answer follow-up questions using both profiles below.",
        "Always name which candidate you mean. Contrast when helpful. Evidence-based only; do not invent facts.",
        "",
    ]
    if cs:
        blocks.extend([
            "=== PRIOR DILLY COMPARE OUTPUT (this pair, this role) ===",
            cs,
            "",
        ])
    blocks.extend([
        f"=== CANDIDATE A: {ba['name']} ===",
        ba["context"],
        "",
        f"=== CANDIDATE B: {bb['name']} ===",
        bb["context"],
    ])
    mega = "\n".join(blocks)
    user_msg = (
        f"Candidates being compared: {ba['name']} vs {bb['name']}.\n"
        f"Recruiter follow-up question:\n\n{question.strip()}"
    )
    system = f"{_ASK_AI_SYSTEM_PROMPT}\n\n{mega}"

    chunks: list[str] = []
    for chunk in stream_chat_completion(
        system=system,
        user=user_msg,
        model=os.environ.get("DILLY_LLM_MODEL") or "gpt-4o",
        max_tokens=2200,
        temperature=0.3,
    ):
        if chunk:
            chunks.append(chunk)
    full = sanitize_user_visible_assistant_text("".join(chunks))
    if full:
        yield f"data: {json.dumps({'text': full})}\n\n"
    yield "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# Voice Search (conversational candidate discovery)
# ---------------------------------------------------------------------------

def _parse_search_intent(query: str, conversation_history: list[dict] | None = None) -> dict:
    """
    Parse natural language query into search params.
    Returns { role_description, filters, limit, min_smart, min_grit, min_build }.
    Fallback: use raw query as role_description if parsing fails.
    If conversation_history is provided, treats query as a refinement (e.g. "narrow to CS majors").
    """
    query = (query or "").strip()
    if not query:
        return {"role_description": " ", "filters": {}, "limit": 5}

    try:
        from dilly_core.llm_client import get_chat_completion, get_light_model
    except ImportError:
        return {"role_description": query, "filters": {}, "limit": 5}
    if not os.environ.get("OPENAI_API_KEY"):
        return {"role_description": query, "filters": {}, "limit": 5}

    model = get_light_model()  # gpt-4o-mini for speed
    system = """You are Meridian's recruiter search parser. Extract search parameters from a natural language query.

Return ONLY valid JSON with these keys (no other text):
{
  "role_description": "string - expanded job/role description including any criteria mentioned (e.g. 'PM role requiring production experience and stakeholder communication')",
  "filters": {
    "major": ["cs", "computer science"] or null if not mentioned,
    "track": "Tech" or null,
    "school_id": "string" or null,
    "cities": ["new york", "remote"] or null
  },
  "limit": number between 3 and 15 (default 5),
  "min_smart": number or null,
  "min_grit": number or null,
  "min_build": number or null
}

Rules:
- role_description must capture ALL criteria: role type, skills, experience, soft skills. Expand abbreviations.
- If user says "find me 5 PM candidates who have shipped production code", role_description = "PM role requiring production code experience, shipped products"
- major: extract if mentioned (CS, computer science, engineering, etc.). Use lowercase.
- limit: extract number if given (e.g. "5 candidates" -> 5), else 5.
- min_smart/grit/build: only if user explicitly mentions score thresholds.
- If conversation_history is provided, the current query may be a REFINEMENT (e.g. "narrow to CS majors", "show me the one with strongest Build", "only Tech track"). Merge the previous context with the new request. Keep role_description from prior turn unless the user changes it."""

    history_str = ""
    if conversation_history:
        lines = []
        for msg in conversation_history[-6:]:  # last 6 messages
            role = msg.get("role", "")
            content = (msg.get("content") or "").strip()[:300]
            if content:
                lines.append(f"{role}: {content}")
        if lines:
            history_str = "\n\nPrevious messages:\n" + "\n".join(lines)

    user = f"Query: {query[:500]}{history_str}"
    out = get_chat_completion(system, user, model=model, max_tokens=600, temperature=0.1)
    if not out or not out.strip():
        return {"role_description": query, "filters": {}, "limit": 5}
    try:
        raw = out.strip()
        for start in ("```json", "```"):
            if start in raw:
                raw = raw.split(start, 1)[-1].split("```", 1)[0].strip()
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {"role_description": query, "filters": {}, "limit": 5}
        role = str(data.get("role_description") or query).strip() or query
        filters = data.get("filters")
        if not isinstance(filters, dict):
            filters = {}
        limit = data.get("limit")
        try:
            limit = min(max(3, int(limit)), 15) if limit is not None else 5
        except (TypeError, ValueError):
            limit = 5
        for key in ("min_smart", "min_grit", "min_build"):
            v = data.get(key)
            if v is not None:
                try:
                    filters[key] = int(v)
                except (TypeError, ValueError):
                    pass
        return {"role_description": role, "filters": filters, "limit": limit}
    except Exception:
        return {"role_description": query, "filters": {}, "limit": 5}


def _summarize_candidates_evidence(
    candidates: list[dict],
    role_description: str,
) -> dict[str, str]:
    """
    Batch LLM: for each candidate, generate 1-2 sentence evidence summary.
    Returns dict candidate_id -> evidence_summary.
    """
    if not candidates or not (role_description or "").strip():
        return {}
    try:
        from dilly_core.llm_client import get_chat_completion, get_light_model
        from projects.dilly.api.dilly_profile_txt import get_dilly_profile_txt_content
    except ImportError:
        return {}
    if not os.environ.get("OPENAI_API_KEY"):
        return {}

    # Build compact cards for LLM (name, scores, profile excerpt)
    cards = []
    for c in candidates[:5]:  # cap at 5 for speed
        cid = str(c.get("candidate_id") or "").strip()
        email = (c.get("email") or "").strip().lower()
        if not cid or not email:
            continue
        profile_txt = ""
        try:
            profile_txt = (get_dilly_profile_txt_content(email, max_chars=1200) or "").strip()
        except Exception:
            pass
        name = (c.get("name") or "").strip() or "Candidate"
        smart = c.get("smart") or 0
        grit = c.get("grit") or 0
        build = c.get("build") or 0
        match = c.get("match_score") or 0
        cards.append({
            "candidate_id": cid,
            "name": name,
            "smart": round(smart),
            "grit": round(grit),
            "build": round(build),
            "match_score": round(match, 1),
            "profile_excerpt": profile_txt[:500] if profile_txt else "(No profile)",
        })

    if not cards:
        return {}

    system = (
        "You are Meridian's recruiter assistant. For each candidate, write ONE sentence (max 25 words) "
        "explaining why they fit the role. Cite specific experience, skills, or achievements from their profile. "
        "Be evidence-based; never invent.\n\n"
        "Return ONLY a JSON object: { \"candidate_id\": \"evidence sentence\", ... }\n"
        "Use the exact candidate_id from each card. If you cannot find evidence, write \"Limited profile data.\""
    )

    user_parts = [f"Role: {role_description.strip()[:800]}", ""]
    for card in cards:
        user_parts.append(f"--- {card['name']} (id: {card['candidate_id']}, match: {card['match_score']}, S/G/B: {card['smart']}/{card['grit']}/{card['build']})")
        user_parts.append(card["profile_excerpt"])
        user_parts.append("")
    user = "\n".join(user_parts)

    out = get_chat_completion(system, user, model=get_light_model(), max_tokens=600, temperature=0.2)
    if not out or not out.strip():
        return {}
    try:
        raw = out.strip()
        for start in ("```json", "```"):
            if start in raw:
                raw = raw.split(start, 1)[-1].split("```", 1)[0].strip()
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {}
        return {
            str(k): sanitize_user_visible_assistant_text(str(v).strip())[:300]
            for k, v in data.items()
            if k and v
        }
    except Exception:
        return {}


def _run_voice_search_sync(query: str, conversation_history: list | None) -> dict:
    """Synchronous voice search logic. Returns { candidates, total, role_description }."""
    parsed = _parse_search_intent(query, conversation_history)
    role_description = parsed.get("role_description") or query
    filters = parsed.get("filters") or {}
    limit = parsed.get("limit", 5)
    min_smart = filters.get("min_smart")
    min_grit = filters.get("min_grit")
    min_build = filters.get("min_build")

    from projects.dilly.api.recruiter_search import search
    result = search(
        role_description=role_description,
        filters=filters,
        sort="match_score",
        limit=limit,
        offset=0,
        required_skills=None,
        min_smart=min_smart,
        min_grit=min_grit,
        min_build=min_build,
    )
    candidates = result.get("candidates") or []
    total = result.get("total") or 0

    evidence_map = _summarize_candidates_evidence(candidates, role_description)

    out_candidates = []
    for c in candidates:
        cid = str(c.get("candidate_id") or "").strip()
        evidence = evidence_map.get(cid, "")
        out_candidates.append({
            "candidate_id": cid,
            "name": (c.get("name") or "").strip() or "Candidate",
            "match_score": c.get("match_score"),
            "smart": c.get("smart"),
            "grit": c.get("grit"),
            "build": c.get("build"),
            "major": c.get("major"),
            "majors": c.get("majors"),
            "school_id": c.get("school_id"),
            "track": c.get("track"),
            "evidence_summary": evidence,
            "profile_link": f"/recruiter/candidates/{cid}",
        })

    return {
        "candidates": out_candidates,
        "total": total,
        "role_description": role_description,
    }


_VOICE_SEARCH_TIMEOUT_MS = 90_000  # 90s backend timeout


@router.post("/voice/search")
async def recruiter_voice_search(request: Request, body: dict = Body(...)):
    """
    Conversational candidate search. Natural language query -> ranked candidates with evidence.
    Body: query (required). Optional: role_description (pre-filled from search page), conversation_history.
    Returns { candidates: [...], total, role_description }.
    """
    deps.require_recruiter(request)
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required.")

    conversation_history = body.get("conversation_history")
    if conversation_history is not None and not isinstance(conversation_history, list):
        conversation_history = None

    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: _run_voice_search_sync(query, conversation_history)),
            timeout=_VOICE_SEARCH_TIMEOUT_MS / 1000.0,
        )
        return result
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Search timed out. The API may be slow. Try a simpler query or fewer candidates.",
        )


@router.post("/candidates/{candidate_id}/ask")
async def recruiter_ask_ai(request: Request, candidate_id: str, body: dict = Body(...)):
    """
    Ask AI about a candidate. Streams SSE response.
    Body: question (required), role_description (optional, for JD context).
    Requires recruiter API key.
    """
    deps.require_recruiter(request)
    candidate_id = (candidate_id or "").strip()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required.")
    role_description = (body.get("role_description") or "").strip()

    def gen():
        for chunk in _stream_ask_ai(candidate_id, question, role_description):
            yield chunk

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/compare/ask")
async def recruiter_compare_ask_ai(request: Request, body: dict = Body(...)):
    """
    Ask Dilly AI follow-up questions while comparing two candidates. Streams SSE.
    Body: candidate_ids (exactly 2), question (required), role_description (optional),
    comparison_summary (optional; prior Dilly Compare text for context).
    """
    deps.require_recruiter(request)
    ids = body.get("candidate_ids")
    if not isinstance(ids, list) or len(ids) != 2:
        raise HTTPException(status_code=400, detail="candidate_ids must be a list of exactly 2 IDs.")
    cid_a = (ids[0] or "").strip()
    cid_b = (ids[1] or "").strip()
    for cid, label in ((cid_a, "first"), (cid_b, "second")):
        if len(cid) != 16 or not all(c in "0123456789abcdef" for c in cid.lower()):
            raise HTTPException(status_code=400, detail=f"Invalid {label} candidate_id.")
    if cid_a == cid_b:
        raise HTTPException(status_code=400, detail="Cannot compare a candidate to themselves.")
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required.")
    role_description = (body.get("role_description") or "").strip()
    comparison_summary = (body.get("comparison_summary") or body.get("comparison") or "").strip()

    def gen():
        for chunk in _stream_compare_ask_ai(cid_a, cid_b, question, role_description, comparison_summary):
            yield chunk

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/company-advice")
async def recruiter_submit_company_advice(request: Request, body: dict = Body(...)):
    """
    Submit recruiter advice for a company. Shown to students on that company's page.
    Requires recruiter API key. Body: company_slug (e.g. stripe, figma, usajobs), text (advice text).
    """
    deps.require_recruiter(request)
    company_slug = (body.get("company_slug") or "").strip()
    text = (body.get("text") or "").strip()
    if not company_slug:
        raise HTTPException(status_code=400, detail="company_slug is required.")
    if not text:
        raise HTTPException(status_code=400, detail="text is required.")
    from projects.dilly.api.company_criteria import get_company_by_slug
    from projects.dilly.api.company_recruiter_advice import add_recruiter_advice
    if not get_company_by_slug(company_slug):
        raise HTTPException(status_code=400, detail="Unknown company slug. Use a slug from GET /companies.")
    if not add_recruiter_advice(company_slug, text, source="recruiter"):
        raise HTTPException(status_code=500, detail="Could not save advice.")
    return {"ok": True, "message": "Advice added. Students will see it on that company's page."}


@router.post("/feedback")
async def recruiter_submit_feedback(request: Request, body: dict = Body(...)):
    """
    Log recruiter feedback on a candidate (view, shortlist, pass, contact).
    Used for continuous learning / re-ranking. Requires recruiter API key.
    Body: candidate_id (16-char hex), event (view|shortlist|pass|contact), role_id_or_search_id (optional).
    """
    deps.require_recruiter(request)
    candidate_id = (body.get("candidate_id") or "").strip()
    event = (body.get("event") or "").strip().lower()
    role_id_or_search_id = (body.get("role_id_or_search_id") or "").strip() or None
    if not candidate_id:
        raise HTTPException(status_code=400, detail="candidate_id is required.")
    if not event:
        raise HTTPException(status_code=400, detail="event is required.")
    from projects.dilly.api.recruiter_feedback_store import append_feedback
    if not append_feedback(candidate_id, event, role_id_or_search_id):
        raise HTTPException(status_code=400, detail="Invalid candidate_id or event. Use: view, shortlist, pass, contact.")
    return {"ok": True, "message": "Feedback recorded."}


@router.post("/contact")
async def recruiter_contact_candidate(request: Request, body: dict = Body(...)):
    """
    Email relay outreach: recruiter sends a short intro message; Meridian emails the student with reply-to set to recruiter.
    Requires recruiter API key.

    Body: candidate_id (16-char hex), recruiter_email (required), recruiter_name (optional),
    company (optional), job_title (optional), message (required).
    """
    deps.require_recruiter(request)
    candidate_id = (body.get("candidate_id") or "").strip()
    recruiter_email = (body.get("recruiter_email") or "").strip().lower()
    recruiter_name = (body.get("recruiter_name") or "").strip()
    company = (body.get("company") or "").strip()
    job_title = (body.get("job_title") or "").strip()
    message = (body.get("message") or "").strip()

    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    if not recruiter_email or "@" not in recruiter_email or len(recruiter_email) > 180:
        raise HTTPException(status_code=400, detail="recruiter_email is required.")
    if not message:
        raise HTTPException(status_code=400, detail="message is required.")
    if len(message) < 80:
        raise HTTPException(status_code=400, detail="message is too short (min 80 chars).")
    if len(message) > 1500:
        raise HTTPException(status_code=400, detail="message is too long (max 1500 chars).")

    recruiter_name = recruiter_name[:120]
    company = company[:120]
    job_title = job_title[:120]

    from projects.dilly.api.recruiter_outreach_store import check_throttle, append_outreach
    allowed, reason = check_throttle(candidate_id=candidate_id, recruiter_email=recruiter_email)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason or "Rate limit exceeded.")

    # Resolve candidate_id -> student email (same source as recruiter_get_candidate)
    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
    profile_path = os.path.join(profiles_dir, candidate_id, "profile.json")
    if not os.path.isfile(profile_path):
        raise HTTPException(status_code=404, detail="Candidate not found.")
    try:
        with open(profile_path, "r", encoding="utf-8") as f:
            prof = json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not load candidate.")

    student_email = (prof.get("email") or "").strip().lower()
    if not student_email:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    # Name from profile store if available
    student_name = None
    try:
        from projects.dilly.api.profile_store import get_profile
        p = get_profile(student_email) or {}
        student_name = (p.get("name") or "").strip() or None
    except Exception:
        student_name = None

    ok = False
    err = None
    try:
        from projects.dilly.api.email_sender import send_recruiter_outreach_email
        ok = send_recruiter_outreach_email(
            to_email=student_email,
            student_name=student_name,
            recruiter_email=recruiter_email,
            recruiter_name=recruiter_name or None,
            company=company or None,
            job_title=job_title or None,
            message=message,
        )
        if not ok:
            err = "Email sending not configured or failed."
    except Exception:
        ok = False
        err = "Email send failed."

    append_outreach(
        candidate_id=candidate_id,
        candidate_email=student_email,
        recruiter_email=recruiter_email,
        recruiter_name=recruiter_name or None,
        company=company or None,
        job_title=job_title or None,
        message=message,
        status="sent" if ok else "failed",
        error=err,
    )

    if not ok:
        raise HTTPException(status_code=500, detail=err or "Could not send outreach email.")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Bookmarks & Collections
# ---------------------------------------------------------------------------

@router.get("/bookmarks")
async def recruiter_get_bookmarks(request: Request):
    """Return all bookmarks and collections for the recruiter."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    from projects.dilly.api.recruiter_bookmark_store import get_all
    return get_all(key)


@router.post("/bookmarks")
async def recruiter_add_bookmark(request: Request, body: dict = Body(...)):
    """Add candidate to general bookmarks. Body: candidate_id."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    candidate_id = (body.get("candidate_id") or "").strip()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    from projects.dilly.api.recruiter_bookmark_store import add_bookmark
    if not add_bookmark(key, candidate_id):
        raise HTTPException(status_code=500, detail="Could not add bookmark.")
    return {"ok": True}


@router.delete("/bookmarks/{candidate_id}")
async def recruiter_remove_bookmark(request: Request, candidate_id: str):
    """Remove candidate from general bookmarks."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    candidate_id = (candidate_id or "").strip()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    from projects.dilly.api.recruiter_bookmark_store import remove_bookmark
    remove_bookmark(key, candidate_id)
    return {"ok": True}


@router.post("/bookmarks/check")
async def recruiter_check_bookmark(request: Request, body: dict = Body(...)):
    """Check if candidate is bookmarked. Body: candidate_id. Returns { bookmarked: bool }."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    candidate_id = (body.get("candidate_id") or "").strip()
    from projects.dilly.api.recruiter_bookmark_store import is_bookmarked
    return {"bookmarked": is_bookmarked(key, candidate_id)}


@router.post("/collections")
async def recruiter_create_collection(request: Request, body: dict = Body(...)):
    """Create a named collection. Body: name."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required.")
    from projects.dilly.api.recruiter_bookmark_store import create_collection
    if not create_collection(key, name):
        raise HTTPException(status_code=400, detail="Invalid name or collection already exists.")
    return {"ok": True}


@router.post("/collections/add")
async def recruiter_add_to_collection(request: Request, body: dict = Body(...)):
    """Add candidate to a collection. Body: collection_name, candidate_id."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    collection_name = (body.get("collection_name") or "").strip()
    candidate_id = (body.get("candidate_id") or "").strip()
    if not collection_name:
        raise HTTPException(status_code=400, detail="collection_name is required.")
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    from projects.dilly.api.recruiter_bookmark_store import add_to_collection
    if not add_to_collection(key, collection_name, candidate_id):
        raise HTTPException(status_code=500, detail="Could not add to collection.")
    return {"ok": True}


@router.patch("/collections")
async def recruiter_rename_collection(request: Request, body: dict = Body(...)):
    """Rename a collection. Body: old_name, new_name."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    old_name = (body.get("old_name") or "").strip()
    new_name = (body.get("new_name") or "").strip()
    if not old_name or not new_name:
        raise HTTPException(status_code=400, detail="old_name and new_name are required.")
    if len(new_name) > 80:
        raise HTTPException(status_code=400, detail="Collection name must be 80 characters or less.")
    from projects.dilly.api.recruiter_bookmark_store import rename_collection
    if not rename_collection(key, old_name, new_name):
        raise HTTPException(status_code=400, detail="Could not rename. Collection may not exist or new name already in use.")
    return {"ok": True}


@router.post("/collections/remove")
async def recruiter_remove_from_collection(request: Request, body: dict = Body(...)):
    """Remove candidate from a collection. Body: collection_name, candidate_id."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    collection_name = (body.get("collection_name") or "").strip()
    candidate_id = (body.get("candidate_id") or "").strip()
    if not collection_name:
        raise HTTPException(status_code=400, detail="collection_name is required.")
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    from projects.dilly.api.recruiter_bookmark_store import remove_from_collection
    remove_from_collection(key, collection_name, candidate_id)
    return {"ok": True}


@router.delete("/collections")
async def recruiter_delete_collection(request: Request, name: str = ""):
    """Delete a collection. Query: name."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name query param is required.")
    from projects.dilly.api.recruiter_bookmark_store import delete_collection
    delete_collection(key, name)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Recruiter notes
# ---------------------------------------------------------------------------

@router.get("/notes/candidates")
async def recruiter_list_candidates_with_notes(request: Request):
    """List all candidate IDs this recruiter has notes for. Returns [{candidate_id, count}, ...]."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    from projects.dilly.api.recruiter_notes_store import list_candidates_with_notes
    return {"candidates": list_candidates_with_notes(key)}


@router.get("/candidates/{candidate_id}/notes")
async def recruiter_get_notes(request: Request, candidate_id: str):
    """Get recruiter note entries for a candidate. Returns entries: [{text, at}, ...]."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    candidate_id = (candidate_id or "").strip()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    from projects.dilly.api.recruiter_notes_store import get_entries
    return {"entries": get_entries(key, candidate_id)}


@router.post("/candidates/{candidate_id}/notes")
async def recruiter_add_note(request: Request, candidate_id: str, body: dict = Body(...)):
    """Add a recruiter note entry. Body: note (string). Returns the new entry."""
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    candidate_id = (candidate_id or "").strip()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    note = (body.get("note") or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="Note cannot be empty.")
    from projects.dilly.api.recruiter_notes_store import add_entry
    entry = add_entry(key, candidate_id, note)
    if not entry:
        raise HTTPException(status_code=500, detail="Could not save note.")
    return {"ok": True, "entry": entry}


# ---------------------------------------------------------------------------
# Compare candidates (why one is better for the JD)
# ---------------------------------------------------------------------------

def _compare_candidates_for_role(
    candidate_id_a: str,
    candidate_id_b: str,
    name_a: str,
    name_b: str,
    profile_txt_a: str,
    profile_txt_b: str,
    role_description: str,
    match_a: float,
    match_b: float,
    smart_a: float,
    smart_b: float,
    grit_a: float,
    grit_b: float,
    build_a: float,
    build_b: float,
    fit_level_a: str,
    fit_level_b: str,
    evidence_a: str = "",
    evidence_b: str = "",
    experience_a: str = "",
    experience_b: str = "",
) -> str:
    """Generate a personal, evidence-based comparison of why one candidate is better for the role. Returns plain text."""
    if not (role_description or "").strip():
        return "No role description provided. Run a search with a job description to get a comparison."
    try:
        from dilly_core.llm_client import get_chat_completion
    except ImportError:
        return "Comparison unavailable (LLM not configured)."
    if not os.environ.get("OPENAI_API_KEY"):
        return "Comparison unavailable (OPENAI_API_KEY not set)."

    system = (
        "You are Dilly's recruiter-facing advisor. Compare two candidates for a specific job/role. "
        "Be PERSONAL and SPECIFIC: use each candidate's name, cite concrete evidence from their resumes and experience. "
        "Never use generic statements. Every bullet must reference something specific from that person's profile—"
        "a company, role, project, metric, or achievement. Contrast them directly: e.g. 'While [Name A] has X, "
        "[Name B] demonstrates Y through their work at Z.'\n\n"
        "CRITICAL: Your conclusion MUST align with the algorithmic scores. The candidate with the higher match "
        "score and stronger fit level (Standout > Strong fit > Moderate fit > Developing) is the stronger fit. "
        "Explain WHY using evidence from BOTH profiles—what does the stronger candidate have that the other lacks, "
        "or do better? Be specific.\n\n"
        "OUTPUT FORMAT (strict):\n"
        "## Section Name\n"
        "- Bullet citing specific evidence from [Name A] or [Name B]'s resume\n"
        "- Contrast when relevant: 'X has... whereas Y has...'\n\n"
        "## Next Section\n"
        "- ...\n\n"
        "Use 4–6 sections. Suggested: Match Summary, Smart (Academics & Analytical Rigor), Grit (Resilience & Drive), "
        "Build (Execution & Impact), Key Differentiators, Recommendation. 2–4 bullets per section. "
        "End with a clear Recommendation that names the stronger candidate and why, citing 1–2 specific pieces of evidence."
    )
    profile_a = (profile_txt_a or "")[:4000]
    profile_b = (profile_txt_b or "")[:4000]
    user_parts = [
        f"Role description:\n{role_description.strip()[:2400]}\n\n",
        f"--- {name_a} ---\nMatch: {match_a:.1f}% | Smart: {smart_a:.0f} | Grit: {grit_a:.0f} | Build: {build_a:.0f} | Fit: {fit_level_a or '—'}\n",
        f"Profile:\n{profile_a}\n",
    ]
    if evidence_a.strip():
        user_parts.append(f"Evidence quotes (Smart/Grit/Build):\n{evidence_a[:1200]}\n")
    if experience_a.strip():
        user_parts.append(f"Structured experience:\n{experience_a[:1500]}\n")
    user_parts.append(f"\n--- {name_b} ---\nMatch: {match_b:.1f}% | Smart: {smart_b:.0f} | Grit: {grit_b:.0f} | Build: {build_b:.0f} | Fit: {fit_level_b or '—'}\n")
    user_parts.append(f"Profile:\n{profile_b}\n")
    if evidence_b.strip():
        user_parts.append(f"Evidence quotes (Smart/Grit/Build):\n{evidence_b[:1200]}\n")
    if experience_b.strip():
        user_parts.append(f"Structured experience:\n{experience_b[:1500]}\n")
    user_parts.append(
        "\nWrite a personal, specific comparison. Use both names. Cite concrete evidence from each resume. "
        "Conclusion must match the scores—explain why the higher-scoring candidate is stronger for this role."
    )
    user = "".join(user_parts)
    out = get_chat_completion(system, user, max_tokens=1400, temperature=0.3)
    return (out or "").strip()[:3000]


@router.post("/compare")
async def recruiter_compare(request: Request, body: dict = Body(...)):
    """
    Compare two candidates for a role. Returns LLM-generated analysis of why one may be better for the JD.
    Body: candidate_ids (list of 2), role_description, and optionally candidate data (names, scores) for context.
    Response: comparison (string), recommendations (map candidate_id -> list of bullet strings from latest audit).
    """
    deps.require_recruiter(request)
    ids = body.get("candidate_ids")
    if not isinstance(ids, list) or len(ids) != 2:
        raise HTTPException(status_code=400, detail="candidate_ids must be a list of exactly 2 IDs.")
    cid_a = (ids[0] or "").strip()
    cid_b = (ids[1] or "").strip()
    if len(cid_a) != 16 or not all(c in "0123456789abcdef" for c in cid_a.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    if len(cid_b) != 16 or not all(c in "0123456789abcdef" for c in cid_b.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    if cid_a == cid_b:
        raise HTTPException(status_code=400, detail="Cannot compare a candidate to themselves.")
    role_description = (body.get("role_description") or "").strip()
    candidates_data = body.get("candidates")  # optional: [{ candidate_id, name, match_score, smart, grit, build, fit_level }, ...]
    name_a = name_b = "Candidate"
    match_a = match_b = smart_a = smart_b = grit_a = grit_b = build_a = build_b = 0.0
    fit_level_a = fit_level_b = ""
    if isinstance(candidates_data, list) and len(candidates_data) >= 2:
        for c in candidates_data:
            cid = (c.get("candidate_id") or "").strip()
            if cid == cid_a:
                name_a = (c.get("name") or "Candidate").strip()
                match_a = float(c.get("match_score") or 0)
                smart_a = float(c.get("smart") or 0)
                grit_a = float(c.get("grit") or 0)
                build_a = float(c.get("build") or 0)
                fit_level_a = (c.get("fit_level") or "").strip()
            elif cid == cid_b:
                name_b = (c.get("name") or "Candidate").strip()
                match_b = float(c.get("match_score") or 0)
                smart_b = float(c.get("smart") or 0)
                grit_b = float(c.get("grit") or 0)
                build_b = float(c.get("build") or 0)
                fit_level_b = (c.get("fit_level") or "").strip()

    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")

    def load_email(cid: str) -> str | None:
        p = os.path.join(profiles_dir, cid, "profile.json")
        if not os.path.isfile(p):
            return None
        try:
            with open(p, "r", encoding="utf-8") as f:
                prof = json.load(f)
            return (prof.get("email") or "").strip().lower() or None
        except Exception:
            return None

    from projects.dilly.api.dilly_profile_txt import get_dilly_profile_txt_content, parse_structured_experience_from_profile_txt
    from projects.dilly.api.audit_history import get_audits

    email_a = load_email(cid_a)
    email_b = load_email(cid_b)
    if not email_a or not email_b:
        raise HTTPException(status_code=404, detail="One or both candidates not found.")

    profile_txt_a = get_dilly_profile_txt_content(email_a, max_chars=8000)
    profile_txt_b = get_dilly_profile_txt_content(email_b, max_chars=8000)

    # Fetch evidence and structured experience for personal, specific comparison
    def _evidence_str(email: str) -> str:
        audits = get_audits(email)
        latest = audits[0] if audits else {}
        ev = latest.get("evidence_quotes") or latest.get("evidence") or {}
        parts = []
        for dim in ("smart", "grit", "build"):
            q = (ev.get(dim) or ev.get(dim.capitalize()) or "").strip()
            if q:
                parts.append(f"{dim.upper()}: {q}")
        return "\n".join(parts) if parts else ""

    def _experience_str(profile_txt: str) -> str:
        exp = parse_structured_experience_from_profile_txt(profile_txt or "") if profile_txt else []
        if not exp:
            return ""
        lines = []
        for e in exp[:12]:
            company = (e.get("company") or "").strip()
            role = (e.get("role") or "").strip()
            date = (e.get("date") or "").strip()
            bullets = e.get("bullets") or []
            header = f"{role} at {company}" if (role and company) else (role or company or "Experience")
            if date:
                header += f" ({date})"
            lines.append(header)
            for b in bullets[:4]:
                if b:
                    lines.append(f"  - {b[:200]}")
        return "\n".join(lines)

    def _audit_recommendation_bullets(email: str, limit: int = 6) -> list[str]:
        """Compact lines from latest audit recommendations for recruiter compare UI."""
        audits = get_audits(email)
        latest = audits[0] if audits else {}
        recs = latest.get("recommendations") or []
        out: list[str] = []
        for r in recs:
            if isinstance(r, str):
                s = r.strip()
                if s:
                    out.append(s[:400])
            elif isinstance(r, dict):
                title = (r.get("title") or "").strip()
                action = (r.get("action") or "").strip()
                if title and action:
                    line = f"{title}: {action[:240]}"
                elif title:
                    line = title
                elif action:
                    line = action[:320]
                else:
                    continue
                out.append(line[:400])
            if len(out) >= limit:
                break
        return out

    evidence_a = _evidence_str(email_a)
    evidence_b = _evidence_str(email_b)
    experience_a = _experience_str(profile_txt_a)
    experience_b = _experience_str(profile_txt_b)

    if not (name_a or "").strip() or name_a == "Candidate":
        try:
            with open(os.path.join(profiles_dir, cid_a, "profile.json"), "r", encoding="utf-8") as f:
                name_a = (json.load(f).get("name") or "Candidate").strip()
        except Exception:
            pass
    if not (name_b or "").strip() or name_b == "Candidate":
        try:
            with open(os.path.join(profiles_dir, cid_b, "profile.json"), "r", encoding="utf-8") as f:
                name_b = (json.load(f).get("name") or "Candidate").strip()
        except Exception:
            pass

    rec_a = _audit_recommendation_bullets(email_a)
    rec_b = _audit_recommendation_bullets(email_b)

    loop = asyncio.get_event_loop()
    comparison = await loop.run_in_executor(
        None,
        lambda: _compare_candidates_for_role(
            cid_a, cid_b, name_a, name_b,
            profile_txt_a, profile_txt_b, role_description,
            match_a, match_b, smart_a, smart_b, grit_a, grit_b, build_a, build_b,
            fit_level_a, fit_level_b,
            evidence_a=evidence_a,
            evidence_b=evidence_b,
            experience_a=experience_a,
            experience_b=experience_b,
        ),
    )
    return {
        "comparison": comparison,
        "recommendations": {cid_a: rec_a, cid_b: rec_b},
    }


# ---------------------------------------------------------------------------
# Similar candidates
# ---------------------------------------------------------------------------

@router.get("/candidates/{candidate_id}/similar")
async def recruiter_similar_candidates(request: Request, candidate_id: str, limit: int = 6, role_description: str | None = None):
    """Return candidates similar to this one (skills, experience, scores). When role_description is provided, includes match_score (JD match) for each."""
    deps.require_recruiter(request)
    candidate_id = (candidate_id or "").strip()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid candidate_id.")
    try:
        limit = min(max(1, limit), 12)
    except (TypeError, ValueError):
        limit = 6
    from projects.dilly.api.recruiter_search import find_similar_candidates
    candidates = find_similar_candidates(candidate_id, limit=limit, role_description=role_description or None)
    return {"candidates": candidates}


# ---------------------------------------------------------------------------
# Export to ATS
# ---------------------------------------------------------------------------

def _split_name(name: str) -> tuple[str, str]:
    """Split full name into first and last. Handles single names, multiple parts."""
    s = (name or "").strip()
    if not s:
        return ("", "")
    parts = s.split()
    if len(parts) == 1:
        return (parts[0], "")
    return (parts[0], parts[-1])


def _school_display_name(school_id: str) -> str:
    """Return human-readable school name from school_id (e.g. utampa → University of Tampa)."""
    sid = (school_id or "").strip().lower()
    if not sid:
        return ""
    try:
        from projects.dilly.api.schools import SCHOOLS
        s = SCHOOLS.get(sid)
        return (s.get("name") or school_id) if s else school_id
    except Exception:
        return school_id or ""


@router.get("/export/shortlist")
async def recruiter_export_shortlist(request: Request):
    """
    Export shortlisted candidates (bookmarks + all collections) as ATS-ready data.
    Returns candidates with fields aligned to Greenhouse, Bullhorn, and similar ATS bulk-import formats:
    first_name, last_name, email, phone, school, major, track, smart, grit, build,
    dilly_profile_link, dilly_take, job_locations, source.
    Frontend generates CSV for direct import into ATS.
    """
    deps.require_recruiter(request)
    key = deps.get_recruiter_key(request)
    from projects.dilly.api.recruiter_bookmark_store import get_all
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.audit_history import get_audits
    data = get_all(key)
    all_ids = list(data.get("bookmarks") or [])
    for ids in (data.get("collections") or {}).values():
        all_ids.extend(ids or [])
    all_ids = list(dict.fromkeys(all_ids))  # dedupe, preserve order

    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
    base_url = os.environ.get("DILLY_APP_URL", "https://trydilly.com")
    out = []
    for cid in all_ids[:200]:  # cap for safety
        profile_path = os.path.join(profiles_dir, cid, "profile.json")
        if not os.path.isfile(profile_path):
            out.append({
                "first_name": "",
                "last_name": "",
                "email": "",
                "phone": "",
                "school": "",
                "major": "",
                "track": "",
                "smart": "",
                "grit": "",
                "build": "",
                "meridian_profile_link": f"{base_url}/p/{cid}/full",
                "dilly_take": "",
                "job_locations": "",
                "source": "Dilly",
            })
            continue
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                prof = json.load(f)
        except Exception:
            out.append({
                "first_name": "",
                "last_name": "",
                "email": "",
                "phone": "",
                "school": "",
                "major": "",
                "track": "",
                "smart": "",
                "grit": "",
                "build": "",
                "meridian_profile_link": f"{base_url}/p/{cid}/full",
                "dilly_take": "",
                "job_locations": "",
                "source": "Dilly",
            })
            continue
        email = (prof.get("email") or "").strip().lower()
        profile = get_profile(email) or prof
        name = (profile.get("name") or prof.get("name") or "").strip()
        first_name, last_name = _split_name(name)
        audits = get_audits(email) if email else []
        latest = audits[0] if audits else {}
        scores = latest.get("scores") or {}
        smart = scores.get("smart")
        grit = scores.get("grit")
        build = scores.get("build")
        dilly_take = (latest.get("dilly_take") or latest.get("meridian_take") or "").strip()[:600] or ""
        school_id = (profile.get("school_id") or profile.get("schoolId") or prof.get("school_id") or "").strip()
        school = _school_display_name(school_id) if school_id else ""
        major = (profile.get("major") or prof.get("major") or "").strip()
        majors = profile.get("majors") or prof.get("majors") or []
        if majors and isinstance(majors, list):
            major = major or ", ".join(str(m) for m in majors if m)
        track = (latest.get("detected_track") or profile.get("track") or prof.get("track") or "").strip()
        job_locations = profile.get("job_locations") or prof.get("job_locations") or []
        if isinstance(job_locations, list):
            job_locations_str = ", ".join(str(x) for x in job_locations if x)
        else:
            job_locations_str = str(job_locations) if job_locations else ""
        phone = (profile.get("phone") or prof.get("phone") or "").strip()
        out.append({
            "first_name": first_name,
            "last_name": last_name,
            "email": email or "",
            "phone": phone,
            "school": school,
            "major": major,
            "track": track,
            "smart": str(round(smart)) if smart is not None else "",
            "grit": str(round(grit)) if grit is not None else "",
            "build": str(round(build)) if build is not None else "",
            "meridian_profile_link": f"{base_url}/p/{cid}/full",
            "dilly_take": dilly_take,
            "job_locations": job_locations_str,
            "source": "Meridian",
        })
    return {"candidates": out}
