import json
import os
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Literal

# ---------------------------------------------------------------------------
# Error response (all errors return this envelope)
# ---------------------------------------------------------------------------
class ErrorResponse(BaseModel):
    """Consistent error envelope; every 4xx/5xx returns this shape."""
    error: Optional[str] = Field(None, description="User-facing message")
    code: Optional[str] = Field(None, description="Stable code for frontend (e.g. UNAUTHORIZED, VALIDATION_ERROR)")
    detail: Optional[str] = Field(None, description="Same as error; kept for compatibility")
    request_id: Optional[str] = Field(None, description="Trace ID; also in X-Request-ID header")


# ---------------------------------------------------------------------------
# Common request/response (validation + OpenAPI)
# ---------------------------------------------------------------------------
class WaitlistSignupRequest(BaseModel):
    email: str = Field(..., min_length=1, description=".edu or any email for waitlist")

class OkMessageResponse(BaseModel):
    ok: bool = True
    message: str = ""

class AuthSendCodeRequest(BaseModel):
    email: str = Field(..., min_length=1, description=".edu email")

class AuthVerifyCodeRequest(BaseModel):
    email: str = Field(..., min_length=1, description=".edu email")
    code: str = Field(..., min_length=1, description="6-digit verification code")

class FamilyAddStudentRequest(BaseModel):
    family_add_token: str = Field(..., min_length=1, description="Token from family invite link")
    student_email: str = Field(..., min_length=1, description=".edu email to add")

class ReportPdfRequest(BaseModel):
    """Body for POST /report/pdf. Pass audit object or nested under 'audit'."""
    audit: Optional[Dict] = None
    candidate_name: Optional[str] = None
    scores: Optional[Dict[str, float]] = None
    audit_findings: Optional[List[str]] = None


class ReportEmailToParentRequest(BaseModel):
    parent_email: str = Field(..., min_length=1, description="Parent email to send report link")
    report_url: str = Field(..., min_length=1, description="Shareable report URL")
    student_name: Optional[str] = Field(None, description="Student name for personalization")


class ApplyThroughMeridianRequest(BaseModel):
    job_id: str = Field(..., min_length=1, description="Job ID to apply to")
    note: Optional[str] = Field(None, max_length=2000, description="Optional note to recruiter")
    report_url: Optional[str] = Field(None, description="Optional resume/report URL to attach")


class RedeemGiftRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Gift redemption code")


class BetaUnlockRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Beta unlock code")


class GiftCheckoutRequest(BaseModel):
    recipient_email: str = Field(..., min_length=1, description=".edu email of gift recipient")
    months: int = Field(6, description="6 or 12 months")

# ---------------------------------------------------------------------------
# Audit (existing)
# ---------------------------------------------------------------------------
class AuditEvidence(BaseModel):
    score: float
    reason: str

class AuditRecommendation(BaseModel):
    """Personalized recommendation: generic advice, line-level edit, or action to boost a score."""
    type: Literal["generic", "line_edit", "action"] = "generic"
    title: str
    action: str
    # line_edit: exact phrase from resume → suggested replacement (no lying; reframe for impact)
    current_line: Optional[str] = None
    suggested_line: Optional[str] = None
    # action recs: which score this helps (Smart, Grit, Build)
    score_target: Optional[str] = None
    # line_edit: short diagnosis label for UI (e.g. "Add outcome", "Stronger verb", "Add track proof")
    diagnosis: Optional[str] = None

class AuditResponse(BaseModel):
    candidate_name: str
    detected_track: str
    scores: Dict[str, float]
    evidence: Dict[str, str]
    recommendations: List[AuditRecommendation]
    raw_logs: List[str]


class AuditResponseV2(BaseModel):
    """Ground Truth V6.5 + Vantage Alpha. Scores 0–100, evidence-based audit_findings only."""
    id: Optional[str] = None  # Set by API for badge/snapshot/history lookup
    candidate_name: str
    detected_track: str
    major: str
    scores: Dict[str, float]  # smart, grit, build (0–100)
    final_score: float
    audit_findings: List[str]
    evidence: Dict[str, str]  # smart, grit, build (summary)
    evidence_quotes: Optional[Dict[str, str]] = None  # smart, grit, build: exact quote from resume when LLM supplies
    recommendations: List[AuditRecommendation]
    raw_logs: List[str]
    dilly_take: Optional[str] = None  # One-line consultant headline (LLM)
    strongest_signal_sentence: Optional[str] = None  # "Your strongest signal to recruiters right now is [X]." (derived)
    consistency_findings: Optional[List[str]] = None  # Resume consistency: duplicates, wrong description under role
    red_flags: Optional[List[dict]] = None  # Recruiter turn-offs: [{"message": str, "line": str | None}]
    peer_percentiles: Optional[Dict[str, int]] = None  # smart/grit/build percentile vs same-track cohort (0–100)
    peer_cohort_n: Optional[int] = None  # number of peers in cohort used for percentiles
    peer_fallback_all: Optional[bool] = None  # True when cohort was all-track (same-track had < 3)
    benchmark_copy: Optional[Dict[str, str]] = None  # per-dimension tier-1 bar copy: e.g. {"smart": "Below bar (85)"}
    application_target: Optional[str] = None  # internship | full_time | exploring - how this audit was tailored
    resume_text: Optional[str] = None  # raw resume text for ATS scan and other post-audit tools
    structured_text: Optional[str] = None  # structured (labeled sections) text for ATS scan
    page_count: Optional[int] = None  # PDF page count for ATS analysis

class Benchmarks:
    def __init__(self, path: str = None):
        if path is None:
            _dir = os.path.dirname(os.path.abspath(__file__))
            path = os.path.join(_dir, "benchmarks.json")
        with open(path, "r") as f:
            self.data = json.load(f)

    def get_recommendations(self, track: str, scores: Dict[str, float]) -> List[AuditRecommendation]:
        recs = []
        track_benchmarks = self.data.get(track, self.data.get("Humanities"))
        
        for category, benchmark in track_benchmarks.items():
            if scores.get(category.lower(), 0) < benchmark["tier_1"]:
                for rec in benchmark["recommendations"]:
                    recs.append(AuditRecommendation(**rec))
        return recs[:3]
