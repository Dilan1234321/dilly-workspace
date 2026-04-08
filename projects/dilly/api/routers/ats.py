"""
ATS router: analysis-from-audit, keyword-density, vendor-sim, rewrite, keyword-inject,
ats-check, company-lookup, resume-text, ats-score/record, ats-score/history, gap-analysis.
"""

import asyncio
import os
import sys

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Request, HTTPException, Body
from projects.dilly.api import deps
from projects.dilly.api.resume_loader import load_parsed_resume_for_voice
from projects.dilly.api.ats_score_history import (
    get_ats_scores,
    append_ats_score,
    get_ats_score_percentile,
)

router = APIRouter(tags=["ats"])


def _parse_body_to_parsed(body: dict):
    """Build ParsedResume and raw/structured text from request body (parsed_text, raw_text, track, page_count)."""
    from dilly_core.resume_parser import parse_resume
    raw_text = (body.get("raw_text") or body.get("parsed_text") or "").strip()
    if not raw_text:
        return None, "", "", None, None
    parsed = parse_resume(raw_text)
    parsed_text = (body.get("parsed_text") or "").strip() or raw_text
    track = (body.get("track") or "").strip() or None
    page_count = body.get("page_count")
    if page_count is not None:
        try:
            page_count = int(page_count)
        except (TypeError, ValueError):
            page_count = None
    return parsed, raw_text, parsed_text, track, page_count


def _ats_analysis_from_body_dict(body: dict) -> dict | None:
    """CPU-heavy parse + analysis for worker thread (do not block the event loop)."""
    parsed, raw_text, structured_text, track, page_count = _parse_body_to_parsed(body)
    if not raw_text or parsed is None:
        return None
    from dilly_core.ats_analysis import run_ats_analysis

    return run_ats_analysis(
        raw_text=raw_text,
        parsed=parsed,
        structured_text=structured_text,
        page_count=page_count,
        track=track,
    ).to_dict()


@router.post("/ats-analysis-from-audit")
async def ats_analysis_from_audit(request: Request, body: dict = Body(...)):
    """Run full ATS analysis from parsed/raw text (e.g. from audit). Returns score, issues, checklist, etc."""
    deps.require_auth(request)
    timeout_sec = float(os.environ.get("DILLY_ATS_ANALYSIS_TIMEOUT_SEC", "90"))
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(_ats_analysis_from_body_dict, body),
            timeout=timeout_sec,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="ATS analysis timed out. Try again, or shorten your resume text.",
        )
    if result is None:
        raise HTTPException(status_code=400, detail="Provide parsed_text or raw_text.")
    return result


@router.get("/resume-text")
async def get_resume_text(request: Request):
    """Return current user's parsed resume text (for ATS/context)."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    text = load_parsed_resume_for_voice(email, max_chars=50000)
    return {"resume_text": text or ""}


@router.post("/ats-score/record")
async def ats_score_record(request: Request, body: dict = Body(...)):
    """Record one ATS score for the current user (after a scan)."""
    deps.require_auth(request)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    score = body.get("score")
    if score is None:
        raise HTTPException(status_code=400, detail="score required.")
    try:
        score = int(score)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="score must be an integer.")
    score = max(0, min(100, score))
    audit_id = body.get("audit_id")
    append_ats_score(email, score, audit_id)
    return {"ok": True, "score": score}


@router.get("/ats-score/history")
async def ats_score_history(request: Request):
    """Return current user's ATS score history and optional peer percentile."""
    deps.require_auth(request)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        return {"scores": [], "ats_peer_percentile": None}
    scores = get_ats_scores(email)
    # Peer percentile from latest score
    ats_peer_percentile = None
    if scores:
        latest = scores[0]
        s = latest.get("score")
        if s is not None:
            ats_peer_percentile = get_ats_score_percentile(int(s))
    return {"scores": scores, "ats_peer_percentile": ats_peer_percentile}


