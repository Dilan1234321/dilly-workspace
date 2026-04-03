"""
Meridian Job Matching — Personalize job recommendations from profile, resume, and audit.

Uses rule-based filtering + LLM for "why" bullets and final match percentage.

Premium standard: Only list jobs from companies we have verified hiring criteria for.
If we cannot confidently apply a company's guidelines to students, we don't show their jobs.
"""

import fnmatch
import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Any

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_JOBS_DB = os.path.join(_WORKSPACE_ROOT, "projects", "dilly", "dilly_jobs.db")

# School id -> city for "near university" filtering
_SCHOOL_CITIES: dict[str, str] = {"utampa": "Tampa"}

# Track -> job type / keyword alignment (internship-heavy for students)
_TRACK_JOB_PREF = {
    "tech": ["software", "engineer", "developer", "intern", "data", "product", "design"],
    "finance": ["finance", "analyst", "investment", "banking", "intern"],
    "consulting": ["consulting", "analyst", "strategy", "intern"],
    "business": ["business", "analyst", "marketing", "intern", "operations"],
    "science": ["research", "lab", "science", "intern", "data"],
    "pre_health": ["health", "clinical", "medical", "intern", "shadow"],
    "pre_law": ["legal", "law", "intern", "paralegal"],
    "communications": ["communications", "media", "pr", "intern", "content"],
    "education": ["education", "teaching", "intern", "tutor"],
    "arts": ["design", "creative", "arts", "intern", "portfolio"],
    "humanities": ["research", "writing", "humanities", "intern"],
}


def _job_matches_location(job: dict, profile: dict) -> bool:
    """Return True if job passes location filter based on profile preferences."""
    loc = (job.get("location") or "").strip()
    loc_lower = loc.lower()

    # Remote / hybrid always included
    if "remote" in loc_lower or "hybrid" in loc_lower:
        return True

    # Broad national listings (e.g. "United States", "Nationwide", "Multiple Locations")
    # are included for any non-international preference — the job is open to the user's area.
    _broad_national = ["united states", "usa", "u.s.", "nationwide", "multiple locations", "various"]
    if any(b in loc_lower for b in _broad_national):
        return True

    scope = (profile.get("job_location_scope") or "").strip().lower()
    cities = profile.get("job_locations") or []

    if scope == "international":
        return True
    if scope == "domestic":
        # Exclude non-US locations (simple heuristic)
        non_us = ["london", "uk", "united kingdom", "dublin", "berlin", "paris", "toronto", "sydney", "singapore", "india", "amsterdam", "munich"]
        if any(c in loc_lower for c in non_us):
            return False
        return True

    # scope == "specific" or unset
    if not scope and not cities:
        return False  # No preferences; frontend should show setup first

    school_id = (profile.get("schoolId") or "").strip().lower()
    school_city = _SCHOOL_CITIES.get(school_id, "")
    allowed: set[str] = set()
    if school_city:
        allowed.add(school_city.lower())

    def _add_city(s: str) -> None:
        s = s.strip().lower()
        if not s:
            return
        allowed.add(s)
        # Also add city part for "City, ST" format (e.g. "tampa" from "tampa, fl")
        if "," in s:
            allowed.add(s.split(",")[0].strip())

    for c in cities:
        if isinstance(c, str):
            _add_city(c)

    if not allowed:
        return False

    for city in allowed:
        if city in loc_lower:
            return True
    return False


def _normalize_track(t: str) -> str:
    s = (t or "").strip().lower().replace(" ", "_").replace("-", "_")
    return s if s else "tech"


def _user_scores_from_audit(audit: dict | None) -> dict[str, float | str]:
    """Extract Smart, Grit, Build, final_score, track from audit for target/reach comparison."""
    if not audit:
        return {"smart": 0, "grit": 0, "build": 0, "final_score": 0, "track": ""}
    scores = audit.get("scores") or {}
    track = (audit.get("detected_track") or "").strip()
    return {
        "smart": float(scores.get("smart") or 0),
        "grit": float(scores.get("grit") or 0),
        "build": float(scores.get("build") or 0),
        "final_score": float(audit.get("final_score") or 0),
        "track": _normalize_track(track),
    }


