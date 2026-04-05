"""
One-time script: seed profile_facts table from existing profile.json + audit + resume data.

Reads every user's profile.json, audits.json, and parsed resume text, then inserts
profile_facts rows so the My Dilly Profile screen is populated from day one.

Usage:
    cd /path/to/workspace
    python -m projects.dilly.api.scripts.seed_profile_facts [--dry-run]
"""

from __future__ import annotations

import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

PROFILES_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _facts_from_profile(prof: dict, email: str) -> list[dict]:
    """Extract facts from onboarding/profile data."""
    facts: list[dict] = []
    now = _now_iso()

    def add(cat: str, label: str, value: str, confidence: str = "high"):
        if not label.strip() or not value.strip():
            return
        facts.append({
            "id": str(uuid.uuid4()),
            "email": email,
            "category": cat,
            "label": label[:80],
            "value": value[:500],
            "source": "profile",
            "confidence": confidence,
            "action_type": None,
            "action_payload": None,
            "shown_to_user": False,
            "conv_id": None,
            "created_at": now,
            "updated_at": now,
        })

    # Major(s)
    majors = prof.get("majors") or ([prof.get("major")] if prof.get("major") else [])
    majors = [m for m in majors if m and m.strip() and m.strip().upper() not in ("N/A", "NA")]
    if majors:
        add("preference", "Major", ", ".join(majors))

    # Minor(s)
    minors = prof.get("minors") or ([prof.get("minor")] if prof.get("minor") else [])
    minors = [m for m in minors if m and m.strip() and m.strip().upper() not in ("N/A", "NA", "N", "A")]
    if minors:
        add("preference", "Minor", ", ".join(minors))

    # Pre-professional track
    pre_prof = prof.get("pre_professional_track") or prof.get("preProfessional")
    if isinstance(pre_prof, str) and pre_prof.strip() and pre_prof.strip().lower() not in ("none", "false", "n/a"):
        add("preference", "Pre-professional track", pre_prof.strip())
    elif pre_prof is True:
        track = prof.get("track", "")
        if "pre" in track.lower():
            add("preference", "Pre-professional track", track)

    # School
    school = prof.get("school_id") or prof.get("schoolId") or ""
    school_map = {"utampa": "University of Tampa"}
    school_name = school_map.get(school, school)
    if school_name:
        add("preference", "School", school_name)

    # Career goals
    goals = prof.get("goals") or []
    if isinstance(goals, list) and goals:
        goal_map = {
            "internship": "Find an internship",
            "full_time": "Find a full-time job",
            "gain_experience": "Gain professional experience",
            "improve_resume": "Improve resume",
            "network": "Build professional network",
            "grad_school": "Prepare for graduate school",
            "med_school": "Prepare for medical school",
            "law_school": "Prepare for law school",
        }
        for g in goals:
            text = goal_map.get(g, g) if isinstance(g, str) else str(g)
            if text:
                add("goal", text, text)

    career_goal = prof.get("career_goal") or ""
    if career_goal.strip():
        add("goal", "Career goal", career_goal.strip())

    # Target companies
    targets = prof.get("target_companies") or []
    if isinstance(targets, list):
        for t in targets[:5]:
            if isinstance(t, str) and t.strip():
                add("target_company", t.strip(), f"Target company: {t.strip()}")
    elif isinstance(targets, str) and targets.strip():
        add("target_company", targets.strip(), f"Target company: {targets.strip()}")

    # Application target
    app_target = prof.get("application_target") or ""
    if app_target.strip():
        add("preference", "Application target", app_target.strip())

    # Industry target
    industry = prof.get("industry_target") or ""
    if industry.strip():
        add("preference", "Industry target", industry.strip())

    # Job locations
    locations = prof.get("job_locations") or []
    if isinstance(locations, list) and locations:
        loc_str = ", ".join(str(l) for l in locations if l)
        if loc_str:
            add("availability", "Preferred locations", loc_str)

    # Interests
    interests = prof.get("interests") or []
    if isinstance(interests, list):
        for i in interests[:5]:
            if isinstance(i, str) and i.strip():
                add("hobby", i.strip(), f"Interest: {i.strip()}", confidence="medium")

    # Profile tagline/bio
    tagline = prof.get("profile_tagline") or ""
    if tagline.strip():
        add("personality", "Tagline", tagline.strip())

    bio = prof.get("profile_bio") or ""
    if bio.strip() and len(bio.strip()) > 10:
        add("personality", "Bio", bio.strip())

    # Track/cohort
    track = prof.get("track") or ""
    if track.strip():
        add("preference", "Career track", track.strip())

    return facts


