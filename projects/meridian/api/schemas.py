import json
from pydantic import BaseModel
from typing import List, Dict, Optional

class AuditEvidence(BaseModel):
    score: float
    reason: str

class AuditRecommendation(BaseModel):
    title: str
    action: str

class AuditResponse(BaseModel):
    candidate_name: str
    detected_track: str
    scores: Dict[str, float]
    evidence: Dict[str, str]
    recommendations: List[AuditRecommendation]
    raw_logs: List[str]


class AuditResponseV2(BaseModel):
    """Ground Truth V6.5 + Vantage Alpha. Scores 0–100, evidence-based audit_findings only."""
    candidate_name: str
    detected_track: str
    major: str
    scores: Dict[str, float]  # smart, grit, build (0–100)
    final_score: float
    audit_findings: List[str]
    evidence: Dict[str, str]  # smart, grit, build (summary)
    recommendations: List[AuditRecommendation]
    raw_logs: List[str]

class Benchmarks:
    def __init__(self, path: str = "projects/meridian/api/benchmarks.json"):
        with open(path, "r") as f:
            self.data = json.load(f)

    def get_recommendations(self, track: str, scores: Dict[str, float]) -> List[AuditRecommendation]:
        recs = []
        track_benchmarks = self.data.get(track, self.data.get("Builder"))
        
        for category, benchmark in track_benchmarks.items():
            if scores.get(category.lower(), 0) < benchmark["tier_1"]:
                for rec in benchmark["recommendations"]:
                    recs.append(AuditRecommendation(**rec))
        return recs[:3]