@router.post("/ats-keyword-density")
async def ats_keyword_density(request: Request, body: dict = Body(...)):
    """Run keyword density and placement analysis. Optional job_description for JD match."""
    deps.require_auth(request)
    parsed, raw_text, _, _, _ = _parse_body_to_parsed(body)
    if not raw_text or parsed is None:
        raise HTTPException(status_code=400, detail="Provide parsed_text or raw_text.")
    from dilly_core.resume_parser import get_sections
    from dilly_core.ats_keywords import run_keyword_analysis
    norm = parsed.normalized_text or raw_text
    sections = parsed.sections or get_sections(norm)
    job_description = (body.get("job_description") or "").strip() or None
    result = run_keyword_analysis(sections, job_description)
    return result.to_dict()


@router.post("/ats-vendor-sim")
async def ats_vendor_sim(request: Request, body: dict = Body(...)):
    """Simulate Workday, Greenhouse, iCIMS, Lever on this resume. Optional target_company for highlight."""
    deps.require_auth(request)
    from dilly_core.ats_analysis import ats_analysis_result_from_dict, run_ats_analysis
    from dilly_core.ats_vendors import run_vendor_simulation
    analysis_payload = body.get("ats_analysis")
    if analysis_payload is not None:
        if not isinstance(analysis_payload, dict):
            raise HTTPException(status_code=400, detail="ats_analysis must be an object.")
        ats_result = ats_analysis_result_from_dict(analysis_payload)
        if ats_result is None:
            raise HTTPException(status_code=400, detail="Invalid ats_analysis payload.")
    else:
        parsed, raw_text, structured_text, track, page_count = _parse_body_to_parsed(body)
        if not raw_text or parsed is None:
            raise HTTPException(status_code=400, detail="Provide parsed_text or raw_text.")
        ats_result = run_ats_analysis(
            raw_text=raw_text,
            parsed=parsed,
            structured_text=structured_text,
            page_count=page_count,
            track=track,
        )
    sim = run_vendor_simulation(ats_result)
    out = sim.to_dict()
    target_company = (body.get("target_company") or "").strip()
    if target_company:
        from dilly_core.ats_company_lookup import lookup_company_ats
        lookup = lookup_company_ats(target_company)
        if lookup:
            out["target_company_ats"] = {"vendor_key": lookup[0], "vendor_name": lookup[1], "company": lookup[2]}
    return out


@router.post("/ats-rewrite")
async def ats_rewrite(request: Request, body: dict = Body(...)):
    """Rewrite bullets for ATS (from issues + bullets or bullets only)."""
    deps.require_auth(request)
    bullets = body.get("bullets") or []
    issues = body.get("issues") or []
    track = (body.get("track") or "").strip() or None
    use_llm = body.get("use_llm", True)
    if isinstance(use_llm, str):
        use_llm = use_llm.lower() in ("1", "true", "yes")
    use_llm = bool(use_llm)
    if not bullets and not issues:
        raise HTTPException(status_code=400, detail="Provide bullets or issues.")
    from dilly_core.ats_rewrites import rewrite_from_ats_issues, rewrite_bullets
    if issues and bullets:
        result = rewrite_from_ats_issues(issues, bullets, track=track, use_llm=use_llm)
    else:
        result = rewrite_bullets(bullets, track=track, use_llm=use_llm)
    return result.to_dict()


@router.post("/ats-keyword-inject")
async def ats_keyword_inject(request: Request, body: dict = Body(...)):
    """Generate contextual keyword injection suggestions (needs keyword_analysis from ats-keyword-density)."""
    deps.require_auth(request)
    keyword_analysis = body.get("keyword_analysis") or body.get("keyword_density") or {}
    parsed_text = (body.get("parsed_text") or body.get("raw_text") or "").strip()
    if not parsed_text:
        raise HTTPException(status_code=400, detail="Provide parsed_text or raw_text and keyword_analysis.")
    from dilly_core.resume_parser import parse_resume, get_sections
    parsed = parse_resume(parsed_text)
    norm = parsed.normalized_text or parsed_text
    sections = parsed.sections or get_sections(norm)
    from dilly_core.ats_keyword_inject import generate_keyword_injections
    result = generate_keyword_injections(keyword_analysis, sections)
    return result.to_dict()


