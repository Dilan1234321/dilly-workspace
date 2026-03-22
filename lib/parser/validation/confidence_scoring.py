"""
Layer 4 — Overall confidence scoring.
"""
from ..types import ParsedResume, ExtractedField


def _conf_to_num(ef: ExtractedField) -> float:
    if not ef:
        return 0.2
    c = ef.confidence
    if c == "high":
        return 1.0
    if c == "medium":
        return 0.6
    return 0.2


def compute_overall_confidence(resume: ParsedResume) -> int:
    """
    Weighted average of field confidences. Weights: name 2.0, email 1.5,
    education 2.0, experience 2.0, skills 1.0, others 0.5.
    Return 0-100 integer.
    """
    weights = {
        "name": 2.0,
        "email": 1.5,
        "education": 2.0,
        "experience": 2.0,
        "skills": 1.0,
    }
    total_weight = 0.0
    weighted_sum = 0.0
    for field_name, weight in weights.items():
        ef = getattr(resume, field_name, None)
        if ef is not None:
            total_weight += weight
            weighted_sum += _conf_to_num(ef) * weight
    for field_name in ["phone", "linkedin", "location", "summary", "certifications"]:
        ef = getattr(resume, field_name, None)
        if ef is not None:
            total_weight += 0.5
            weighted_sum += _conf_to_num(ef) * 0.5
    if total_weight <= 0:
        return 0
    score = (weighted_sum / total_weight) * 100
    return int(max(0, min(100, score)))