def _facts_from_audit(audit: dict, email: str) -> list[dict]:
    """Extract facts from the latest audit (evidence, findings)."""
    facts: list[dict] = []
    now = _now_iso()

    def add(cat: str, label: str, value: str, confidence: str = "high"):
        if not label.strip() or not value.strip():
            return
        facts.append({
            "id": str(uuid.uuid4()),
            "email": email,
            "category": cat,
            "label": label[:80],
            "value": value[:500],
            "source": "audit",
            "confidence": confidence,
            "action_type": None,
            "action_payload": None,
            "shown_to_user": False,
            "conv_id": None,
            "created_at": now,
            "updated_at": now,
        })

    # Evidence summaries
    evidence = audit.get("evidence") or {}
    if isinstance(evidence, dict):
        for dim in ("smart", "grit", "build"):
            ev = evidence.get(dim, "")
            if ev and len(str(ev).strip()) > 20:
                add("strength", f"{dim.capitalize()} evidence", str(ev).strip())

    # Scores as strengths/weaknesses
    scores = audit.get("scores") or {}
    if isinstance(scores, dict):
        for dim in ("smart", "grit", "build"):
            score = scores.get(dim, 0)
            if score and float(score) >= 75:
                add("strength", f"Strong {dim.capitalize()} score", f"Scored {int(float(score))}/100 on {dim.capitalize()}")
            elif score and float(score) < 45:
                add("weakness", f"Low {dim.capitalize()} score", f"Scored {int(float(score))}/100 on {dim.capitalize()} — room to improve")

    # Dilly take / dilly take
    take = audit.get("dilly_take") or audit.get("meridian_take") or ""
    if take.strip() and len(take.strip()) > 20:
        add("personality", "Dilly's assessment", take.strip()[:500])

    return facts


def _facts_from_resume_txt(resume_txt: str, email: str) -> list[dict]:
    """Extract structured facts from the parsed resume text."""
    facts: list[dict] = []
    now = _now_iso()

    def add(cat: str, label: str, value: str, confidence: str = "high"):
        if not label.strip() or not value.strip():
            return
        facts.append({
            "id": str(uuid.uuid4()),
            "email": email,
            "category": cat,
            "label": label[:80],
            "value": value[:500],
            "source": "profile",
            "confidence": confidence,
            "action_type": None,
            "action_payload": None,
            "shown_to_user": False,
            "conv_id": None,
            "created_at": now,
            "updated_at": now,
        })

    if not resume_txt:
        return facts

    # Extract GPA
    gpa_match = re.search(r"GPA[:\s]*([\d.]+)", resume_txt, re.IGNORECASE)
    if gpa_match:
        add("achievement", "GPA", f"GPA: {gpa_match.group(1)}")

    # Extract companies/roles from [EXPERIENCE] or [RESEARCH] sections
    role_pattern = re.compile(r"Role:\s*(.+?)(?:\n|$)", re.IGNORECASE)
    company_pattern = re.compile(r"(?:Company|Lab|Institution|Organization):\s*(.+?)(?:\n|$)", re.IGNORECASE)

    roles = role_pattern.findall(resume_txt)
    companies = company_pattern.findall(resume_txt)

    for i, (role, company) in enumerate(zip(roles[:5], companies[:5])):
        role = role.strip()
        company = company.strip()
        if role and company:
            add("project_detail", f"{role} at {company}"[:80], f"Experience: {role} at {company}")

    # Extract skills section
    skills_match = re.search(r"\[SKILLS\](.*?)(?:\[|$)", resume_txt, re.DOTALL | re.IGNORECASE)
    if skills_match:
        skills_text = skills_match.group(1).strip()
        # Parse individual skills
        skill_items = re.findall(r"[-•]\s*(.+?)(?:\n|$)", skills_text)
        for item in skill_items[:8]:
            item = item.strip().rstrip(",.")
            if item and len(item) > 2:
                add("skill_unlisted", item[:80], item, confidence="high")

    # Extract honors/awards
    honors_match = re.search(r"Honors?:\s*(.+?)(?:\n|$)", resume_txt, re.IGNORECASE)
    if honors_match:
        honors = honors_match.group(1).strip()
        if honors and honors.upper() not in ("N/A", "NA", "NONE"):
            add("achievement", "Honors", honors)

    return facts