def _target_reach_and_gap(required: dict, user: dict) -> tuple[str, str | None]:
    """
    Compare required Meridian scores to user scores.
    Return (match_tier, to_land_this). match_tier is "target" or "reach".
    to_land_this is a short sentence for reach jobs (what to raise); None for target.
    """
    gap_parts: list[str] = []

    if required.get("track") and _normalize_track(str(required["track"])) != user.get("track", ""):
        gap_parts.append("match this role's track (or run an audit so we know your track)")

    for key, need in required.items():
        if key == "track":
            continue
        if key == "min_smart":
            cur = float(user.get("smart") or 0)
            if cur < float(need):
                gap_parts.append(f"raise Smart to {int(need)}")
        elif key == "min_grit":
            cur = float(user.get("grit") or 0)
            if cur < float(need):
                gap_parts.append(f"raise Grit to {int(need)}")
        elif key == "min_build":
            cur = float(user.get("build") or 0)
            if cur < float(need):
                gap_parts.append(f"raise Build to {int(need)}")
        elif key == "min_final_score":
            cur = float(user.get("final_score") or 0)
            if cur < float(need):
                gap_parts.append(f"raise overall score to {int(need)}")

    if not gap_parts:
        return "target", None
    return "reach", ". ".join(gap_parts)


def _voice_captured_text(profile: dict) -> str:
    """Build text from beyond_resume + experience_expansion + target_companies for keyword overlap and LLM context."""
    parts: list[str] = []
    target_companies = profile.get("target_companies")
    if isinstance(target_companies, list) and target_companies:
        parts.extend(str(x).strip() for x in target_companies if x and str(x).strip())
    beyond = profile.get("beyond_resume")
    if isinstance(beyond, list):
        for item in beyond:
            if isinstance(item, dict):
                text = (item.get("text") or "").strip()
                if text:
                    parts.append(text)
    expansion = profile.get("experience_expansion")
    if isinstance(expansion, list):
        for entry in expansion:
            if isinstance(entry, dict):
                for key in ("skills", "tools_used", "omitted"):
                    items = entry.get(key) or []
                    if isinstance(items, list):
                        parts.extend(str(x).strip() for x in items if x)
    return " ".join(parts)


def _rule_based_score(
    job: dict,
    profile: dict,
    resume_text: str,
    track: str,
) -> float:
    """
    Rule-based score 0–100: track alignment, keyword overlap, job type.
    Includes Voice-captured skills (beyond_resume, experience_expansion) in keyword overlap.
    """
    title = (job.get("title") or "").lower()
    desc = (job.get("description") or "").lower()
    company = (job.get("company") or "").lower()
    job_type = (job.get("job_type") or "").lower()
    combined = f"{title} {desc} {company}"

    score = 50.0  # Base

    # Track alignment
    track_norm = _normalize_track(track)
    keywords = _TRACK_JOB_PREF.get(track_norm, _TRACK_JOB_PREF["tech"])
    matches = sum(1 for k in keywords if k in combined)
    score += min(25, matches * 5)

    # Internship / entry-level bonus for students
    if "intern" in combined or "internship" in job_type:
        score += 15
    elif "entry" in combined or "junior" in combined or "new grad" in combined:
        score += 10

    # Resume + Voice-captured keyword overlap (skills, tools, majors)
    resume_lower = (resume_text or "").lower()[:3000]
    voice_text = _voice_captured_text(profile)
    if voice_text:
        resume_lower = resume_lower + " " + voice_text.lower()[:1500]
    major = (profile.get("major") or "").lower()
    majors = [m.lower() for m in (profile.get("majors") or []) if m]
    if not majors and major:
        majors = [major]
    for m in majors:
        if m and m in combined:
            score += 5
    # Simple word overlap (skip very common words)
    resume_words = set(re.findall(r"\b[a-z]{4,}\b", resume_lower)) - {"that", "this", "with", "from", "have", "been", "were", "will", "your", "they", "their"}
    job_words = set(re.findall(r"\b[a-z]{4,}\b", combined))
    overlap = len(resume_words & job_words)
    score += min(15, overlap)

    return min(100.0, max(0.0, score))


