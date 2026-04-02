"""
Profile, photo, transcript, account, parent invite, and public profile endpoints.
"""
import os
import re
import tempfile
import time
import sys

from fastapi import APIRouter, Body, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from projects.dilly.api import deps, errors
from projects.dilly.api.openapi_helpers import ERROR_RESPONSES

# Workspace root (api/routers/profile.py -> 4 levels up)
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

router = APIRouter(tags=["profile"])

_APPLICATION_TARGET_VALUES = frozenset({"internship", "full_time", "exploring"})
_PDF_MAGIC = b"%PDF-"


@router.get("/profile", responses=ERROR_RESPONSES)
async def get_profile(request: Request):
    """Get current user's profile (onboarding + app data). Creates default profile on first access."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists, get_profile_slug
        profile = ensure_profile_exists(email)
        profile["profile_slug"] = get_profile_slug(email)

        # Merge cohort scores from PostgreSQL
        try:
            import psycopg2, psycopg2.extras, json, os
            pw = os.environ.get("DILLY_DB_PASSWORD", "")
            if not pw:
                try: pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
                except: pass
            conn = psycopg2.connect(
                host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
                database="dilly", user="dilly_admin", password=pw, sslmode="require"
            )
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                "SELECT cohort_scores, overall_smart, overall_grit, overall_build, overall_dilly_score "
                "FROM students WHERE LOWER(email) = LOWER(%s)", (email,)
            )
            row = cur.fetchone()
            if row:
                cs = row["cohort_scores"]
                if isinstance(cs, str):
                    cs = json.loads(cs)
                profile["cohort_scores"] = cs or {}
                profile["overall_smart"] = float(row["overall_smart"]) if row["overall_smart"] else None
                profile["overall_grit"] = float(row["overall_grit"]) if row["overall_grit"] else None
                profile["overall_build"] = float(row["overall_build"]) if row["overall_build"] else None
                profile["overall_dilly_score"] = float(row["overall_dilly_score"]) if row["overall_dilly_score"] else None
            conn.close()
        except Exception:
            pass

        # Re-derive cohort from majors/track whenever the stored cohort is a legacy
        # short name (or missing).  This transparently upgrades existing users to the
        # unified 22-cohort system on their next login — no migration script needed.
        try:
            from projects.dilly.api.cohort_config import LEGACY_COHORT_ALIASES, assign_cohort
            stored_cohort = profile.get("cohort")
            if stored_cohort in LEGACY_COHORT_ALIASES or not stored_cohort:
                _majors = profile.get("majors") or (
                    [profile["major"]] if profile.get("major") else []
                )
                _pre_prof = profile.get("pre_professional_track") or profile.get("track")
                new_cohort = assign_cohort(_majors, _pre_prof)
                if new_cohort != stored_cohort:
                    from projects.dilly.api.profile_store import save_profile
                    save_profile(email, {"cohort": new_cohort})
                    profile["cohort"] = new_cohort
        except Exception:
            pass

        return profile
    except ValueError as e:
        raise errors.validation_error(str(e))
    except Exception:
        raise errors.internal("Could not load profile.")


def _score_page_response(request: Request, audit_id: str | None):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        from projects.dilly.api.score_page import ScorePageAuditNotFound, build_score_page_payload

        return build_score_page_payload(email, bool(user.get("subscribed")), audit_id)
    except ScorePageAuditNotFound:
        raise HTTPException(status_code=404, detail="Audit not found or has no score data.")
    except HTTPException:
        raise
    except Exception:
        raise errors.internal("Could not load score page.")


@router.get("/profile/score-page", responses=ERROR_RESPONSES)
async def get_score_page(request: Request, audit_id: str | None = None, uid: str | None = None):
    """
    Single payload for the Dilly My Score screen (/score).
    Optional `audit_id`: show scores as of that past audit (must belong to the user).
    Prefer GET `/profile/score-page/audit/{audit_id}` if query params are stripped by a proxy.
    `uid` ignored; session email is source of truth.
    """
    _ = uid  # legacy optional query param
    return _score_page_response(request, audit_id)


@router.get("/profile/score-page/audit/{audit_id}", responses=ERROR_RESPONSES)
async def get_score_page_for_audit(request: Request, audit_id: str):
    """Same as `/profile/score-page?audit_id=` — path form for reliable lookback."""
    return _score_page_response(request, audit_id)


@router.get("/profile/splash-state", responses=ERROR_RESPONSES)
async def get_profile_splash_state(request: Request, uid: str | None = None):
    """
    Dynamic copy for the app launch splash (authenticated students only).
    `uid` is ignored; session email is the source of truth.
    """
    _ = uid
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists
        from projects.dilly.api.splash_state import build_splash_state

        profile = ensure_profile_exists(email)
        return build_splash_state(email, profile, bool(user.get("subscribed")))
    except Exception:
        raise errors.internal("Could not load splash state.")


@router.patch("/profile")
async def update_profile(request: Request, body: dict = Body(...)):
    """Update current user's profile. Merges with existing. Only allowed fields are updated."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    allowed = {"schoolId", "major", "majors", "minors", "pre_professional_track", "preProfessional", "track", "cohort", "industry_target", "goals", "name", "application_target", "application_target_label", "career_goal", "deadlines", "leaderboard_opt_in", "target_school", "target_companies", "profile_background_color", "profile_tagline", "profile_bio", "linkedin_url", "voice_memory", "voice_avatar_index", "voice_save_to_profile", "job_locations", "job_location_scope", "achievements", "custom_tagline", "profile_theme", "voice_tone", "voice_notes", "share_card_achievements", "share_card_metric", "first_audit_snapshot", "first_application_at", "first_interview_at", "got_interview_at", "got_offer_at", "outcome_story_consent", "outcome_prompt_dismissed_at", "referral_code", "parent_email", "parent_milestone_opt_in", "voice_always_end_with_ask", "voice_max_recommendations", "voice_onboarding_done", "voice_onboarding_answers", "voice_biggest_concern", "experience_expansion", "beyond_resume", "nudge_preferences", "decision_log", "ritual_preferences", "dilly_profile_privacy", "dilly_profile_visible_to_recruiters", "pronouns", "push_token", "notification_prefs", "last_deep_dive_at", "weekly_review_day", "onboarding_complete", "has_run_first_audit", "interests", "education_level"}
    data = {k: v for k, v in (body or {}).items() if k in allowed}
    if "majors" in data:
        raw = data["majors"]
        items = (raw if isinstance(raw, list) else [raw]) if raw else []
        data["majors"] = [str(x).strip() for x in items if str(x).strip()]
        # Keep legacy major column in sync with majors[0] for backward compatibility
        if data["majors"] and "major" not in data:
            data["major"] = data["majors"][0]
    if "pre_professional_track" in data:
        _valid_pre_prof = {
            "Pre-Med", "Pre-Law", "Pre-Business", "Pre-Dental", "Pre-Pharmacy",
            "Pre-Veterinary", "Pre-Vet", "Pre-Physical Therapy", "Pre-PT",
            "Pre-Occupational Therapy", "Pre-OT", "Pre-Physician Assistant", "Pre-PA",
            "None / Not applicable",
        }
        val = data["pre_professional_track"]
        if val is None or val == "" or val == "None / Not applicable":
            data["pre_professional_track"] = None
        elif str(val).strip() in _valid_pre_prof:
            data["pre_professional_track"] = str(val).strip()
        else:
            data.pop("pre_professional_track", None)
    # Normalize industry_target
    if "industry_target" in data:
        val = data["industry_target"]
        data["industry_target"] = str(val).strip() if val and str(val).strip() else None
    # Auto-assign cohort if not explicitly provided but majors/pre_professional_track changed
    if "cohort" not in data and ("majors" in data or "pre_professional_track" in data or "industry_target" in data):
        try:
            from projects.dilly.api.cohort_config import assign_cohort
            _majors = data.get("majors") or ([data["major"]] if data.get("major") else [])
            _pre_prof = data.get("pre_professional_track")
            _ind = data.get("industry_target")
            data["cohort"] = assign_cohort(_majors, _pre_prof, _ind)
        except Exception:
            pass
    if "minors" in data:
        raw = data["minors"]
        items = (raw if isinstance(raw, list) else [raw]) if raw else []
        # Skip N/A, NA, and fragments from "N/A" split by / (e.g. ["N","A"])
        _empty_minor = frozenset({"", "N/A", "NA", "N", "A", "NONE"})
        data["minors"] = [str(x).strip() for x in items if str(x).strip() and str(x).strip().upper() not in _empty_minor]
    if "voice_memory" in data:
        raw = data["voice_memory"]
        arr = (raw if isinstance(raw, list) else []) if raw else []
        data["voice_memory"] = [str(x)[:300].strip() for x in arr if str(x).strip()][-10:]
    if data.get("application_target") is not None and data.get("application_target") not in _APPLICATION_TARGET_VALUES:
        raise errors.validation_error("application_target must be one of: internship, full_time, exploring")
    if "job_location_scope" in data and data["job_location_scope"] is not None and data["job_location_scope"] not in ("specific", "domestic", "international"):
        raise errors.validation_error("job_location_scope must be one of: specific, domestic, international")
    if "linkedin_url" in data:
        val = data.get("linkedin_url")
        if val is None or (isinstance(val, str) and not val.strip()):
            data["linkedin_url"] = None
        else:
            url = str(val).strip()
            linkedin_re = re.compile(r"^(https?://)?(www\.)?linkedin\.com/in/[\w\-]+/?$", re.IGNORECASE)
            if not linkedin_re.match(url):
                raise errors.validation_error("LinkedIn URL must be a valid profile link (e.g. https://linkedin.com/in/username)")
            data["linkedin_url"] = url
    if "job_locations" in data:
        raw = data["job_locations"]
        items = (raw if isinstance(raw, list) else [raw]) if raw else []
        data["job_locations"] = [str(x).strip() for x in items if str(x).strip()][:20]
    if "target_companies" in data:
        raw = data["target_companies"]
        items = (raw if isinstance(raw, list) else [raw]) if raw else []
        data["target_companies"] = [str(x).strip()[:120] for x in items if str(x).strip()][:15]
    if "voice_avatar_index" in data:
        v = data["voice_avatar_index"]
        if v is None:
            data["voice_avatar_index"] = None
        elif isinstance(v, int) and 0 <= v <= 33:
            data["voice_avatar_index"] = v
        else:
            data.pop("voice_avatar_index", None)
    if "voice_save_to_profile" in data:
        data["voice_save_to_profile"] = bool(data["voice_save_to_profile"])
    if "share_card_achievements" in data:
        raw = data["share_card_achievements"]
        arr = (raw if isinstance(raw, list) else [raw]) if raw else []
        data["share_card_achievements"] = [str(x).strip() for x in arr if str(x).strip()][:3]
    if "share_card_metric" in data and data["share_card_metric"] is not None:
        m = str(data["share_card_metric"]).strip().lower()
        data["share_card_metric"] = m if m in ("smart", "grit", "build", "mts", "ats") else None
    if "voice_tone" in data and data["voice_tone"] is not None:
        vt = str(data["voice_tone"]).strip().lower()
        if vt not in ("encouraging", "direct", "casual", "professional", "coach"):
            data.pop("voice_tone", None)
        else:
            data["voice_tone"] = vt
    if "profile_theme" in data and data["profile_theme"] is not None:
        pt = str(data["profile_theme"]).strip().lower()
        if pt not in ("professional", "bold", "minimal", "warm", "high_contrast"):
            data.pop("profile_theme", None)
        else:
            data["profile_theme"] = pt
    if "voice_notes" in data:
        raw = data["voice_notes"]
        arr = (raw if isinstance(raw, list) else [raw]) if raw else []
        data["voice_notes"] = [str(x)[:500].strip() for x in arr if str(x).strip()][-20:]
    if "push_token" in data:
        value = data.get("push_token")
        token = None if value is None else str(value).strip()
        data["push_token"] = token or None
    if "notification_prefs" in data:
        raw = data["notification_prefs"]
        if isinstance(raw, dict):
            from projects.dilly.api.notification_store import normalize_preferences
            data["notification_prefs"] = normalize_preferences(raw)
        else:
            data.pop("notification_prefs", None)
    if "last_deep_dive_at" in data:
        value = data.get("last_deep_dive_at")
        if value is None:
            data["last_deep_dive_at"] = None
        else:
            s = str(value).strip()
            data["last_deep_dive_at"] = s or None
    if "weekly_review_day" in data:
        try:
            day = int(data.get("weekly_review_day"))
            data["weekly_review_day"] = max(0, min(6, day))
        except (TypeError, ValueError):
            data["weekly_review_day"] = 0
    if "voice_always_end_with_ask" in data:
        data["voice_always_end_with_ask"] = bool(data["voice_always_end_with_ask"])
    if "voice_max_recommendations" in data:
        v = data["voice_max_recommendations"]
        try:
            n = int(v) if v is not None else 2
            data["voice_max_recommendations"] = max(1, min(3, n))
        except (TypeError, ValueError):
            data["voice_max_recommendations"] = 2
    if "nudge_preferences" in data:
        raw = data["nudge_preferences"]
        if isinstance(raw, dict):
            valid_keys = {"deadline_nudges", "app_funnel_nudges", "relationship_nudges", "seasonal_nudges", "score_nudges"}
            data["nudge_preferences"] = {k: bool(v) for k, v in raw.items() if k in valid_keys}
        else:
            data.pop("nudge_preferences", None)
    if "parent_email" in data:
        v = data["parent_email"]
        data["parent_email"] = None if v is None else ((v if isinstance(v, str) else str(v)).strip().lower() or None)
    if "parent_milestone_opt_in" in data:
        data["parent_milestone_opt_in"] = bool(data["parent_milestone_opt_in"])
    if "ritual_preferences" in data:
        raw = data["ritual_preferences"]
        if isinstance(raw, dict):
            from projects.dilly.api.profile_store import get_profile
            existing_prefs = (get_profile(email) or {}).get("ritual_preferences") or {}
            if not isinstance(existing_prefs, dict):
                existing_prefs = {}
            out = dict(existing_prefs)
            if "weekly_review_day" in raw:
                v = raw["weekly_review_day"]
                out["weekly_review_day"] = v if isinstance(v, int) and 0 <= v <= 6 else 6
            if "rituals_enabled" in raw:
                out["rituals_enabled"] = bool(raw["rituals_enabled"])
            data["ritual_preferences"] = out
        else:
            data.pop("ritual_preferences", None)
    if "experience_expansion" in data:
        raw = data["experience_expansion"]
        arr = (raw if isinstance(raw, list) else [raw]) if raw else []
        out = []
        for i, item in enumerate(arr[:30]):
            if not isinstance(item, dict):
                continue
            role = (item.get("role_label") or item.get("role") or "").strip()[:120]
            if not role:
                continue
            org = (item.get("organization") or item.get("org") or "").strip()[:120]
            skills = [str(x).strip()[:100] for x in (item.get("skills") or []) if str(x).strip()][:25]
            tools_used = [str(x).strip()[:100] for x in (item.get("tools_used") or item.get("tools") or []) if str(x).strip()][:25]
            omitted = [str(x).strip()[:200] for x in (item.get("omitted") or []) if str(x).strip()][:15]
            out.append({"role_label": role, "organization": org or None, "skills": skills, "tools_used": tools_used, "omitted": omitted})
        data["experience_expansion"] = out
    if "beyond_resume" in data:
        raw = data["beyond_resume"]
        arr = (raw if isinstance(raw, list) else [raw]) if raw else []
        out = []
        for item in arr[:50]:
            if not isinstance(item, dict):
                continue
            t = (item.get("type") or "other").strip().lower()
            valid = ("skill", "experience", "project", "person", "company", "event", "emotion", "other")
            if t not in valid:
                t = "other"
            text = (item.get("text") or "").strip()[:500]
            if not text:
                continue
            captured_at = item.get("captured_at")
            if captured_at is not None and not isinstance(captured_at, str):
                captured_at = None
            out.append({"type": t, "text": text, "captured_at": captured_at})
        data["beyond_resume"] = out
    if "decision_log" in data:
        raw = data["decision_log"]
        arr = (raw if isinstance(raw, list) else [raw]) if raw else []
        out = []
        for item in arr[:100]:
            if not isinstance(item, dict):
                continue
            text = (item.get("text") or "").strip()[:1000]
            if not text:
                continue
            t = (item.get("type") or "learning").strip().lower()
            if t not in ("decision", "learning"):
                t = "learning"
            related = item.get("related_to")
            if related and isinstance(related, dict):
                related = {"company": (related.get("company") or "").strip()[:100], "role": (related.get("role") or "").strip()[:100]}
            else:
                related = {}
            out.append({"id": item.get("id") or "", "text": text, "type": t, "related_to": related, "ts": item.get("ts")})
        data["decision_log"] = out
    if "dilly_profile_privacy" in data:
        raw = data["dilly_profile_privacy"]
        if isinstance(raw, dict):
            valid_keys = {"scores", "activity", "applications", "experience"}
            data["dilly_profile_privacy"] = {k: bool(v) for k, v in raw.items() if k in valid_keys}
        else:
            data.pop("dilly_profile_privacy", None)
    if "dilly_profile_visible_to_recruiters" in data:
        data["dilly_profile_visible_to_recruiters"] = bool(data["dilly_profile_visible_to_recruiters"])
    if not data:
        from projects.dilly.api.profile_store import get_profile as get_prof, get_profile_slug
        p = get_prof(email) or {}
        p["profile_slug"] = get_profile_slug(email)
        return p
    try:
        from projects.dilly.api.profile_store import save_profile, get_profile_slug
        p = save_profile(email, data)
        if p:
            p["profile_slug"] = get_profile_slug(email)
        try:
            from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
            write_dilly_profile_txt(email)
        except Exception:
            pass
        try:
            from projects.dilly.api.candidate_index import index_candidate_after_audit
            from projects.dilly.api.audit_history import get_audits
            audits = get_audits(email)
            latest_audit = audits[0] if audits else {}
            index_candidate_after_audit(email, profile=p, audit=latest_audit, resume_text=None)
        except Exception:
            pass
        # Sync all profile fields to the students table whenever relevant fields are patched.
        # Rules: never touch score columns here — scores are owned by audit.py.
        _SYNC_TRIGGER = frozenset({"name", "majors", "minors", "goals", "industry_target",
                                    "onboarding_complete", "has_run_first_audit",
                                    "pre_professional_track", "application_target"})
        if any(f in data for f in _SYNC_TRIGGER):
            try:
                import psycopg2, json as _json
                _pw = os.environ.get("DILLY_DB_PASSWORD", "")
                if not _pw:
                    try: _pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
                    except: pass
                _conn = psycopg2.connect(
                    host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
                    database="dilly", user="dilly_admin", password=_pw, sslmode="require"
                )
                _cur = _conn.cursor()
                _prof = p or {}
                _name = _prof.get("name") or _prof.get("full_name") or ""
                _name_parts = _name.strip().split(None, 1)
                _first = _name_parts[0] if _name_parts else ""
                _last = _name_parts[1] if len(_name_parts) > 1 else ""
                _majors = _prof.get("majors") or []
                _major = _majors[0] if _majors else None
                _minors = _prof.get("minors") or []
                _goals     = _prof.get("goals") or []
                _interests = _prof.get("interests") or []   # separate field — was incorrectly using _goals
                _industry = _prof.get("industry_target") or None
                _track = _prof.get("pre_professional_track") or None
                _career_goal = _prof.get("application_target") or None
                _ob_complete = bool(_prof.get("onboarding_complete")) if "onboarding_complete" in _prof else None
                _has_audit = bool(_prof.get("has_run_first_audit")) if "has_run_first_audit" in _prof else None
                try:
                    from projects.dilly.api.schools import get_school_from_email as _gse
                    _si = _gse(email) or {}
                    _school = _si.get("name") or ""
                    _school_id = _si.get("id") or ""
                except Exception:
                    _school = ""; _school_id = ""
                _cur.execute(
                    """INSERT INTO students (
                           email, name, first_name, last_name,
                           school, school_id, major, majors, minors,
                           interests, track, industry_target, career_goal,
                           onboarding_complete, has_run_first_audit
                       ) VALUES (
                           %s, %s, %s, %s,
                           %s, %s, %s, %s, %s,
                           %s, %s, %s, %s,
                           %s, %s
                       )
                       ON CONFLICT (email) DO UPDATE SET
                           name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE students.name END,
                           first_name = CASE WHEN EXCLUDED.first_name <> '' THEN EXCLUDED.first_name ELSE students.first_name END,
                           last_name = CASE WHEN EXCLUDED.last_name <> '' THEN EXCLUDED.last_name ELSE students.last_name END,
                           school = CASE WHEN EXCLUDED.school <> '' THEN EXCLUDED.school ELSE students.school END,
                           school_id = CASE WHEN EXCLUDED.school_id <> '' THEN EXCLUDED.school_id ELSE students.school_id END,
                           major = COALESCE(EXCLUDED.major, students.major),
                           majors = COALESCE(EXCLUDED.majors, students.majors),
                           minors = COALESCE(EXCLUDED.minors, students.minors),
                           interests = COALESCE(EXCLUDED.interests, students.interests),
                           track = COALESCE(EXCLUDED.track, students.track),
                           industry_target = COALESCE(EXCLUDED.industry_target, students.industry_target),
                           career_goal = COALESCE(EXCLUDED.career_goal, students.career_goal),
                           onboarding_complete = COALESCE(EXCLUDED.onboarding_complete, students.onboarding_complete),
                           has_run_first_audit = COALESCE(EXCLUDED.has_run_first_audit, students.has_run_first_audit)""",
                    (
                        email, _name, _first, _last,
                        _school, _school_id, _major,
                        _json.dumps(_majors)     if _majors     else None,
                        _json.dumps(_minors)     if _minors     else None,
                        _json.dumps(_interests)  if _interests  else None,  # was _goals — wrong field
                        _track, _industry, _career_goal,
                        _ob_complete, _has_audit,
                    )
                )
                _conn.commit()
                _conn.close()
            except Exception:
                pass
        return p
    except ValueError as e:
        raise errors.validation_error(str(e))
    except Exception:
        raise errors.internal("Could not save profile.")