@router.get("/ats-company-lookup")
async def ats_company_lookup(request: Request, company: str = ""):
    """Look up which ATS a company uses (Workday, Greenhouse, iCIMS, Lever)."""
    deps.require_auth(request)
    company = (company or "").strip()
    if not company:
        return {"vendor_key": None, "vendor_name": None, "company": None}
    from dilly_core.ats_company_lookup import lookup_company_ats
    lookup = lookup_company_ats(company)
    if not lookup:
        return {"vendor_key": None, "vendor_name": None, "company": company}
    return {"vendor_key": lookup[0], "vendor_name": lookup[1], "company": lookup[2]}


@router.post("/ats-check")
async def ats_check(request: Request, body: dict = Body(...)):
    """Check resume against job description for ATS keyword gaps (LLM). Returns missing keywords, suggestions, ready."""
    deps.require_auth(request)
    job_description = (body.get("job_description") or "").strip()
    if not job_description or len(job_description) < 50:
        raise HTTPException(status_code=400, detail="Paste the full job description (at least 50 characters).")
    if len(job_description) > 8000:
        raise HTTPException(status_code=400, detail="Job description too long. Paste the key requirements section (under 8000 chars).")
    audit = body.get("audit") or {}
    findings = audit.get("audit_findings") or []
    evidence = audit.get("evidence") or {}
    evidence_quotes = audit.get("evidence_quotes") or {}
    recommendations = audit.get("recommendations") or []
    track = (audit.get("detected_track") or "").strip()
    resume_context = f"Track: {track or 'Unknown'}\n"
    if findings:
        resume_context += "Resume findings:\n" + "\n".join(f"- {f[:300]}" for f in findings[:8])
    if evidence:
        for k, v in evidence.items():
            if v:
                resume_context += f"\n{k}: {str(v)[:400]}\n"
    if evidence_quotes:
        for k, v in evidence_quotes.items():
            if v:
                resume_context += f"Quote {k}: {str(v)[:300]}\n"
    if recommendations:
        for r in recommendations[:5]:
            if isinstance(r, dict) and r.get("title"):
                resume_context += f"- {r.get('title', '')[:150]}\n"
    from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
    _ATS_CHECK_SYSTEM = """You are an ATS expert. Given a job description and a student's resume content (summarized), identify keywords from the JD that appear to be missing or under-emphasized. Output a JSON object with "missing" (array of 3-8 keywords), "suggestions" (array of 2-4 short actionable suggestions), "ready" (boolean). Output ONLY the JSON object."""
    result = {"missing": [], "suggestions": [], "ready": False}
    if is_llm_available():
        user_content = f"Job description:\n{job_description[:4000]}\n\nResume context:\n{resume_context[:3000]}"
        raw = get_chat_completion(_ATS_CHECK_SYSTEM, user_content, model=get_light_model(), temperature=0.3, max_tokens=500)
        if raw:
            import json
            try:
                parsed = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
                if isinstance(parsed, dict):
                    result["missing"] = parsed.get("missing", [])[:8]
                    result["suggestions"] = parsed.get("suggestions", [])[:4]
                    result["ready"] = bool(parsed.get("ready"))
            except (json.JSONDecodeError, ValueError):
                pass
    return result