def _llm_match_batch(
    jobs_with_rule_scores: list[tuple[dict, float]],
    profile: dict,
    resume_text: str,
    audit_summary: str,
    company_criteria: list[str] | None = None,
) -> list[tuple[float, list[str]]]:
    """
    Single LLM call: produce match_pct and why_bullets for each job.
    company_criteria: optional list of criteria_for_llm per job (same order). When present, apply these hiring guidelines.
    Returns list of (match_pct, why_bullets) in same order as input.
    """
    try:
        from dilly_core.llm_client import get_chat_completion
    except ImportError:
        return [(r, [f"Based on your profile, we estimate a {int(r)}% match."]) for _, r in jobs_with_rule_scores]

    if not os.environ.get("OPENAI_API_KEY") or not jobs_with_rule_scores:
        return [(r, [f"Based on your profile, we estimate a {int(r)}% match."]) for _, r in jobs_with_rule_scores]

    jobs_blob = json.dumps([
        {"title": j.get("title"), "company": j.get("company"), "job_type": j.get("job_type"), "description": (j.get("description") or "")[:800]}
        for j, _ in jobs_with_rule_scores
    ], indent=0)

    profile_blob = json.dumps({
        "name": profile.get("name"), "major": profile.get("major"), "majors": profile.get("majors"),
        "track": profile.get("track"), "career_goal": profile.get("career_goal"),
        "application_target": profile.get("application_target"),
        "target_companies": profile.get("target_companies"),
    }, indent=0)

    voice_block = ""
    voice_text = _voice_captured_text(profile)
    if voice_text.strip():
        voice_block = f"\nVoice-captured (told Meridian, not on resume): {voice_text[:800]}"

    criteria_block = ""
    if company_criteria and any(c for c in company_criteria):
        criteria_block = "\n\nCompany hiring criteria (apply these when scoring):\n"
        for i, c in enumerate(company_criteria):
            if c:
                j = jobs_with_rule_scores[i][0]
                criteria_block += f"- {j.get('company', '?')}: {c[:400]}\n"

    system = """You are Meridian's job matching advisor. For each job, produce:
1. match_pct (0-100) — how well the candidate fits given the company's hiring criteria. Be realistic; 85+ only for strong fits.
2. why_bullets — 2-4 short bullets citing specific evidence from their resume/major/experience. Apply the company's hiring guidelines when explaining fit.

Respond with a JSON array, one object per job in the same order:
[{"match_pct": 78, "why_bullets": ["...", "..."]}, ...]"""

    user = f"""Jobs (in order):
{jobs_blob}
{criteria_block}

Candidate: {profile_blob}
Resume excerpt: {(resume_text or "No resume.")[:1200]}{voice_block}
Audit: {audit_summary or "None"}

Return JSON array only."""

    out = get_chat_completion(system, user, max_tokens=2500, temperature=0.2)
    if not out:
        return [(r, [f"Based on your profile, we estimate a {int(r)}% match."]) for _, r in jobs_with_rule_scores]

    try:
        raw = out.strip()
        for start in ("```json", "```"):
            if start in raw:
                raw = raw.split(start, 1)[-1].split("```", 1)[0].strip()
        data = json.loads(raw)
        if not isinstance(data, list):
            data = [data]
        result = []
        for i, (_, rule_score) in enumerate(jobs_with_rule_scores):
            obj = data[i] if i < len(data) else {}
            pct = min(100, max(0, float(obj.get("match_pct", rule_score))))
            bullets = obj.get("why_bullets") or []
            bullets = [str(b)[:300] for b in (bullets if isinstance(bullets, list) else [])[:4] if b]
            if not bullets:
                bullets = [f"Based on your profile, we estimate a {int(pct)}% match."]
            result.append((pct, bullets))
        return result
    except Exception:
        return [(r, [f"Based on your profile, we estimate a {int(r)}% match."]) for _, r in jobs_with_rule_scores]