@router.post("/profile/photo")
async def upload_profile_photo(request: Request, file: UploadFile = File(...)):
    """Upload profile photo. Accepts image/jpeg, image/png, image/webp, image/gif. Replaces any existing photo."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    ct = (file.content_type or "").lower()
    if not any(x in ct for x in ("image/jpeg", "image/png", "image/webp", "image/gif")):
        raise errors.validation_error( "Profile photo must be JPEG, PNG, WebP, or GIF.")
    try:
        from projects.dilly.api.profile_store import save_profile_photo, get_profile_folder_path
        folder = get_profile_folder_path(email)
        if not folder:
            raise errors.validation_error( "Invalid profile.")
        os.makedirs(folder, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=folder, suffix=os.path.splitext(file.filename or ".jpg")[1] or ".jpg")
        try:
            with os.fdopen(fd, "wb") as f:
                content = await file.read()
                if len(content) > 5 * 1024 * 1024:
                    raise errors.validation_error( "Photo must be under 5MB.")
                f.write(content)
            save_profile_photo(email, tmp, ct)
        finally:
            try:
                os.unlink(tmp)
            except OSError:
                pass
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        raise errors.internal( "Could not save photo.")


@router.get("/profile/photo")
async def get_profile_photo(request: Request):
    """Serve current user's profile photo. 404 if none. No-cache to prevent cross-user leakage."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    from projects.dilly.api.profile_store import get_profile_photo_path
    path = get_profile_photo_path(email)
    if not path or not os.path.isfile(path):
        raise errors.not_found( "No profile photo.")
    ext = os.path.splitext(path)[1].lower()
    media = {".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}.get(ext, "image/jpeg")
    return FileResponse(
        path,
        media_type=media,
        headers={"Cache-Control": "no-store, no-cache, private, max-age=0"},
    )


@router.post("/profile/transcript")
async def upload_profile_transcript(request: Request, file: UploadFile = File(...)):
    """Upload transcript (PDF). Validates file type and size; parses GPA, courses, honors. Replaces any existing transcript."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized( "Sign in required.")
    fn = (file.filename or "").lower()
    if not fn.endswith(".pdf"):
        raise errors.validation_error( "Transcript must be a PDF file.")
    try:
        from projects.dilly.api.profile_store import (
            get_profile_folder_path,
            save_transcript_file,
            save_profile,
            ensure_profile_exists,
        )
        from dilly_core.transcript_parser import parse_transcript_pdf, TranscriptParseResult
    except ImportError:
        raise errors.internal( "Transcript processing unavailable.")
    ensure_profile_exists(email)
    folder = get_profile_folder_path(email)
    if not folder:
        raise errors.validation_error( "Invalid profile.")
    os.makedirs(folder, exist_ok=True)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise errors.validation_error( "Transcript must be under 10MB.")
    if not content.startswith(_PDF_MAGIC):
        raise errors.validation_error( "File is not a valid PDF. Upload an official transcript PDF.")
    fd, temp_path = tempfile.mkstemp(dir=folder, suffix=".pdf")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)
        result: TranscriptParseResult = parse_transcript_pdf(temp_path)
        save_transcript_file(email, temp_path, ".pdf")
        payload = {
            "transcript_uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "transcript_gpa": result.gpa,
            "transcript_bcpm_gpa": result.bcpm_gpa,
            "transcript_courses": result.to_dict().get("courses", []),
            "transcript_honors": result.honors,
            "transcript_major": result.major,
            "transcript_minor": result.minor,
            "transcript_warnings": getattr(result, "warnings", []) or [],
        }
        save_profile(email, payload)
        try:
            from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
            write_dilly_profile_txt(email)
        except Exception:
            pass
        return {
            "ok": True,
            "transcript": {
                "gpa": result.gpa,
                "bcpm_gpa": result.bcpm_gpa,
                "courses_count": len(result.courses),
                "honors": result.honors,
                "major": result.major,
                "minor": result.minor,
                "warnings": getattr(result, "warnings", []),
            },
        }
    finally:
        if os.path.isfile(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


@router.delete("/profile/transcript")
async def delete_profile_transcript_endpoint(request: Request):
    """Remove current user's transcript and clear transcript data from profile."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized( "Sign in required.")
    try:
        from projects.dilly.api.profile_store import delete_transcript
        deleted = delete_transcript(email)
        if deleted:
            try:
                from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
                write_dilly_profile_txt(email)
            except Exception:
                pass
        return {"ok": True, "deleted": deleted}
    except Exception:
        raise errors.internal( "Could not delete transcript.")


@router.delete("/profile/photo")
async def delete_profile_photo_endpoint(request: Request):
    """Remove current user's profile photo."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    from projects.dilly.api.profile_store import delete_profile_photo
    delete_profile_photo(email)
    return {"ok": True}


@router.post("/account/delete")
async def delete_account(request: Request):
    """
    Permanently delete the current user's account. Wipes EVERYTHING:
    - Profile folder (profile.json, audits.json, applications, resume, photos)
    - PostgreSQL: profile_facts, students row
    - Parsed resume text files
    - Auth: user record + all sessions
    This is irreversible. The user is gone.
    """
    import traceback
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.validation_error("Email required.")

    # 1. Delete profile folder (profile.json, audits, applications, photos, resume)
    from projects.dilly.api.profile_store import delete_account_data
    delete_account_data(email)

    # 2. Delete from PostgreSQL (profile_facts, students, push_tokens)
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM profile_facts WHERE LOWER(email) = LOWER(%s)", (email,))
            cur.execute("DELETE FROM students WHERE LOWER(email) = LOWER(%s)", (email,))
            try:
                cur.execute("DELETE FROM push_tokens WHERE LOWER(email) = LOWER(%s)", (email,))
            except Exception:
                pass
    except Exception:
        traceback.print_exc()

    # 3. Delete parsed resume text files
    try:
        _WS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
        safe_email = email.replace("/", "_").replace("\\", "_")
        txt_path = os.path.join(_WS, "memory", "dilly_profile_txt", f"{safe_email}.txt")
        if os.path.isfile(txt_path):
            os.remove(txt_path)
        parsed_dir = os.path.join(_WS, "projects", "dilly", "parsed_resumes")
        if os.path.isdir(parsed_dir):
            for f in os.listdir(parsed_dir):
                if email in f.lower():
                    try:
                        os.remove(os.path.join(parsed_dir, f))
                    except Exception:
                        pass
    except Exception:
        traceback.print_exc()

    # 4. Delete auth: user record + all sessions
    from projects.dilly.api.auth_store import delete_user_and_sessions
    delete_user_and_sessions(email)

    return {"ok": True, "deleted": email}


@router.post("/profile/parent-invite")
async def create_parent_invite(request: Request):
    """Generate or return existing parent invite token. Returns invite_link for read-only parent dashboard. Requires sign-in."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.validation_error( "Email required.")
    try:
        from projects.dilly.api.profile_store import ensure_parent_invite_token
        token = ensure_parent_invite_token(email)
    except ValueError as e:
        raise errors.validation_error( detail=str(e))
    base = str(request.base_url).rstrip("/")
    app_base = base.replace("/api", "").rstrip("/") or base
    invite_link = f"{app_base}/parent?token={token}"
    return {"token": token, "invite_link": invite_link}


@router.get("/parent/summary")
async def parent_summary(token: str = ""):
    """Read-only parent view: student name, track, last audit date, scores, on_track. No auth; token is the only auth."""
    if not (token or "").strip():
        raise errors.validation_error( "token required.")
    from projects.dilly.api.profile_store import get_email_by_parent_invite_token, get_profile
    from projects.dilly.api.audit_history import get_audits
    student_email = get_email_by_parent_invite_token(token.strip())
    if not student_email:
        raise errors.not_found( "Invalid or expired link.")
    profile = get_profile(student_email)
    if not profile:
        raise errors.not_found( "Profile not found.")
    audits = get_audits(student_email)
    latest = audits[0] if audits else None
    scores = (latest.get("scores") or {}) if latest else {}
    smart = scores.get("smart")
    grit = scores.get("grit")
    build = scores.get("build")
    on_track = None
    if smart is not None and grit is not None and build is not None:
        on_track = (smart >= 50 and grit >= 50 and build >= 50)
    return {
        "student_name": profile.get("name") or (latest.get("candidate_name") if latest else None) or "Your student",
        "track": profile.get("track") or (latest.get("detected_track") if latest else None),
        "school_id": profile.get("schoolId"),
        "last_audit_at": latest.get("ts") if latest else None,
        "last_scores": scores if scores else None,
        "on_track": on_track,
        "peer_percentiles": (latest.get("peer_percentiles") or {}) if latest else {},
    }


@router.get("/profile/dilly")
async def get_dilly_profile(request: Request):
    """Full Dilly profile (aggregated). Auth required. For student self-view."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    try:
        from projects.dilly.api.dilly_profile_aggregator import aggregate_dilly_profile
        return aggregate_dilly_profile(email, for_recruiter=False)
    except Exception:
        raise errors.internal("Could not load Dilly profile.")


@router.get("/profile/public/{slug}/dilly")
async def get_public_dilly_profile(slug: str):
    """Public full Dilly profile. No auth. Respects privacy toggles. Shareable link."""
    from projects.dilly.api.profile_store import get_profile_by_slug
    profile = get_profile_by_slug(slug)
    if not profile:
        raise errors.not_found("Profile not found.")
    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise errors.not_found("Profile not found.")
    try:
        from projects.dilly.api.dilly_profile_aggregator import aggregate_dilly_profile
        data = aggregate_dilly_profile(email, for_recruiter=True)
        return JSONResponse(
            content=data,
            headers={"Cache-Control": "no-store, no-cache, private, max-age=0"},
        )
    except Exception:
        raise errors.internal("Could not load Dilly profile.")


@router.get("/profile/public/{slug}")
async def get_public_profile(slug: str):
    """Public Six-second profile data. No auth. Built dynamically from profile + latest audit. No-cache."""
    from projects.dilly.api.profile_store import get_profile_by_slug
    from projects.dilly.api.audit_history import get_audits
    from projects.dilly.api.schools import get_school_from_email, SCHOOLS
    profile = get_profile_by_slug(slug)
    if not profile:
        raise errors.not_found( "Profile not found.")
    email = profile.get("email") or ""
    audits = get_audits(email)
    latest = audits[0] if audits else None
    school_id = (profile.get("schoolId") or "").strip().lower()
    school_config = SCHOOLS.get(school_id) if school_id else get_school_from_email(email)
    school_name = school_config.get("name") if school_config else None
    school_short_name = school_config.get("short_name") if school_config else None
    majors_list = profile.get("majors") or []
    if not majors_list and profile.get("major"):
        majors_list = [profile.get("major")]
    if not majors_list and latest:
        audit_major = (latest.get("major") or "").strip()
        if audit_major:
            majors_list = [audit_major]
    out = {
        "name": profile.get("name") or (latest.get("candidate_name") if latest else None),
        "track": profile.get("track") or (latest.get("detected_track") if latest else None),
        "career_goal": profile.get("career_goal"),
        "profile_slug": slug,
        "linkedin_url": (profile.get("linkedin_url") or "").strip() or None,
        "profile_background_color": profile.get("profile_background_color") or "#0f172a",
        "profile_tagline": profile.get("profile_tagline"),
        "profile_bio": profile.get("profile_bio"),
        "school_name": school_name,
        "school_short_name": school_short_name,
        "majors": majors_list if majors_list else None,
        "scores": latest.get("scores") if latest else None,
        "final_score": latest.get("final_score") if latest else None,
        "audit_findings": latest.get("audit_findings") if latest else None,
        "evidence": latest.get("evidence") if latest else None,
        "evidence_quotes": latest.get("evidence_quotes") if latest else None,
        "candidate_name": latest.get("candidate_name") if latest else None,
        "detected_track": latest.get("detected_track") if latest else None,
        "peer_percentiles": latest.get("peer_percentiles") if latest else None,
        "dilly_take": (latest.get("dilly_take") or latest.get("meridian_take")) if latest else None,
        "strongest_signal_sentence": latest.get("strongest_signal_sentence") if latest else None,
        "share_card_achievements": (profile.get("share_card_achievements") or [])[:3],
    }
    return JSONResponse(
        content=out,
        headers={"Cache-Control": "no-store, no-cache, private, max-age=0"},
    )


@router.get("/profile/public/{slug}/photo")
async def get_public_profile_photo(slug: str):
    """Serve profile photo for public profile. No auth."""
    from projects.dilly.api.profile_store import get_profile_photo_path_by_slug
    path = get_profile_photo_path_by_slug(slug)
    if not path or not os.path.isfile(path):
        raise errors.not_found( "No photo.")
    ext = os.path.splitext(path)[1].lower()
    media = {".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}.get(ext, "image/jpeg")
    mtime = int(os.path.getmtime(path))
    return FileResponse(
        path,
        media_type=media,
        headers={
            "Cache-Control": "public, max-age=60",
            "ETag": f'"{mtime}"',
        },
    )


# ---------------------------------------------------------------------------
# Streak + Daily Check-In
# ---------------------------------------------------------------------------

_DAILY_ACTIONS = [
    {"id": "view_score", "label": "Check your scores", "action": "center"},
    {"id": "edit_bullet", "label": "Improve one resume bullet", "action": "edit_resume"},
    {"id": "ats_scan", "label": "Run an ATS scan", "action": "ats"},
    {"id": "voice_prep", "label": "Ask Dilly for one tip", "action": "voice"},
    {"id": "view_jobs", "label": "Browse job matches", "action": "jobs"},
    {"id": "run_audit", "label": "Upload an updated resume", "action": "upload"},
    {"id": "add_deadline", "label": "Add an application deadline", "action": "calendar"},
]


@router.post("/streak/checkin")
async def streak_checkin(request: Request):
    """
    Record a daily check-in for the current user.
    Returns current streak, whether today was already counted, and the daily micro-action.
    """
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile, save_profile
    import datetime, hashlib, random

    profile = get_profile(email) or {}
    today = datetime.date.today().isoformat()  # e.g. "2026-03-17"

    streak_data = profile.get("streak") or {}
    last_checkin = streak_data.get("last_checkin")  # ISO date string
    current_streak = streak_data.get("current_streak", 0)
    longest_streak = streak_data.get("longest_streak", 0)
    already_checked_in = last_checkin == today

    if not already_checked_in:
        # Determine if consecutive day or reset
        yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        if last_checkin == yesterday:
            current_streak += 1
        elif last_checkin is None:
            current_streak = 1
        else:
            # Missed a day — reset
            current_streak = 1
        longest_streak = max(longest_streak, current_streak)
        streak_data = {
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "last_checkin": today,
        }
        try:
            save_profile(email, {"streak": streak_data})
        except Exception:
            pass

    # Pick a daily action deterministically from the date so everyone sees the same one each day
    day_seed = int(hashlib.md5(today.encode()).hexdigest(), 16) % len(_DAILY_ACTIONS)
    daily_action = _DAILY_ACTIONS[day_seed]

    return {
        "streak": current_streak,
        "longest_streak": longest_streak,
        "already_checked_in": already_checked_in,
        "today": today,
        "daily_action": daily_action,
    }


@router.get("/profile/export")
async def export_profile_data(request: Request):
    """
    Download all your Dilly data as JSON.
    Includes: profile, audits, applications, deadlines, resume text.
    Usable export so you feel in control. No data dump.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile, get_profile_folder_path
    from projects.dilly.api.audit_history import get_audits
    from projects.dilly.api.resume_loader import load_parsed_resume_for_voice

    profile = get_profile(email) or {}
    # Sanitize: remove internal tokens (keep referral_code for user's own link)
    export_profile = {k: v for k, v in profile.items() if k != "parent_invite_token"}

    audits = get_audits(email)
    deadlines = profile.get("deadlines") or []

    # Applications
    applications = []
    folder = get_profile_folder_path(email)
    if folder:
        try:
            import json
            app_path = os.path.join(folder, "applications.json")
            if os.path.isfile(app_path):
                with open(app_path, "r", encoding="utf-8") as f:
                    applications = json.load(f)
        except Exception:
            pass

    # Resume text
    resume_text = load_parsed_resume_for_voice(email, max_chars=100000) or ""

    # Dilly profile txt (full context)
    from dilly_core.structured_resume import safe_filename_from_key
    _profile_txt_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profile_txt")
    profile_txt_path = os.path.join(_profile_txt_dir, safe_filename_from_key(email))
    dilly_profile_txt = ""
    if os.path.isfile(profile_txt_path):
        try:
            with open(profile_txt_path, "r", encoding="utf-8") as f:
                dilly_profile_txt = f.read()
        except Exception:
            pass

    payload = {
        "export_date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "version": "1.0",
        "profile": export_profile,
        "audits": audits,
        "applications": applications,
        "deadlines": deadlines,
        "resume_text": resume_text,
        "dilly_profile_txt": dilly_profile_txt,
    }

    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": f'attachment; filename="dilly-export-{time.strftime("%Y%m%d")}.json"',
        },
    )


@router.get("/streak")
async def get_streak(request: Request):
    """Get current user's streak data."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile
    import datetime

    profile = get_profile(email) or {}
    streak_data = profile.get("streak") or {}
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    last_checkin = streak_data.get("last_checkin")
    current_streak = streak_data.get("current_streak", 0)
    # Streak is live only if checked in today or yesterday (still in window)
    if last_checkin not in (today, yesterday):
        current_streak = 0

    day_seed = int(__import__("hashlib").md5(today.encode()).hexdigest(), 16) % len(_DAILY_ACTIONS)
    daily_action = _DAILY_ACTIONS[day_seed]

    return {
        "streak": current_streak,
        "longest_streak": streak_data.get("longest_streak", 0),
        "last_checkin": last_checkin,
        "checked_in_today": last_checkin == today,
        "today": today,
        "daily_action": daily_action,
    }

@router.get("/interests/list")
async def get_interests_list(request: Request):
    """Return the curated list of interests/fields for the UI picker."""
    from projects.dilly.api.interests import INTERESTS_LIST, EDUCATION_LEVELS
    return {
        "interests": INTERESTS_LIST,
        "education_levels": EDUCATION_LEVELS,
    }