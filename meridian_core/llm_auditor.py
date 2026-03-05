"""
Meridian LLM Auditor — LLM-based scoring with Meridian Truth Standard (MTS).
The model must only use evidence present in the resume; no invented metrics or claims.
Returns the same AuditorResult shape as the rule-based auditor for API compatibility.
"""

from dataclasses import dataclass
import json
import os
import re
from typing import List

from meridian_core.auditor import AuditorResult, get_track_from_major_and_text, name_from_filename

# Optional: use rule-based as fallback if LLM fails or returns invalid output
try:
    from meridian_core.auditor import run_audit as run_rule_audit
except Exception:
    run_rule_audit = None


SYSTEM_PROMPT = """You are the Meridian Auditor: a strict, evidence-only resume scoring system. You follow the Meridian Truth Standard (MTS).

RULES (non-negotiable):
1. ZERO HALLUCINATION: Only use information explicitly stated or clearly implied in the resume. If something is not in the text, do not use it to score or mention it.
2. SMART (0-100): Academic rigor — GPA, major difficulty, honors, research. Weight STEM/quant majors higher; do not invent a GPA if none is given (use 0 or a conservative default only if you must output a number).
3. GRIT (0-100): Quantifiable impact (numbers, %, $), leadership roles, work/experience density. Count only stated metrics and titles.
4. BUILD (0-100): Track-specific proof — Pre-Health: clinical hours, shadowing, research; Pre-Law: advocacy, legal internships, writing; Builder: tech stack, projects, deployments. Only what is stated.
5. Each audit_finding must cite evidence from the resume (e.g. "Score +X% for [specific thing from resume]"). Do not add generic fluff.
6. MAJOR: Extract the candidate's major/degree/concentration exactly as stated (e.g. Data Science, Biochemistry, Computer Science, History & International Studies, Marine Science, Psychology). Only output "Unknown" if no major, degree, or field of study is stated anywhere. Never output "Unknown" when the resume clearly states a degree or major.
7. Detect track from major/content: Pre-Health (bio/chem/health), Pre-Law (history/polisci/law), Builder (tech/quant/business). Output one of: Pre-Health, Pre-Law, Builder.

8. RECOMMENDATIONS (high-impact, personalized): Give 2–4 recommendations for THIS person only. Base them on what is actually missing or weak in their resume. Be specific and actionable. Examples of high-impact recs:
   - If they have leadership but no numbers: "Add quantifiable impact to your [Role]: e.g. 'increased membership by X%' or 'grew engagement to Y members' so the scorer counts impact."
   - If dates are missing or in wrong format: "Use 'Month YYYY' for every role (e.g. Jan 2024 – Present) so work density is counted."
   - If Pre-Health and no clinical: "Add clinical or shadowing hours; even 50+ hours with a clear 'Month YYYY' range will strengthen your Build score."
   - If Builder and weak tech proof: "Name 2–3 concrete tools or projects (e.g. 'Built X using Python and SQL') so technical depth is visible."
   Do NOT give generic advice like 'increase project velocity' or 'do a full-stack deployment' unless it clearly fits this resume. Every recommendation must be something they can do to improve their score based on what you see.

Output valid JSON only, no markdown or extra text. candidate_name must be the person's real name (from the resume header/top), never a phrase from the body (e.g. not "prediction on", "well-educated", or text from bullet points). major must be from THIS resume only, not copied from the examples. Use this exact structure:
{
  "candidate_name": "person's name from this resume header only, or Unknown",
  "major": "exact major/degree from this resume only (e.g. Data Science, Biochemistry); only Unknown if not stated",
  "track": "Pre-Health | Pre-Law | Builder",
  "smart_score": number 0-100,
  "grit_score": number 0-100,
  "build_score": number 0-100,
  "final_score": number 0-100,
  "audit_findings": ["string", "..."],
  "evidence_smart": "one or two sentences citing resume evidence for Smart",
  "evidence_grit": "one or two sentences citing resume evidence for Grit",
  "evidence_build": "one or two sentences citing resume evidence for Build",
  "recommendations": [
    {"title": "Short label (e.g. Add quantifiable impact)", "action": "One specific sentence for this person only."},
    {"title": "...", "action": "..."}
  ]
}"""

USER_PROMPT_TEMPLATE = """Audit this resume. Use ONLY evidence from the text below. Output the JSON object only.

---RESUME TEXT---
{resume_text}
---END---
"""