@router.post("/gap-analysis")
async def gap_analysis(request: Request, body: dict = Body(...)):
    """Deep gap analysis: what's missing or weak for the target (LLM)."""
    deps.require_auth(request)
    target = (body.get("target") or body.get("application_target") or "").strip()
    audit = body.get("audit") or {}
    if not target or len(target) > 300:
        raise HTTPException(status_code=400, detail="Provide target (company, role, or track) under 300 chars.")
    from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
    _GAP_SYSTEM = """You are Dilly. Perform a deep resume gap analysis for a student applying for a specific target. Identify what is MISSING or WEAK. Be specific. Output a JSON object with "gaps" (array of 3-6 short strings), "summary" (one sentence). Output ONLY the JSON object."""
    context = f"Target: {target}\n"
    context += f"Track: {(audit.get('detected_track') or '')}\n"
    scores = audit.get("scores") or {}
    if scores:
        context += f"Scores: Smart {scores.get('smart', 0):.0f}, Grit {scores.get('grit', 0):.0f}, Build {scores.get('build', 0):.0f}\n"
    findings = audit.get("audit_findings") or []
    if findings:
        context += "Findings:\n" + "\n".join(f"- {f[:200]}" for f in findings[:6])
    result = {"gaps": [], "summary": ""}
    if is_llm_available():
        raw = get_chat_completion(_GAP_SYSTEM, context[:3500], model=get_light_model(), temperature=0.4, max_tokens=400)
        if raw:
            import json
            try:
                parsed = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
                if isinstance(parsed, dict):
                    result["gaps"] = parsed.get("gaps", [])[:6]
                    result["summary"] = (parsed.get("summary") or "").strip()
            except (json.JSONDecodeError, ValueError):
                pass
    return result


# ── New standalone ATS scan (no dilly_core dependency) ─────────────────────

def _run_v2_scorer(raw_text: str, jd_text: str | None = None,
                    file_extension: str | None = None,
                    file_path: str | None = None) -> dict | None:
    """
    Build a signal dict from the available analyzers and run the v2 scorer.
    Returns the v2 dict (or None if any piece fails) — callers merge it into
    the legacy response under a 'v2' key.
    """
    try:
        from dilly_core.resume_parser import parse_resume
        from dilly_core.ats_analysis import run_ats_analysis
        from dilly_core.ats_score_v2 import (
            score_from_signals, signals_from_ats_analysis,
        )
    except Exception:
        return None

    try:
        parsed = parse_resume(raw_text)
        analysis = run_ats_analysis(
            raw_text=raw_text, parsed=parsed, structured_text="",
            page_count=None, track=None,
        )

        # Optional keyword-match layer if JD text was provided
        kw_match = None
        kw_conf = None
        kw_missing: list = []
        kw_weak: list = []
        if jd_text and jd_text.strip():
            try:
                from dilly_core.resume_parser import get_sections
                from dilly_core.ats_keywords import run_keyword_analysis
                sections = get_sections(raw_text)
                kr = run_keyword_analysis(sections, job_description=jd_text)
                jd_match = getattr(kr, "jd_match", None)
                if isinstance(jd_match, dict):
                    kw_match = float(jd_match.get("match_percentage") or 0)
                    kw_conf = 0.95  # explicit JD is high-confidence
                    for req in (jd_match.get("requirements") or []):
                        if not isinstance(req, dict):
                            continue
                        placement = req.get("placement")
                        kw = req.get("keyword")
                        if placement == "missing" and req.get("category") == "must_have":
                            kw_missing.append(kw)
                        elif placement == "adequate" or (req.get("found") and not req.get("contextual")):
                            kw_weak.append(kw)
            except Exception:
                pass

        sig = signals_from_ats_analysis(
            analysis, raw_text=raw_text,
            keyword_match=kw_match, keyword_confidence=kw_conf,
            keywords_missing=kw_missing, keywords_weak=kw_weak,
            file_extension=file_extension,
        )

        # Layer in file-level inspection signals when we have access to
        # the source PDF. This catches things pure-text scanning cannot
        # see: image-only PDFs, embedded fonts, XFA forms, etc.
        file_inspection: dict | None = None
        if file_path:
            try:
                from dilly_core.ats_file_inspect import inspect_file
                file_inspection = inspect_file(file_path, file_extension=file_extension)
                if file_inspection:
                    if file_inspection.get("is_image_only_pdf"):
                        sig["is_image_only_pdf"] = True
                    if file_inspection.get("embedded_fonts_count") is not None:
                        sig["embedded_fonts_count"] = file_inspection["embedded_fonts_count"]
                    if file_inspection.get("has_heavy_graphics"):
                        sig["has_graphics"] = True
                    if file_inspection.get("file_extension"):
                        sig["file_extension"] = file_inspection["file_extension"]
            except Exception:
                pass

        scored = score_from_signals(sig).to_dict()
        # Merge PDF inspector red flags into the v2 response so the mobile
        # UI can render them under File Red Flags.
        if file_inspection and file_inspection.get("issues"):
            extra = scored.get("file_redflags") or []
            seen = {r.get("title") for r in extra}
            for rf in file_inspection["issues"]:
                if rf.get("title") in seen:
                    continue
                extra.append({
                    "level": rf.get("level", "high"),
                    "title": rf.get("title"),
                    "detail": rf.get("detail"),
                })
            scored["file_redflags"] = extra
        if file_inspection:
            scored.setdefault("meta", {})
            scored["meta"]["file_inspection"] = {
                k: v for k, v in file_inspection.items()
                if k in ("page_count", "embedded_fonts_count", "image_count",
                         "avg_chars_per_page", "page_size", "is_image_only_pdf",
                         "file_extension")
            }
        return scored
    except Exception as e:
        import sys as _sys, traceback as _tb
        _sys.stderr.write(f"[ats_v2_scorer_failed] {type(e).__name__}: {str(e)[:200]}\n")
        try:
            _tb.print_exc(file=_sys.stderr)
        except Exception:
            pass
        return None