def get_recommended_jobs(
    profile: dict,
    resume_text: str,
    audit: dict | None,
    limit: int = 15,
    offset: int = 0,
    min_match_pct: float = 0,
    use_llm: bool = True,
) -> list[dict]:
    """
    Return jobs ranked by match. Each job has match_pct and why_bullets.
    """
    if not os.path.isfile(_JOBS_DB):
        return []

    track = (profile.get("track") or audit.get("detected_track") or "").strip() or "Tech"
    audit_summary = ""
    if audit:
        scores = audit.get("scores") or {}
        findings = audit.get("audit_findings") or []
        recs = audit.get("recommendations") or []
        rec_texts = [r.get("title") or r.get("action") or str(r)[:80] for r in recs[:3] if isinstance(r, dict)]
        audit_summary = f"Track: {audit.get('detected_track', '')}. Scores: Smart {scores.get('smart', 0):.0f}, Grit {scores.get('grit', 0):.0f}, Build {scores.get('build', 0):.0f}. Findings: {findings[:3]}. Recs: {rec_texts}."

    conn = sqlite3.connect(_JOBS_DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, external_id, title, company, location, description, url, posted_date, source, job_type, scraped_at FROM jobs ORDER BY scraped_at DESC LIMIT 500"
    ).fetchall()
    conn.close()

    jobs = [dict(r) for r in rows]
    if not jobs:
        return []

    # Premium filter: only list jobs from companies we have verified hiring criteria for
    from projects.dilly.api.company_criteria import job_is_verified
    verified_jobs: list[dict] = []
    for j in jobs:
        ok, _ = job_is_verified(j)
        if ok:
            verified_jobs.append(j)
    jobs = verified_jobs
    if not jobs:
        return []

    # Filter by location (near university + user's chosen cities, or domestic/international)
    scope = (profile.get("job_location_scope") or "").strip().lower()
    cities = profile.get("job_locations") or []
    if not scope and not cities:
        return []  # No location preferences set; frontend shows setup first
    jobs = [j for j in jobs if _job_matches_location(j, profile)]
    if not jobs:
        return []

    # Rule-based score for all
    rule_scored: list[tuple[dict, float]] = []
    for j in jobs:
        rs = _rule_based_score(j, profile, resume_text, track)
        rule_scored.append((j, rs))

    # Sort by rule score, take top N for LLM
    rule_scored.sort(key=lambda x: -x[1])
    to_process = [(j, r) for j, r in rule_scored if r >= min_match_pct][offset : offset + limit]

    if use_llm and to_process:
        company_criteria = [job_is_verified(j)[1] or "" for j, _ in to_process]
        llm_results = _llm_match_batch(to_process, profile, resume_text, audit_summary, company_criteria=company_criteria)
        scored = [(pct, j, bullets) for (j, _), (pct, bullets) in zip(to_process, llm_results)]
    else:
        scored = [(r, j, [f"Based on your {track} track and profile, we estimate a {int(r)}% match."]) for j, r in to_process]

    scored.sort(key=lambda x: -x[0])

    from projects.dilly.api.company_criteria import get_job_required_scores
    user_scores = _user_scores_from_audit(audit)

    result: list[dict] = []
    for pct, j, bullets in scored:
        job_out = {**j, "match_pct": round(pct, 0), "why_bullets": bullets}
        required = get_job_required_scores(j)
        if required:
            job_out["required_scores"] = {
                "min_smart": required.get("min_smart"),
                "min_grit": required.get("min_grit"),
                "min_build": required.get("min_build"),
                "min_final_score": required.get("min_final_score"),
                "track": required.get("track"),
            }
            tier, to_land = _target_reach_and_gap(required, user_scores)
            job_out["match_tier"] = tier
            job_out["to_land_this"] = to_land
        else:
            job_out["required_scores"] = None
            job_out["match_tier"] = "target"
            job_out["to_land_this"] = None
        result.append(job_out)
    return result