def _find_training_data_path() -> str | None:
    """Locate training_data.json (prompts/training_data.json under workspace or projects/meridian)."""
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(os.getcwd(), "projects", "meridian", "prompts", "training_data.json"),
        os.path.join(os.getcwd(), "prompts", "training_data.json"),
        os.path.join(_root, "projects", "meridian", "prompts", "training_data.json"),
    ]
    env_path = os.environ.get("MERIDIAN_TRAINING_DATA")
    if env_path and os.path.isfile(env_path):
        return env_path
    for p in candidates:
        p = os.path.normpath(p)
        if os.path.isfile(p):
            return p
    return None


def _load_few_shot_examples(max_examples: int = 4, max_chars_per_excerpt: int = 2400) -> List[dict]:
    """Load training_data.json and return a list of example dicts for few-shot. Prefer diversity by track."""
    path = _find_training_data_path()
    if not path:
        return []
    try:
        with open(path, "r") as f:
            data = json.load(f)
    except Exception:
        return []
    examples = data.get("examples") or data.get("items") or []
    if not examples:
        return []
    # Prefer one per track if we have enough, then fill with rest
    by_track: dict = {}
    for ex in examples:
        t = ex.get("track") or "Builder"
        by_track.setdefault(t, []).append(ex)
    chosen = []
    for track in ("Pre-Health", "Pre-Law", "Builder"):
        if by_track.get(track) and len(chosen) < max_examples:
            chosen.append(by_track[track][0])
    for ex in examples:
        if ex not in chosen and len(chosen) < max_examples:
            chosen.append(ex)
    # Truncate excerpts to stay within context
    out = []
    for ex in chosen[:max_examples]:
        excerpt = (ex.get("resume_excerpt") or ex.get("resume_text") or "")[:max_chars_per_excerpt]
        if len((ex.get("resume_excerpt") or ex.get("resume_text") or "")) > max_chars_per_excerpt:
            excerpt += "..."
        out.append({
            "resume_excerpt": excerpt,
            "candidate_name": ex.get("candidate_name", "Unknown"),
            "major": ex.get("major", "Unknown"),
            "track": ex.get("track", "Builder"),
            "smart_score": ex.get("smart_score", 0),
            "grit_score": ex.get("grit_score", 0),
            "build_score": ex.get("build_score", 0),
            "final_score": ex.get("final_score", 0),
            "audit_findings": ex.get("audit_findings") or [],
            "evidence_smart": ex.get("evidence_smart") or "",
            "evidence_grit": ex.get("evidence_grit") or "",
        })
    return out


def _build_few_shot_block(examples: List[dict]) -> str:
    """Format examples for the system prompt so the LLM grades in the same style."""
    if not examples:
        return ""
    lines = [
        "Below are example audits from the Meridian rule-based engine (trained on your resume set). Grade the next resume in the same style and scale.",
        "",
    ]
    for i, ex in enumerate(examples, 1):
        lines.append(f"--- Example {i} (Track: {ex['track']}) ---")
        lines.append("Resume excerpt:")
        lines.append(ex["resume_excerpt"])
        lines.append("")
        lines.append("Output (scores and evidence only from the text above):")
        lines.append(json.dumps({
            "candidate_name": ex["candidate_name"],
            "major": ex["major"],
            "track": ex["track"],
            "smart_score": ex["smart_score"],
            "grit_score": ex["grit_score"],
            "build_score": ex["build_score"],
            "final_score": ex["final_score"],
            "audit_findings": ex["audit_findings"],
            "evidence_smart": ex["evidence_smart"],
            "evidence_grit": ex["evidence_grit"],
            "evidence_build": f"Track: {ex['track']}. See audit_findings.",
        }, indent=2))
        lines.append("")
    lines.append("--- Now audit the following resume in the same way. Output JSON only. ---")
    return "\n".join(lines)


def _call_llm(resume_text: str, few_shot_block: str | None = None) -> str:
    """Call OpenAI-compatible API. Set OPENAI_API_KEY; optional OPENAI_BASE_URL."""
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("Install openai: pip install openai")
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")
    base_url = os.environ.get("OPENAI_BASE_URL")  # e.g. for Azure or proxy
    client = OpenAI(api_key=api_key, base_url=base_url if base_url else None)
    model = os.environ.get("MERIDIAN_LLM_MODEL", "gpt-4o-mini")
    system_content = SYSTEM_PROMPT
    if few_shot_block:
        system_content = system_content + "\n\n" + few_shot_block
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(resume_text=resume_text[:28000])},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    return response.choices[0].message.content or "{}"


