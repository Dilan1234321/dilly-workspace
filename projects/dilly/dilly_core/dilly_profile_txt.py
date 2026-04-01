"""
Meridian Profile (full text): one structured .txt per user with details for job matching and resume improvement.

Sections: Identity, Resume, Audit, Goals, Deadlines, Job locations, Achievements, Transcript.
No chat logs or voice conversation history—only user details Meridian should use to match them to jobs and improve their resume.
Written to memory/dilly_profile_txt/{email}.txt. No length caps; keep each section concise.
"""

from __future__ import annotations

from typing import Any


def build_dilly_profile_txt(
    email: str,
    profile: dict[str, Any] | None = None,
    latest_audit: dict[str, Any] | None = None,
    resume_text: str | None = None,
) -> str:
    """
    Build the full Meridian profile text from profile dict, latest audit, and resume.
    Returns a single structured string with [SECTION] headers. Used for writing to {email}.txt.
    """
    profile = profile or {}
    latest_audit = latest_audit or {}
    lines: list[str] = []

    # ----- [IDENTITY] -----
    # Identity comes from user-set profile only; resume-parsed name/email/major/minors are not used here.
    lines.append("[IDENTITY]")
    name = (profile.get("name") or "").strip()
    if name:
        lines.append(f"Name: {name}")
    email_s = (email or profile.get("email") or "").strip().lower()
    if email_s:
        lines.append(f"Email: {email_s}")
    majors = profile.get("majors")
    if isinstance(majors, list) and majors:
        lines.append(f"Majors: {', '.join(str(m) for m in majors if m)}")
    minors = profile.get("minors")
    if isinstance(minors, list) and minors:
        lines.append(f"Minors: {', '.join(str(m) for m in minors if m)}")
    app_target = (profile.get("application_target") or latest_audit.get("application_target") or "").strip()
    if app_target:
        lines.append(f"Application target: {app_target.replace('_', ' ')}")
    career_goal = (profile.get("career_goal") or "").strip()
    if career_goal:
        lines.append(f"Career goal: {career_goal}")
    target = (profile.get("target_school") or profile.get("company") or "").strip()
    if target:
        lines.append(f"Target school/company: {target}")
    target_companies = profile.get("target_companies")
    if isinstance(target_companies, list) and target_companies:
        items = [str(x).strip() for x in target_companies[:15] if x and str(x).strip()]
        if items:
            lines.append(f"Target companies/industries: {', '.join(items)}")
    lines.append("")

    # ----- [RESUME] -----
    lines.append("[RESUME]")
    if resume_text and resume_text.strip():
        lines.append(resume_text.strip())
    else:
        lines.append("(No resume on file)")
    lines.append("")

    # ----- [AUDIT] -----
    lines.append("[AUDIT]")
    if latest_audit:
        scores = latest_audit.get("scores") or {}
        s, g, b = scores.get("smart"), scores.get("grit"), scores.get("build")
        if s is not None and g is not None and b is not None:
            lines.append(f"Latest: Smart {s:.0f}, Grit {g:.0f}, Build {b:.0f}")
        final = latest_audit.get("final_score")
        if final is not None:
            lines.append(f"Final score: {final:.0f}")
        track = (latest_audit.get("detected_track") or "").strip()
        if track:
            lines.append(f"Track: {track}")
        take = (latest_audit.get("dilly_take") or latest_audit.get("meridian_take") or "").strip()
        if take:
            lines.append(f"Dilly take: {take}")
        findings = latest_audit.get("audit_findings") or latest_audit.get("findings") or []
        if isinstance(findings, list) and findings:
            lines.append("Top findings:")
            for f in findings[:10]:
                if f and isinstance(f, str):
                    lines.append(f"- {f.strip()[:400]}")
        recs = latest_audit.get("recommendations") or []
        if isinstance(recs, list) and recs:
            lines.append("Recommendations:")
            for r in recs[:6]:
                if isinstance(r, dict):
                    t = (r.get("title") or r.get("action") or r.get("text") or "").strip()
                    if t:
                        lines.append(f"- {t[:300]}")
                elif isinstance(r, str) and r.strip():
                    lines.append(f"- {r.strip()[:300]}")
    else:
        lines.append("(No audit yet)")
    lines.append("")

    # ----- [GOALS] -----
    lines.append("[GOALS]")
    goals = profile.get("goals")
    had_goals = False
    if isinstance(goals, list) and goals:
        lines.append("Goals: " + ", ".join(str(g) for g in goals if g).replace("_", " "))
        had_goals = True
    if app_target:
        lines.append(f"Application target: {app_target.replace('_', ' ')}")
        had_goals = True
    if career_goal:
        lines.append(f"Career goal: {career_goal}")
        had_goals = True
    if not had_goals:
        lines.append("(None set)")
    lines.append("")

    # ----- [VOICE_CAPTURED] -----
    # Skills, tools, experiences the student told Meridian Voice that aren't on their resume.
    lines.append("[VOICE_CAPTURED]")
    beyond = profile.get("beyond_resume")
    expansion = profile.get("experience_expansion")
    had_voice = False
    if isinstance(beyond, list) and beyond:
        by_type: dict[str, list[str]] = {"skill": [], "experience": [], "project": [], "other": []}
        for item in beyond:
            if not isinstance(item, dict):
                continue
            t = (item.get("type") or "other").strip().lower()
            if t not in by_type:
                t = "other"
            text = (item.get("text") or "").strip()[:150]
            if text:
                by_type[t].append(text)
        if by_type["skill"]:
            lines.append("Skills (told Meridian): " + ", ".join(by_type["skill"][:25]))
            had_voice = True
        if by_type["project"]:
            lines.append("Projects (told Meridian): " + ", ".join(by_type["project"][:12]))
            had_voice = True
        if by_type["experience"]:
            lines.append("Experiences (told Meridian): " + ", ".join(by_type["experience"][:12]))
            had_voice = True
        if by_type["other"]:
            lines.append("Other (told Meridian): " + ", ".join(by_type["other"][:10]))
            had_voice = True
    if isinstance(expansion, list) and expansion:
        for entry in expansion[:10]:
            if not isinstance(entry, dict):
                continue
            role = (entry.get("role_label") or "").strip()
            org = (entry.get("organization") or "").strip()
            label = f"{role} at {org}" if org else role
            if not label:
                continue
            sub: list[str] = []
            skills = [(s or "").strip()[:80] for s in (entry.get("skills") or []) if (s or "").strip()][:12]
            tools = [(t or "").strip()[:80] for t in (entry.get("tools_used") or []) if (t or "").strip()][:12]
            omitted = [(o or "").strip()[:100] for o in (entry.get("omitted") or []) if (o or "").strip()][:6]
            if skills:
                sub.append("skills: " + ", ".join(skills))
            if tools:
                sub.append("tools: " + ", ".join(tools))
            if omitted:
                sub.append("left off resume: " + "; ".join(omitted))
            if sub:
                lines.append(f"- {label}: " + "; ".join(sub))
                had_voice = True
    if not had_voice:
        lines.append("(Nothing captured yet)")
    lines.append("")

    # ----- [DECISION_LOG] -----
    lines.append("[DECISION_LOG]")
    decision_log = profile.get("decision_log")
    if isinstance(decision_log, list) and decision_log:
        for entry in decision_log[:30]:
            if isinstance(entry, dict):
                text = (entry.get("text") or "").strip()
                if text:
                    t = (entry.get("type") or "learning").strip()
                    related = entry.get("related_to")
                    if isinstance(related, dict) and (related.get("company") or related.get("role")):
                        lines.append(f"- [{t}] {text[:300]} (re: {related.get('company') or ''} {related.get('role') or ''})")
                    else:
                        lines.append(f"- [{t}] {text[:300]}")
    else:
        lines.append("(None yet)")
    lines.append("")

    # ----- [DEADLINES] -----
    lines.append("[DEADLINES]")
    deadlines = profile.get("deadlines")
    if isinstance(deadlines, list) and deadlines:
        for d in deadlines:
            if isinstance(d, dict):
                label = (d.get("label") or "").strip()
                date = (d.get("date") or "").strip()
                if label or date:
                    lines.append(f"- {label or 'Deadline'}: {date}")
    else:
        lines.append("(None)")
    lines.append("")

    # ----- [JOB_LOCATIONS] -----
    lines.append("[JOB_LOCATIONS]")
    locs = profile.get("job_locations")
    scope = (profile.get("job_location_scope") or "").strip()
    if isinstance(locs, list) and locs:
        lines.append("Locations: " + ", ".join(str(x) for x in locs if x))
    if scope:
        lines.append(f"Scope: {scope}")
    if not (isinstance(locs, list) and locs) and not scope:
        lines.append("(None set)")
    lines.append("")

    # ----- [ACHIEVEMENTS] -----
    lines.append("[ACHIEVEMENTS]")
    achievements = profile.get("achievements")
    if isinstance(achievements, dict) and achievements:
        for ach_id, data in achievements.items():
            if ach_id and isinstance(data, dict):
                lines.append(f"- {ach_id.replace('_', ' ')} (unlocked)")
            elif ach_id:
                lines.append(f"- {ach_id.replace('_', ' ')}")
    else:
        lines.append("(None yet)")
    lines.append("")

    # ----- [TRANSCRIPT] -----
    lines.append("[TRANSCRIPT]")
    gpa = profile.get("transcript_gpa")
    bcpm = profile.get("transcript_bcpm_gpa")
    t_major = (profile.get("transcript_major") or "").strip()
    t_minor = (profile.get("transcript_minor") or "").strip()
    if gpa is not None:
        lines.append(f"GPA: {gpa}")
    if bcpm is not None:
        lines.append(f"BCPM GPA: {bcpm}")
    if t_major:
        lines.append(f"Major: {t_major}")
    if t_minor:
        lines.append(f"Minor: {t_minor}")
    courses = profile.get("transcript_courses")
    if isinstance(courses, list) and courses:
        lines.append("Courses:")
        for c in courses[:50]:
            if isinstance(c, dict):
                name = c.get("name") or c.get("course") or ""
                grade = c.get("grade") or c.get("grade_value")
                if name or grade is not None:
                    lines.append(f"  - {name}: {grade}")
            elif isinstance(c, str) and c.strip():
                lines.append(f"  - {c.strip()}")
    honors = profile.get("transcript_honors")
    if isinstance(honors, list) and honors:
        lines.append("Honors: " + ", ".join(str(h) for h in honors if h))
    if gpa is None and not (isinstance(courses, list) and courses) and not (isinstance(honors, list) and honors):
        lines.append("(No transcript uploaded)")
    lines.append("")

    return "\n".join(lines)
