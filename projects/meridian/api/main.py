import json
import os
import shutil
import sys
import tempfile
import uuid

# Allow "projects.meridian.*" imports when run from projects/meridian/api (uvicorn main:app)
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)
os.chdir(_WORKSPACE_ROOT)  # so paths like projects/meridian/... resolve

# Load .env from workspace root when present (e.g. MERIDIAN_USE_LLM, OPENAI_API_KEY)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from projects.meridian.meridian_resume_auditor import MeridianResumeAuditor
from projects.meridian.api.schemas import AuditResponse, AuditResponseV2, Benchmarks, AuditRecommendation
import re

app = FastAPI(title="Meridian AI API")

# Enable CORS for Next.js dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

benchmarks = Benchmarks()


@app.get("/health")
def health():
    """For dashboard 'Test Connection': confirms backend is reachable at localhost:8000."""
    return {"status": "ok", "backend": "Meridian AI API"}


def detect_track(text: str) -> str:
    """Detect Pre-Health, Pre-Law, or Builder. Tuned for medical-frat / pre-med conference demo."""
    text = text.lower()
    # Priority 1: Pre-Health (broad so medical frat resumes land here)
    pre_health_kw = [
        "medical", "clinic", "hospital", "biology", "chemistry", "nursing", "physician",
        "allied health", "biomedical", "biochemistry", "pre-med", "pre-medicine", "premed",
        "osteopathic", "lecom", "bs/do", "md ", "do ", "mcat", "patient care", "shadowing",
        "clinical", "emt", "scribe", "medical assistant", "phlebotomy", "triage",
        "healthcare", "patient", "surgery", "residency", "amat", "amsa", "mu epsilon delta",
    ]
    if any(x in text for x in pre_health_kw):
        return "Pre-Health"
    # Priority 2: Pre-Law
    if any(x in text for x in ["law", "legal", "debate", "justice", "political science", "philosophy", "pre-law", "paralegal", "juris"]):
        return "Pre-Law"
    # Priority 3: Builder (Default for Tech/Biz)
    return "Builder"

def _allowed_resume_file(filename: str) -> bool:
    if not filename:
        return False
    return filename.lower().endswith((".pdf", ".docx"))


def _temp_extension(filename: str) -> str:
    return ".pdf" if (filename or "").lower().endswith(".pdf") else ".docx"