def _parse_llm_response(raw: str) -> dict:
    """Extract JSON from LLM response; tolerate surrounding markdown."""
    raw = raw.strip()
    # Strip markdown code block if present
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```\s*$", "", raw)
    return json.loads(raw)


def _to_auditor_result(parsed: dict, resume_text: str) -> AuditorResult:
    """Map parsed JSON to AuditorResult. Clamp scores and fill missing fields."""
    def clamp_score(v, default: float = 50.0) -> float:
        if v is None:
            return default
        try:
            return round(min(100.0, max(0.0, float(v))), 2)
        except (TypeError, ValueError):
            return default

    smart = clamp_score(parsed.get("smart_score"))
    grit = clamp_score(parsed.get("grit_score"))
    build = clamp_score(parsed.get("build_score"))
    final = clamp_score(parsed.get("final_score"))
    if final == 50.0 and (smart != 50 or grit != 50 or build != 50):
        final = round((smart * 0.30) + (grit * 0.45) + (build * 0.25), 2)

    findings: List[str] = list(parsed.get("audit_findings") or [])
    if not findings:
        findings = [
            parsed.get("evidence_smart") or "Smart: evidence from resume.",
            parsed.get("evidence_grit") or "Grit: evidence from resume.",
            parsed.get("evidence_build") or "Build: evidence from resume.",
        ]

    evidence_smart = [parsed.get("evidence_smart") or ""]
    evidence_grit = [parsed.get("evidence_grit") or ""]

    recs_raw = parsed.get("recommendations") or []
    recommendations = []
    for r in recs_raw[:6]:
        if not isinstance(r, dict):
            continue
        title = r.get("title") or r.get("name") or r.get("label")
        action = r.get("action") or r.get("description") or r.get("detail") or r.get("text")
        if title and action:
            recommendations.append({"title": str(title)[:120], "action": str(action)[:500]})

    return AuditorResult(
        candidate_name=parsed.get("candidate_name") or "Unknown",
        major=parsed.get("major") or "Unknown",
        track=parsed.get("track") or get_track_from_major_and_text(parsed.get("major") or "", resume_text),
        smart_score=smart,
        grit_score=grit,
        build_score=build,
        final_score=final,
        audit_findings=findings,
        evidence_smart=evidence_smart,
        evidence_grit=evidence_grit,
        recommendations=recommendations if recommendations else None,
    )


def run_audit_llm(
    raw_text: str,
    *,
    candidate_name: str | None = None,
    major: str | None = None,
    gpa: float | None = None,
    fallback_to_rules: bool = True,
    filename: str | None = None,
) -> AuditorResult:
    """
    Run Meridian audit using an LLM. MTS enforced via prompt; only evidence from resume.
    If fallback_to_rules is True and LLM fails or returns invalid JSON, uses rule-based auditor.
    When result.candidate_name is Unknown and filename is provided, uses name_from_filename so we avoid Unknown at scale.
    """
    try:
        few_shot_block = ""
        if os.environ.get("MERIDIAN_FEW_SHOT", "1").strip().lower() in ("1", "true", "yes"):
            examples = _load_few_shot_examples(
                max_examples=int(os.environ.get("MERIDIAN_FEW_SHOT_N", "3")),
                max_chars_per_excerpt=int(os.environ.get("MERIDIAN_EXCERPT_CHARS", "2400")),
            )
            few_shot_block = _build_few_shot_block(examples)
        content = _call_llm(raw_text, few_shot_block=few_shot_block or None)
        parsed = _parse_llm_response(content)
        result = _to_auditor_result(parsed, raw_text)
        if candidate_name:
            result = AuditorResult(
                candidate_name=candidate_name,
                major=result.major,
                track=result.track,
                smart_score=result.smart_score,
                grit_score=result.grit_score,
                build_score=result.build_score,
                final_score=result.final_score,
                audit_findings=result.audit_findings,
                evidence_smart=result.evidence_smart,
                evidence_grit=result.evidence_grit,
                recommendations=result.recommendations,
            )
        # Never leave Unknown when we have a filename (scale-ready)
        if (result.candidate_name or "").strip().lower() == "unknown" and filename:
            result = AuditorResult(
                candidate_name=name_from_filename(filename),
                major=result.major,
                track=result.track,
                smart_score=result.smart_score,
                grit_score=result.grit_score,
                build_score=result.build_score,
                final_score=result.final_score,
                audit_findings=result.audit_findings,
                evidence_smart=result.evidence_smart,
                evidence_grit=result.evidence_grit,
                recommendations=result.recommendations,
            )
        return result
    except Exception as e:
        if fallback_to_rules and run_rule_audit is not None:
            return run_rule_audit(raw_text, candidate_name=candidate_name or "Unknown", major=major or "Unknown", gpa=gpa, filename=filename)
        raise RuntimeError(f"LLM audit failed: {e}") from e
