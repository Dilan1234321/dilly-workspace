"""
Score-based anomaly detection: flag contradictions between academics and track-specific proof.
Voice: Dilly Hiring Manager (see MERIDIAN_HIRING_MANAGER.md).
E.g. high GPA + very low Build → High-Risk / Low-Velocity. Pure logic, no I/O.
"""

from typing import List, Dict, Any, Optional


def _flag(message: str) -> Dict[str, Any]:
    return {"message": message, "line": None}


def get_red_flags(
    gpa: Optional[float],
    scores: Dict[str, float],
    track: str,
) -> List[Dict[str, Any]]:
    """
    Return anomaly red-flag dicts (message + line=None) when score/GPA patterns suggest risk.
    Inputs: gpa from parsed.gpa, scores = {"smart", "grit", "build"}, track = result.track.
    Same shape as content red flags so the API can merge lists.
    """
    out: List[Dict[str, Any]] = []
    smart = scores.get("smart") or 0
    grit = scores.get("grit") or 0
    build = scores.get("build") or 0

    # High-Risk / Low-Velocity: strong academics, minimal track-specific proof
    if (gpa is not None and gpa >= 3.8 or smart >= 90) and build <= 10:
        out.append(_flag(
            "High-Risk / Low-Velocity: your academics look strong but we see almost no track-specific proof. "
            "A hiring manager will want to see concrete projects, roles, or outcomes. Add them so they see proof, not just potential."
        ))

    # High Smart, no Grit: looks sharp on paper but no leadership/ownership
    if smart >= 85 and grit <= 15:
        out.append(_flag(
            "You read as capable (Smart is strong) but we’re not seeing leadership or ownership. "
            "Consultants and hiring managers look for where you led, owned outcomes, or drove change. Add those roles and bullets."
        ))

    # All scores very low: resume may be incomplete or not tailored
    if smart <= 20 and grit <= 20 and build <= 20:
        out.append(_flag(
            "Scores are low across Smart, Grit, and Build. Usually that means the resume is too short, too generic, or missing evidence. "
            "Add bullets with outcomes, dates, and track-relevant experience so we can score you fairly and advisors can give you targeted next steps."
        ))

    return out