def get_job_by_id(job_id: str) -> dict | None:
    """Return job by id if it exists and is from a verified company. None otherwise."""
    if not job_id or not os.path.isfile(_JOBS_DB):
        return None
    from projects.dilly.api.company_criteria import job_is_verified
    conn = sqlite3.connect(_JOBS_DB)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT id, external_id, title, company, location, description, url, posted_date, source, job_type, scraped_at FROM jobs WHERE id = ?",
        (str(job_id).strip(),),
    ).fetchone()
    conn.close()
    if not row:
        return None
    job = dict(row)
    ok, _ = job_is_verified(job)
    return job if ok else None


def get_high_match_jobs(
    profile: dict,
    resume_text: str,
    audit: dict | None,
    threshold_pct: float = 80,
    limit: int = 5,
) -> list[dict]:
    """For Dilly: only return jobs where user is a high match (e.g. 80%+)."""
    return get_recommended_jobs(
        profile=profile,
        resume_text=resume_text,
        audit=audit,
        limit=limit,
        offset=0,
        min_match_pct=threshold_pct,
        use_llm=True,
    )


def get_jobs_for_company(
    company_slug: str,
    profile: dict | None = None,
    audit: dict | None = None,
    limit: int = 50,
) -> list[dict]:
    """
    Return jobs from the given company (by slug). Jobs are verified and optionally
    enriched with required_scores, match_tier, to_land_this when profile/audit provided.
    """
    from projects.dilly.api.company_criteria import get_company_by_slug, rule_matches_job

    company = get_company_by_slug(company_slug)
    if not company:
        return []

    if not os.path.isfile(_JOBS_DB):
        return []

    conn = sqlite3.connect(_JOBS_DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, external_id, title, company, location, description, url, posted_date, source, job_type, scraped_at FROM jobs ORDER BY scraped_at DESC LIMIT 500"
    ).fetchall()
    conn.close()

    jobs = [dict(r) for r in rows]
    source = (company.get("source") or "").strip().lower()
    pattern = (company.get("company_pattern") or "").strip()

    filtered: list[dict] = []
    for j in jobs:
        j_source = (j.get("source") or "").strip().lower()
        if j_source != source:
            continue
        if pattern == "*":
            filtered.append(j)
        elif fnmatch.fnmatch((j.get("company") or "").strip().lower(), pattern.lower()):
            filtered.append(j)

    filtered = filtered[:limit]

    from projects.dilly.api.company_criteria import get_job_required_scores
    user_scores = _user_scores_from_audit(audit) if audit else None

    result: list[dict] = []
    for j in filtered:
        out = {**j}
        required = get_job_required_scores(j)
        if required:
            out["required_scores"] = {
                "min_smart": required.get("min_smart"),
                "min_grit": required.get("min_grit"),
                "min_build": required.get("min_build"),
                "min_final_score": required.get("min_final_score"),
                "track": required.get("track"),
            }
            if user_scores:
                tier, to_land = _target_reach_and_gap(required, user_scores)
                out["match_tier"] = tier
                out["to_land_this"] = to_land
            else:
                out["match_tier"] = "target"
                out["to_land_this"] = None
        else:
            out["required_scores"] = None
            out["match_tier"] = "target"
            out["to_land_this"] = None
        result.append(out)

    return result
