import json
import os
import shutil
import uuid

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

def get_cohort_percentile(track: str, category: str, score: float) -> float:
    try:
        with open("projects/meridian/beta_cohort_db.json", "r") as f:
            db = json.load(f)
        
        cohort_scores = [c["metrics"]["grit_score"] for c in db["candidates"]]
        
        if not cohort_scores:
            return 50.0
            
        # Calculate rank relative to the 100-person cohort
        count_below = sum(1 for s in cohort_scores if s < score)
        percentile = (count_below / len(cohort_scores)) * 100
        
        # Ensure we don't return exactly 0 or 100 for a more realistic distribution
        return round(max(5.0, min(98.0, percentile)), 1)
    except Exception:
        return 50.0

@app.post("/audit", response_model=AuditResponse)
async def audit_resume(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    temp_path = f"/tmp/{uuid.uuid4()}.pdf"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        auditor = MeridianResumeAuditor(temp_path)
        if not auditor.extract_text():
            raise HTTPException(status_code=500, detail="Failed to extract text from PDF.")
        
        auditor.analyze_content()
        text = auditor.raw_text
        major = auditor.analysis["metadata"]["major"]
        track = detect_track(text + " " + major)
        
        # Absolute scores from the improved auditor
        smart_raw = auditor.analysis["metrics"]["smart_score"]
        grit_raw = auditor.analysis["metrics"]["grit_score"]
        build_raw = auditor.analysis["metrics"]["build_score"]

        # Calculate percentile rankings relative to the Beta Cohort
        # This provides the "Score against each other" logic
        smart_p = get_cohort_percentile(track, "smart", smart_raw)
        grit_p = get_cohort_percentile(track, "grit", grit_raw)
        build_p = get_cohort_percentile(track, "build", build_raw)

        scores = {
            "smart": smart_p,
            "grit": grit_p,
            "build": build_p
        }

        # 3. Explainability Engine (Track & Peer Relative)
        evidence = {
            "smart": f"Ranked in the top {100-smart_p}% of {track} peers based on academic signals and academic rigor.",
            "grit": f"Leadership and impact markers exceed {grit_p}% of the current cohort.",
            "build": f"Technical depth and project execution rank at the {build_p} percentile for {track} tracks."
        }

        # 3. Explainability Engine (Peer-Relative)
        evidence = {
            "smart": f"Ranked in the top {100-smart_p}% of the {track} cohort for institutional and academic signals.",
            "grit": f"Performance exceeds {grit_p}% of peers in leadership and quantifiable impact markers.",
            "build": f"Technical breadth is stronger than {build_p}% of candidates in the {track} track."
        }

        # 4. Benchmarking & Recommendations
        recs = benchmarks.get_recommendations(track, scores)

        return AuditResponse(
            candidate_name=auditor.analysis["metadata"]["candidate"],
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
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    temp_path = f"/tmp/{uuid.uuid4()}.pdf"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        auditor = MeridianResumeAuditor(temp_path)
        if not auditor.extract_text():
            raise HTTPException(status_code=500, detail="Failed to extract text from PDF.")
        text = auditor.raw_text
        meta = auditor.analysis.get("metadata", {}) if auditor.analysis else {}
        candidate_name = meta.get("candidate", "Unknown")
        major = meta.get("major", "Unknown")
        if not auditor.analysis:
            auditor.analyze_content()
            meta = auditor.analysis.get("metadata", {})
            candidate_name = meta.get("candidate", "Unknown")
            major = meta.get("major", "Unknown")

        use_llm = os.environ.get("MERIDIAN_USE_LLM", "").strip().lower() in ("1", "true", "yes")
        if use_llm and os.environ.get("OPENAI_API_KEY"):
            from meridian_core.llm_auditor import run_audit_llm
            result = run_audit_llm(
                text,
                candidate_name=candidate_name,
                major=major,
                gpa=None,
                fallback_to_rules=True,
                filename=file.filename,
            )
        else:
            from meridian_core.auditor import run_audit
            result = run_audit(
                text,
                candidate_name=candidate_name,
                major=major,
                gpa=None,
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