def seed_all(dry_run: bool = False):
    """Seed profile_facts for all existing users."""
    from projects.dilly.api.database import get_db

    if not os.path.isdir(PROFILES_DIR):
        print(f"No profiles directory at {PROFILES_DIR}")
        return

    uids = [d for d in os.listdir(PROFILES_DIR) if os.path.isdir(os.path.join(PROFILES_DIR, d))]
    print(f"Found {len(uids)} profile directories")

    total_facts = 0
    total_users = 0

    for uid in uids:
        profile_path = os.path.join(PROFILES_DIR, uid, "profile.json")
        if not os.path.isfile(profile_path):
            continue

        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                prof = json.load(f)
        except Exception:
            continue

        email = (prof.get("email") or "").strip().lower()
        if not email:
            continue

        all_facts: list[dict] = []

        # From profile
        all_facts.extend(_facts_from_profile(prof, email))

        # From audit
        audit_path = os.path.join(PROFILES_DIR, uid, "audits.json")
        if os.path.isfile(audit_path):
            try:
                with open(audit_path, "r", encoding="utf-8") as f:
                    audits = json.load(f)
                if audits and isinstance(audits, list):
                    all_facts.extend(_facts_from_audit(audits[0], email))
            except Exception:
                pass

        # From resume text
        try:
            from projects.dilly.api.dilly_profile_txt import get_dilly_profile_txt_content
            resume_txt = get_dilly_profile_txt_content(email, max_chars=6000) or ""
            all_facts.extend(_facts_from_resume_txt(resume_txt, email))
        except Exception:
            pass

        if not all_facts:
            continue

        if dry_run:
            print(f"  {email}: {len(all_facts)} facts (dry run)")
            for f in all_facts[:5]:
                print(f"    [{f['category']}] {f['label']}: {f['value'][:60]}")
            if len(all_facts) > 5:
                print(f"    ... and {len(all_facts) - 5} more")
            total_facts += len(all_facts)
            total_users += 1
            continue

        # Insert into PostgreSQL with ON CONFLICT to avoid dupes
        try:
            with get_db() as conn:
                cur = conn.cursor()
                for fact in all_facts:
                    cur.execute("""
                        INSERT INTO profile_facts (id, email, category, label, value, source, confidence, action_type, action_payload, shown_to_user, conv_id, created_at, updated_at)
                        VALUES (%s, LOWER(%s), %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s::timestamptz, %s::timestamptz)
                        ON CONFLICT (email, category, label) DO NOTHING
                    """, (
                        fact["id"], email, fact["category"], fact["label"], fact["value"],
                        fact["source"], fact["confidence"], fact.get("action_type"),
                        json.dumps(fact["action_payload"]) if fact.get("action_payload") else None,
                        fact.get("shown_to_user", False), fact.get("conv_id"),
                        fact["created_at"], fact["updated_at"],
                    ))
            total_facts += len(all_facts)
            total_users += 1
            print(f"  {email}: {len(all_facts)} facts inserted")
        except Exception as e:
            print(f"  {email}: ERROR — {e}")

    print(f"\nDone: {total_facts} facts for {total_users} users" + (" (dry run)" if dry_run else ""))


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    seed_all(dry_run=dry)