@app.post("/audit", response_model=AuditResponse)
async def audit_resume(file: UploadFile = File(...)):
    if not _allowed_resume_file(file.filename):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")

    ext = _temp_extension(file.filename)
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"meridian_audit_{uuid.uuid4().hex}{ext}")
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        auditor = MeridianResumeAuditor(temp_path)
        if not auditor.extract_text():
            raise HTTPException(status_code=500, detail="Failed to extract text from file.")
        
        auditor.analyze_content()
        text = auditor.raw_text
        from meridian_core.resume_parser import parse_resume
        from meridian_core.auditor import name_from_filename
        parsed = parse_resume(text, filename=file.filename)
        candidate_name = parsed.name
        if not candidate_name or candidate_name == "Unknown" or ("prediction" in candidate_name.lower() or "well-educated" in candidate_name.lower()):
            candidate_name = name_from_filename(file.filename) if file.filename else (candidate_name or "Unknown")
        major = parsed.major
        text_for_track = parsed.normalized_text or text
        track = detect_track(text_for_track + " " + major)
        
        # Absolute scores from the improved auditor (no cohort; AI uses LLM few-shot examples only)
        smart_raw = auditor.analysis["metrics"]["smart_score"]
        grit_raw = auditor.analysis["metrics"]["grit_score"]
        build_raw = auditor.analysis["metrics"]["build_score"]

        scores = {
            "smart": round(smart_raw, 1),
            "grit": round(grit_raw, 1),
            "build": round(build_raw, 1),
        }

        evidence = {
            "smart": f"Academic and institutional signals scored for {track}. Use /audit/v2 for evidence from rule engine + few-shot.",
            "grit": f"Leadership and impact markers evaluated. Use /audit/v2 for full evidence.",
            "build": f"Technical depth and project execution scored for {track}. Use /audit/v2 for full evidence.",
        }

        # 4. Benchmarking & Recommendations
        recs = benchmarks.get_recommendations(track, scores)

        return AuditResponse(
            candidate_name=candidate_name,
            detected_track=track,
            scores=scores,
            evidence=evidence,
            recommendations=recs,
            raw_logs=[f"Processed {file.filename}", f"Track detected: {track}", "Scores computed via Dual-Track Audit."]
        )

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/audit/v2", response_model=AuditResponseV2)
async def audit_resume_v2(file: UploadFile = File(...)):
    """Meridian Auditor V2: Ground Truth V6.5 scoring + Vantage Alpha tracks. Evidence-based audit_findings only."""
    if not _allowed_resume_file(file.filename):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")

    ext = _temp_extension(file.filename)
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"meridian_audit_{uuid.uuid4().hex}{ext}")
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        auditor = MeridianResumeAuditor(temp_path)
        if not auditor.extract_text():
            raise HTTPException(status_code=500, detail="Failed to extract text from file.")
        text = auditor.raw_text
        if not auditor.analysis:
            auditor.analyze_content()
        # Unified parser: layout-agnostic name/major/GPA and normalized text for scoring
        from meridian_core.resume_parser import parse_resume
        from meridian_core.auditor import name_from_filename
        parsed = parse_resume(text, filename=file.filename)
        candidate_name = parsed.name
        # If parser returned Unknown or body text as "name" (e.g. "prediction on"), use filename
        if not candidate_name or candidate_name == "Unknown" or ("prediction" in candidate_name.lower() or "well-educated" in candidate_name.lower()):
            candidate_name = name_from_filename(file.filename) if file.filename else (candidate_name or "Unknown")
        major = parsed.major
        gpa = parsed.gpa
        text_for_audit = parsed.normalized_text or text

        use_llm = os.environ.get("MERIDIAN_USE_LLM", "").strip().lower() in ("1", "true", "yes")
        if use_llm and os.environ.get("OPENAI_API_KEY"):
            from meridian_core.llm_auditor import run_audit_llm
            result = run_audit_llm(
                text_for_audit,
                candidate_name=candidate_name,
                major=major,
                gpa=gpa,
                fallback_to_rules=True,
                filename=file.filename,
            )
        else:
            from meridian_core.auditor import run_audit
            result = run_audit(
                text_for_audit,
                candidate_name=candidate_name,
                major=major,
                gpa=gpa,
                filename=file.filename,
            )
        scores = {
            "smart": result.smart_score,
            "grit": result.grit_score,
            "build": result.build_score,
        }
        evidence = {
            "smart": "; ".join(result.evidence_smart[:2]) if result.evidence_smart else "Base calculation.",
            "grit": "; ".join(result.evidence_grit[:2]) if result.evidence_grit else "Base calculation.",
            "build": f"Track: {result.track}. See audit findings.",
        }
        if result.recommendations:
            recs = [AuditRecommendation(title=r["title"], action=r["action"]) for r in result.recommendations]
            recs_source = f"Personalized recommendations: {len(recs)}"
        else:
            recs = benchmarks.get_recommendations(result.track, scores)
            recs_source = "Benchmark recommendations (generic)"

        # Auto-train: append this audit to training_data.json for LLM few-shot (best-effort)
        try:
            from meridian_core.training_append import append_audit_to_training
            append_audit_to_training(text, result, filename=file.filename or "upload.pdf")
        except Exception:
            pass

        raw_logs = [
            f"Processed {file.filename}",
            f"Track: {result.track}",
            "LLM Auditor (MTS)." if use_llm and os.environ.get("OPENAI_API_KEY") else "Meridian Core V6.5 + Vantage Alpha.",
            recs_source,
        ]
        if result.track == "Pre-Health":
            raw_logs.append("Medical school readiness: BCPM, clinical hours, research, and leadership are scored for Pre-Health.")

        return AuditResponseV2(
            candidate_name=result.candidate_name,
            detected_track=result.track,
            major=result.major,
            scores=scores,
            final_score=result.final_score,
            audit_findings=result.audit_findings,
            evidence=evidence,
            recommendations=recs,
            raw_logs=raw_logs,
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