@router.post("/ats/scan")
async def ats_scan_standalone(request: Request, body: dict = Body(...)):
    """Scan resume against all major ATS systems.

    Legacy response (vendors, all_issues, parsed_fields, overall_score) is
    preserved for backwards compat. A new 'v2' key carries the calibrated
    3-factor composite, per-vendor extraction view, per-issue score forecasts,
    and file-level red flags.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    raw_text = (body.get("raw_text") or body.get("parsed_text") or "").strip()
    if not raw_text or len(raw_text) < 50:
        if email:
            try:
                raw_text = load_parsed_resume_for_voice(email, max_chars=50000) or ""
            except Exception:
                raw_text = ""
    if not raw_text or len(raw_text) < 50:
        raise HTTPException(status_code=400, detail="No resume text found. Upload your resume first through New Audit.")
    from projects.dilly.api.ats_engine import scan_resume_ats
    result = scan_resume_ats(raw_text).to_dict()
    jd_text = (body.get("jd_text") or body.get("job_description") or "").strip() or None
    file_ext = (body.get("file_extension") or "pdf").strip().lower().lstrip(".") or "pdf"
    v2 = _run_v2_scorer(raw_text, jd_text=jd_text, file_extension=file_ext)
    if v2:
        result["v2"] = v2
    return result


@router.get("/ats/scan")
async def ats_scan_auto(request: Request):
    """GET version — auto-loads user's saved resume and scans it."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Auth required.")
    raw_text = ""
    try:
        raw_text = load_parsed_resume_for_voice(email, max_chars=50000) or ""
    except Exception:
        pass
    if not raw_text or len(raw_text) < 50:
        raise HTTPException(status_code=400, detail="No resume found. Upload your resume first.")
    from projects.dilly.api.ats_engine import scan_resume_ats
    result = scan_resume_ats(raw_text).to_dict()
    v2 = _run_v2_scorer(raw_text, jd_text=None, file_extension="pdf")
    if v2:
        result["v2"] = v2
    return result
