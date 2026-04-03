"""
Template helpers: build profile/audit context for Eliminate Repetitive Work features.
Cover letters, thank-you emails, follow-ups, LinkedIn outreach, resume tailoring.
"""

from __future__ import annotations

import os
import sys

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)


def get_profile_context_for_templates(email: str, max_chars: int = 8000) -> str:
    """
    Build a profile context string for template generation.
    Uses dilly_profile_txt when available; otherwise builds from profile + audit.
    """
    email = (email or "").strip().lower()
    if not email:
        return ""

    try:
        from projects.dilly.api.dilly_profile_txt import get_dilly_profile_txt_content
        content = get_dilly_profile_txt_content(email, max_chars=max_chars)
        if content and content.strip():
            return content.strip()
    except Exception:
        pass

    # Fallback: build from profile + audit
    try:
        from projects.dilly.api.profile_store import get_profile
        from projects.dilly.api.audit_history_pg import get_audits
        profile = get_profile(email) or {}
        audits = get_audits(email)
        latest = audits[0] if audits else {}

        lines = []
        name = (profile.get("name") or "").strip()
        if name:
            lines.append(f"Name: {name}")
        major = (profile.get("major") or "").strip()
        if major:
            lines.append(f"Major: {major}")
        majors = profile.get("majors")
        if isinstance(majors, list) and majors:
            lines.append(f"Majors: {', '.join(str(m) for m in majors if m)}")
        career_goal = (profile.get("career_goal") or "").strip()
        if career_goal:
            lines.append(f"Career goal: {career_goal}")
        app_target = (profile.get("application_target_label") or profile.get("application_target") or "").strip()
        if app_target:
            lines.append(f"Application target: {app_target}")

        if latest:
            scores = latest.get("scores") or {}
            s, g, b = scores.get("smart"), scores.get("grit"), scores.get("build")
            if s is not None and g is not None and b is not None:
                lines.append(f"Scores: Smart {s:.0f}, Grit {g:.0f}, Build {b:.0f}")
            track = (latest.get("detected_track") or "").strip()
            if track:
                lines.append(f"Track: {track}")
            take = (latest.get("dilly_take") or latest.get("meridian_take") or "").strip()
            if take:
                lines.append(f"Dilly take: {take}")
            findings = latest.get("audit_findings") or latest.get("findings") or []
            if isinstance(findings, list) and findings:
                lines.append("Top findings:")
                for f in findings[:6]:
                    if f and isinstance(f, str):
                        lines.append(f"- {f.strip()[:300]}")
            evidence = latest.get("evidence") or {}
            for dim in ("smart", "grit", "build"):
                if evidence.get(dim):
                    lines.append(f"{dim.capitalize()} evidence: {evidence[dim][:400]}")

        beyond = profile.get("beyond_resume") or []
        if isinstance(beyond, list) and beyond:
            people = [b.get("text") for b in beyond if isinstance(b, dict) and (b.get("type") or "").lower() == "person" and b.get("text")]
            companies = [b.get("text") for b in beyond if isinstance(b, dict) and (b.get("type") or "").lower() == "company" and b.get("text")]
            if people:
                lines.append(f"People mentioned: {', '.join(str(p) for p in people[:10])}")
            if companies:
                lines.append(f"Companies mentioned: {', '.join(str(c) for c in companies[:10])}")

        return "\n".join(lines)[:max_chars] if lines else ""
    except Exception:
        return ""
