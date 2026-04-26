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

        # Merge cohort scores + getting_started_dismissed from PostgreSQL
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
            # Ensure getting_started_dismissed column exists (idempotent).
            cur.execute(
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS "
                "getting_started_dismissed TEXT[] DEFAULT '{}'")
            conn.commit()
            cur.execute(
                "SELECT cohort_scores, overall_smart, overall_grit, overall_build, "
                "overall_dilly_score, getting_started_dismissed "
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
                dismissed = row["getting_started_dismissed"] or []
                profile["getting_started_dismissed"] = list(dismissed)
            # interview_done: any interview feedback used this month
            try:
                cur.execute(
                    "SELECT COALESCE(interview_count_month, 0) AS cnt "
                    "FROM users WHERE LOWER(email) = LOWER(%s)", (email,)
                )
                irow = cur.fetchone()
                profile["interview_done"] = bool(irow and irow["cnt"] and int(irow["cnt"]) > 0)
            except Exception:
                profile["interview_done"] = False
            conn.close()
        except Exception:
            pass

        # has_ready_check: at least one ready-check assessment on file.
        try:
            from projects.dilly.api.ready_check_store import list_ready_checks
            profile["has_ready_check"] = len(list_ready_checks(email)) > 0
        except Exception:
            profile["has_ready_check"] = False

        # Getting-Started predicates (build 387). Evaluated server-side so the
        # client never has to re-derive them from raw profile state.
        profile["gs_profile_done"] = bool(profile.get("name") and profile.get("has_run_first_audit"))
        profile["gs_transcript"]   = bool(profile.get("transcript_uploaded_at"))
        profile["gs_resume"]       = bool(profile.get("resume_uploaded_at"))
        profile["gs_win"]          = bool(len(profile.get("wins") or []) > 0)
        profile["gs_calendar"]     = bool(profile.get("calendar_feed_token"))
        try:
            from projects.dilly.api import chapters_store
            profile["gs_chapter"] = chapters_store.count_chapters(email) > 0
        except Exception:
            profile["gs_chapter"] = False
        # gs_customize: true once the user has changed accent or surface from defaults.
        _theme = profile.get("theme") or {}
        profile["gs_customize"] = bool(
            _theme.get("accent", "indigo") != "indigo"
            or _theme.get("surface", "cloud") != "cloud"
        )

        # Fallback: if scores still missing, pull them from the latest audit in audit_history.json
        if not profile.get("overall_dilly_score"):
            try:
                from projects.dilly.api.audit_history import get_audits
                audits = get_audits(email)
                if audits:
                    latest = audits[-1]
                    scores = latest.get("scores") or {}
                    smart = scores.get("smart")
                    grit = scores.get("grit")
                    build = scores.get("build")
                    if smart is not None:
                        profile["overall_smart"] = float(smart)
                    if grit is not None:
                        profile["overall_grit"] = float(grit)
                    if build is not None:
                        profile["overall_build"] = float(build)
                    final = latest.get("final_score")
                    if final is not None:
                        profile["overall_dilly_score"] = float(final)
                    profile["latest_audit_id"] = latest.get("id")
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

        # Auto-trigger background Claude cohort rescoring when the DB only has a single
        # primary-track entry (i.e. the scorer hasn't run yet for this user).
        # The next profile load (a few seconds later) will return the real scores.
        try:
            # Cohort auto-rescore DISABLED. See comment in audit.py.
            # S/G/B per-cohort is no longer surfaced to users, so spending
            # Haiku calls to regenerate it on every profile read was pure
            # waste. Kept the guard so if a prior build wrote stale data
            # it still reads correctly.
            pass
        except Exception:
            pass

        # Merge any cohorts not yet scored by Claude using conservative fallback estimates.
        # Claude-scored entries (scored_by_claude=True) are NEVER overwritten by synthesis.
        # This block only fills gaps for cohorts that exist in the student's profile
        # but haven't been scored yet (e.g. immediately after first audit, before the
        # background Claude scorer completes).
        if profile.get("overall_smart") or profile.get("overall_grit") or profile.get("overall_build"):
            try:
                from projects.dilly.api.cohort_config import MAJOR_TO_COHORT, COHORT_SCORING_CONFIG
                s = float(profile.get("overall_smart") or 0)
                g = float(profile.get("overall_grit")  or 0)
                b = float(profile.get("overall_build") or 0)

                if s or g or b:
                    existing_cs: dict = profile.get("cohort_scores") or {}

                    # If all stored entries were scored by Claude, nothing to synthesize.
                    all_claude = all(
                        isinstance(v, dict) and v.get("scored_by_claude")
                        for v in existing_cs.values()
                    ) if existing_cs else False
                    if all_claude:
                        pass  # real scores already present — skip synthesis entirely
                    else:
                        majors = profile.get("majors") or (
                            [profile["major"]] if profile.get("major") else []
                        )
                        minors  = profile.get("minors") or []
                        seen: dict = {}

                        def _fallback_score(raw: float, level: str, dim: str) -> float:
                            """
                            Conservative fallback when Claude hasn't scored yet.
                            Primary major cohort gets primary-track score.
                            Minor cohorts get 50 % of primary to avoid inflating cross-field scores.
                            Interest cohorts get 30 %.
                            This prevents the old bug where smart showed 100 on every cohort.
                            """
                            if level == "major":
                                return round(min(100.0, raw), 1)
                            elif level == "minor":
                                return round(min(100.0, raw * 0.50), 1)
                            else:  # interest
                                return round(min(100.0, raw * 0.30), 1)

                        def _add_fallback(major_or_minor: str, level: str):
                            cohort = MAJOR_TO_COHORT.get(str(major_or_minor).strip())
                            if not cohort:
                                return
                            # Never overwrite a Claude-scored entry
                            if cohort in existing_cs and existing_cs[cohort].get("scored_by_claude"):
                                return
                            if cohort in seen:
                                return
                            fs = _fallback_score(s, level, "smart")
                            fg = _fallback_score(g, level, "grit")
                            fb = _fallback_score(b, level, "build")
                            seen[cohort] = {
                                "cohort": cohort,
                                "level": level,
                                "field": major_or_minor,
                                "smart": fs,
                                "grit":  fg,
                                "build": fb,
                                "dilly_score": round((fs + fg + fb) / 3, 1),
                                "weight": 1.0 if level == "major" else 0.5,
                                "scored_by_claude": False,
                            }

                        for m in majors:
                            _add_fallback(m, "major")
                        for m in minors:
                            _add_fallback(m, "minor")

                        # Interest cohorts (stored as cohort-label strings)
                        for cohort_label in (profile.get("interests") or []):
                            if not cohort_label:
                                continue
                            if cohort_label in existing_cs and existing_cs[cohort_label].get("scored_by_claude"):
                                continue
                            if cohort_label in seen:
                                continue
                            from projects.dilly.api.cohort_config import COHORT_SCORING_CONFIG as _csc
                            if not _csc.get(cohort_label):
                                continue
                            fi = _fallback_score(s, "interest", "smart")
                            fg = _fallback_score(g, "interest", "grit")
                            fb = _fallback_score(b, "interest", "build")
                            seen[cohort_label] = {
                                "cohort": cohort_label,
                                "level": "interest",
                                "field": cohort_label,
                                "smart": fi,
                                "grit":  fg,
                                "build": fb,
                                "dilly_score": round((fi + fg + fb) / 3, 1),
                                "weight": 0.0,
                                "scored_by_claude": False,
                            }

                        if seen:
                            # Claude entries always win; fallback only fills gaps.
                            merged = dict(seen)
                            for k, v in existing_cs.items():
                                merged[k] = v
                            profile["cohort_scores"] = merged
            except Exception:
                pass

        # -- Plan field: default to 'starter' if not set -------------------------
        if profile.get("plan") not in ("starter", "dilly", "pro", "building"):
            profile["plan"] = "starter"

        # -- is_student: .edu email AND graduation_year >= current year ----------
        try:
            from datetime import datetime as _dt_is_student
            _grad = profile.get("graduation_year")
            _edu = (email or "").strip().lower().endswith(".edu")
            _grad_ok = False
            if _grad is not None:
                try:
                    _grad_ok = int(_grad) >= _dt_is_student.now().year
                except (TypeError, ValueError):
                    pass
            profile["is_student"] = _edu and _grad_ok
        except Exception:
            profile["is_student"] = False

        # Attach per-situation copy so every shared surface can
        # reach a tailored voice through one profile fetch. Zero-
        # cost: pure dict lookup from dilly_core/situation_copy.py.
        try:
            from projects.dilly.dilly_core.situation_copy import copy_for_path  # type: ignore
            profile["situation_copy"] = copy_for_path(profile.get("user_path"))
        except Exception:
            pass

        return profile
    except ValueError as e:
        raise errors.validation_error(str(e))
    except Exception:
        raise errors.internal("Could not load profile.")


@router.post("/journey/dismiss")
async def dismiss_journey_step(request: Request, body: dict = Body(...)):
    """Permanently mark a Getting Started step as dismissed for this user.
    Idempotent. Once dismissed, the step is never surfaced again even if
    the underlying predicate later becomes false."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    step_id = (body or {}).get("step_id", "")
    if not step_id or not isinstance(step_id, str):
        raise errors.validation_error("step_id is required")
    try:
        import psycopg2, psycopg2.extras, os
        pw = os.environ.get("DILLY_DB_PASSWORD", "")
        if not pw:
            try: pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
            except: pass
        conn = psycopg2.connect(
            host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
            database="dilly", user="dilly_admin", password=pw, sslmode="require"
        )
        cur = conn.cursor()
        cur.execute(
            "ALTER TABLE students ADD COLUMN IF NOT EXISTS "
            "getting_started_dismissed TEXT[] DEFAULT '{}'")
        # array_append only if not already present
        cur.execute(
            """UPDATE students
               SET getting_started_dismissed = array_append(getting_started_dismissed, %s)
               WHERE LOWER(email) = LOWER(%s)
                 AND NOT (getting_started_dismissed @> ARRAY[%s]::TEXT[])""",
            (step_id, email, step_id)
        )
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception as exc:
        raise errors.internal(f"Could not dismiss step: {exc}")


@router.post("/profile/rescore-cohorts")
async def rescore_cohorts(request: Request):
    """DEPRECATED. Cohort scoring is no longer user-visible; this endpoint
    is a no-op so any stale app builds calling it don't error out. Will
    be removed in a future build."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    return {"ok": True, "message": "Cohort scoring retired."}


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
    allowed = {"schoolId", "major", "majors", "minors", "pre_professional_track", "preProfessional", "track", "cohort", "cohorts", "career_fields", "user_type", "industry_target", "goals", "name", "application_target", "application_target_label", "career_goal", "deadlines", "leaderboard_opt_in", "target_school", "target_companies", "profile_background_color", "profile_tagline", "profile_bio", "linkedin_url", "voice_memory", "voice_avatar_index", "voice_save_to_profile", "job_locations", "job_location_scope", "achievements", "custom_tagline", "profile_theme", "voice_tone", "voice_notes", "share_card_achievements", "share_card_metric", "first_audit_snapshot", "first_application_at", "first_interview_at", "got_interview_at", "got_offer_at", "outcome_story_consent", "outcome_prompt_dismissed_at", "referral_code", "parent_email", "parent_milestone_opt_in", "voice_always_end_with_ask", "voice_max_recommendations", "voice_onboarding_done", "voice_onboarding_answers", "voice_biggest_concern", "experience_expansion", "beyond_resume", "nudge_preferences", "decision_log", "ritual_preferences", "dilly_profile_privacy", "dilly_profile_visible_to_recruiters", "pronouns", "push_token", "notification_prefs", "last_deep_dive_at", "weekly_review_day", "onboarding_complete", "has_run_first_audit", "interests", "education_level", "graduation_year", "plan", "public_profile_visible", "web_profile_settings", "web_headline", "card_template", "readable_slug", "extra_cohorts", "booking_availability", "bookings", "show_qr_button", "show_refer_button", "user_path", "years_experience", "most_recent_role", "most_recent_industry", "willing_industries", "self_taught_skills", "current_role", "current_job_title", "title", "field", "app_mode", "mission_statement", "advisor_persona"}
    data = {k: v for k, v in (body or {}).items() if k in allowed}

    # Life event append: used by the "I got laid off" / "I got a new job"
    # mode-switch flow to record the event on the profile so Dilly's
    # coach and memory system are aware of it. Private — never
    # surfaced on the public web profile (filtered out in
    # get_web_profile). Append-only; the frontend sends one event
    # at a time; server maintains the list capped at the last 20.
    _life_evt = (body or {}).get("life_events_append")
    if isinstance(_life_evt, dict) and _life_evt.get("kind") in ("layoff", "new_job"):
        try:
            from projects.dilly.api.profile_store import get_profile as _get_profile  # type: ignore
            _existing = _get_profile(email) or {}
            _events = list(_existing.get("life_events") or [])
            _events.append({
                "kind":    _life_evt.get("kind"),
                "at":      str(_life_evt.get("at") or ""),
                "role":    (_life_evt.get("role") or None),
                "company": (_life_evt.get("company") or None),
            })
            data["life_events"] = _events[-20:]
        except Exception:
            pass

    # Validate plan field: only accept known tier values.
    if "plan" in data and data["plan"] not in ("starter", "dilly", "pro", "building"):
        data.pop("plan", None)
    # Validate advisor_persona: empty/null clears it, otherwise must
    # be one of the canonical persona keys. The Chapter prompt reads
    # this to decide which persona lens to splice in, and an unknown
    # value would silently fall through to the neutral default, so
    # we clamp at the boundary instead of trusting the client.
    if "advisor_persona" in data:
        v = data["advisor_persona"]
        if v is None or v == "":
            data["advisor_persona"] = None
        elif isinstance(v, str) and v.strip().lower() in ("warm", "sharp", "direct"):
            data["advisor_persona"] = v.strip().lower()
        else:
            data.pop("advisor_persona", None)
    # Validate app_mode: only accept 'holder' | 'seeker' | 'student' | null.
    # null is the "reset to derived mode" signal — user wants mode to
    # follow their user_path again instead of the explicit override.
    if "app_mode" in data:
        v = data["app_mode"]
        if v in (None, "", "null"):
            data["app_mode"] = None
        elif isinstance(v, str) and v.lower().strip() in ("holder", "seeker", "student"):
            data["app_mode"] = v.lower().strip()
        else:
            data.pop("app_mode", None)
    # Normalize graduation_year: coerce to int, reject nonsense values.
    # Coach (ai.py:187) and leaderboard (leaderboard_page.py) both read this field,
    # so persisting a bad value here would corrupt downstream rendering.
    if "graduation_year" in data:
        v = data["graduation_year"]
        if v is None or v == "":
            data["graduation_year"] = None
        else:
            try:
                year = int(v)
                # Sanity bounds: current year minus 2 (already graduated) through current year + 8 (long programs)
                from datetime import datetime as _dt
                _now = _dt.now().year
                if _now - 2 <= year <= _now + 8:
                    data["graduation_year"] = year
                else:
                    data.pop("graduation_year", None)
            except (TypeError, ValueError):
                data.pop("graduation_year", None)
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


def _fan_out_transcript_facts(
    email: str,
    *,
    gpa=None,
    bcpm_gpa=None,
    major=None,
    minor=None,
    honors=None,
    courses=None,
    school=None,
) -> None:
    """Upsert parsed transcript fields into profile_facts. Best-effort; never raises."""
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        from projects.dilly.api.memory_surface_store import save_memory_surface
        items: list[dict] = []
        if gpa is not None:
            items.append({"category": "gpa", "label": "cumulative", "value": str(gpa),
                          "source": "transcript", "confidence": "high"})
        if bcpm_gpa is not None:
            items.append({"category": "gpa", "label": "bcpm", "value": str(bcpm_gpa),
                          "source": "transcript", "confidence": "high"})
        if major:
            items.append({"category": "major", "label": major[:80], "value": major[:500],
                          "source": "transcript", "confidence": "high"})
        if minor:
            items.append({"category": "minor", "label": minor[:80], "value": minor[:500],
                          "source": "transcript", "confidence": "high"})
        if school:
            items.append({"category": "school", "label": school[:80], "value": school[:500],
                          "source": "transcript", "confidence": "high"})
        for honor in (honors or []):
            items.append({"category": "honor", "label": honor[:80], "value": honor[:500],
                          "source": "transcript", "confidence": "high"})
        for c in (courses or []):
            code = (c.get("code") or "").strip()
            name = (c.get("name") or "").strip()
            term = (c.get("term") or "").strip()
            grade = (c.get("grade") or "").strip()
            credits = c.get("credits")
            label = (f"{code} ({term})" if code and term else code or name or "unknown")[:80]
            parts = [p for p in [code, name, grade, term,
                                  (f"{credits} cr" if credits is not None else None)] if p]
            value = " — ".join(parts)[:500]
            items.append({
                "category": "course",
                "label": label,
                "value": value,
                "source": "transcript",
                "confidence": "high",
                "action_payload": {"term": term or None, "grade": grade or None, "credits": credits},
            })
        if items:
            save_memory_surface(email, items=items)
            _log.info("transcript_fanout: wrote %d facts for %s", len(items), email)
    except Exception as exc:
        _log.error("transcript_fanout: failed for %s: %s", email, exc)


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
            "transcript_school": result.school,
            "transcript_warnings": getattr(result, "warnings", []) or [],
        }
        save_profile(email, payload)
        _fan_out_transcript_facts(
            email,
            gpa=result.gpa,
            bcpm_gpa=getattr(result, "bcpm_gpa", None),
            major=getattr(result, "major", None),
            minor=getattr(result, "minor", None),
            honors=getattr(result, "honors", None),
            courses=result.to_dict().get("courses", []),
            school=getattr(result, "school", None),
        )
        try:
            from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
            write_dilly_profile_txt(email)
        except Exception:
            pass
        courses_count = len(result.courses)
        low_confidence = courses_count < 3 or result.gpa is None
        return {
            "ok": True,
            "low_confidence": low_confidence,
            "low_confidence_message": (
                "We parsed your transcript but couldn't find all the details — check the fields below and fill in anything missing."
                if low_confidence else None
            ),
            "transcript": {
                "gpa": result.gpa,
                "bcpm_gpa": result.bcpm_gpa,
                "courses_count": courses_count,
                "honors": result.honors,
                "major": result.major,
                "minor": result.minor,
                "school": result.school,
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


# ── Resume upload (one-time) ──────────────────────────────────────────────────

_DOCX_MAGIC = b"PK\x03\x04"


def _fan_out_resume_facts(email: str, text: str, name: str) -> None:
    """Extract profile facts from resume text via LLM and upsert into profile_facts.

    Best-effort; runs in a daemon thread; never raises.
    """
    import logging as _logging
    import threading as _threading
    _log = _logging.getLogger(__name__)

    _text = text[:8000]
    _name = name or ""
    _email = email

    def _bg():
        try:
            import anthropic, json as _j
            api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
            if not api_key:
                return
            client = anthropic.Anthropic(api_key=api_key)
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2000,
                temperature=0.2,
                system=(
                    "Extract profile facts from this resume. Return JSON array of objects. "
                    "Each object: {\"category\": \"...\", \"label\": \"short title\", \"value\": \"detail\", \"confidence\": \"high\" or \"medium\"}. "
                    "Categories: skill_unlisted (technical skills), soft_skill (interpersonal), "
                    "achievement (accomplishments with impact), experience (roles held), "
                    "project_detail (projects built), education (degrees/certs), goal (career goals). "
                    "Extract 15-25 facts. Be specific. Cite real details from the resume. "
                    "Never use em dashes. JSON array only, no markdown."
                ),
                messages=[{"role": "user", "content": f"Resume for {_name}:\n\n{_text}"}],
            )
            try:
                from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
                log_from_anthropic_response(_email, FEATURES.PROFILE, resp,
                                            metadata={"op": "seed_from_resume_upload"})
            except Exception:
                pass
            raw = resp.content[0].text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3].strip()
            if raw.startswith("json"):
                raw = raw[4:].strip()
            facts = _j.loads(raw)
            if not isinstance(facts, list):
                return
            from projects.dilly.api.memory_surface_store import save_memory_surface
            items = []
            for f in facts[:30]:
                if not isinstance(f, dict) or not f.get("label"):
                    continue
                items.append({
                    "category": f.get("category", "skill_unlisted"),
                    "label": str(f.get("label", ""))[:100],
                    "value": str(f.get("value", ""))[:500],
                    "confidence": f.get("confidence", "medium"),
                    "source": "resume",
                })
            if items:
                save_memory_surface(_email, items=items)
                _log.info("resume_fanout: wrote %d facts for %s", len(items), _email)
        except Exception as exc:
            _log.error("resume_fanout: failed for %s: %s", _email, exc)

    _threading.Thread(target=_bg, daemon=True).start()


@router.post("/profile/resume")
async def upload_profile_resume(request: Request, file: UploadFile = File(...)):
    """Upload resume (PDF or DOCX). One-time only — rejected if already uploaded."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized("Sign in required.")

    fn = (file.filename or "").lower()
    if not fn.endswith(".pdf") and not fn.endswith(".docx"):
        raise errors.validation_error("Resume must be a PDF or DOCX file.")

    try:
        from projects.dilly.api.profile_store import (
            get_profile_folder_path,
            save_profile,
            ensure_profile_exists,
            get_profile,
        )
    except ImportError:
        raise errors.internal("Resume processing unavailable.")

    ensure_profile_exists(email)

    # One-time gate — reject if already uploaded
    existing = get_profile(email)
    if existing.get("resume_uploaded_at"):
        raise HTTPException(status_code=409, detail="Resume already uploaded. Upload is one-time only.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise errors.validation_error("Resume must be under 10MB.")

    is_pdf = fn.endswith(".pdf")
    if is_pdf and not content.startswith(_PDF_MAGIC):
        raise errors.validation_error("File is not a valid PDF.")
    if not is_pdf and not content.startswith(_DOCX_MAGIC):
        raise errors.validation_error("File is not a valid DOCX.")

    folder = get_profile_folder_path(email)
    if not folder:
        raise errors.validation_error("Invalid profile.")
    os.makedirs(folder, exist_ok=True)

    ext = ".pdf" if is_pdf else ".docx"
    fd, temp_path = tempfile.mkstemp(dir=folder, suffix=ext)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)

        try:
            from projects.dilly.dilly_resume_auditor import DillyResumeAuditor
            from dilly_core.resume_parser import parse_resume
        except ImportError:
            raise errors.internal("Resume processing unavailable.")

        auditor = DillyResumeAuditor(temp_path)
        if not auditor.extract_text():
            raise errors.validation_error("Could not read text from resume. Upload a text-based PDF or DOCX.")

        raw_text = auditor.raw_text or ""
        parsed = parse_resume(raw_text, filename=file.filename)
        normalized = parsed.normalized_text or raw_text

        save_profile(email, {
            "resume_uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "resume_text": normalized[:8000],
            "resume_gpa": parsed.gpa,
            "resume_major": parsed.major or None,
        })

        _fan_out_resume_facts(email, normalized, parsed.name or "")

        try:
            from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
            write_dilly_profile_txt(email)
        except Exception:
            pass

        return {"ok": True}
    finally:
        if os.path.isfile(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


@router.get("/profile/transcript")
async def get_profile_transcript(request: Request):
    """Return the user's current transcript data (parsed + any manual edits)."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized("Sign in required.")
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists
        profile = ensure_profile_exists(email)
    except Exception:
        raise errors.internal("Could not load profile.")
    return {
        "ok": True,
        "transcript": {
            "uploaded_at": profile.get("transcript_uploaded_at"),
            "gpa": profile.get("transcript_gpa"),
            "bcpm_gpa": profile.get("transcript_bcpm_gpa"),
            "courses": profile.get("transcript_courses") or [],
            "honors": profile.get("transcript_honors") or [],
            "major": profile.get("transcript_major"),
            "minor": profile.get("transcript_minor"),
            "warnings": profile.get("transcript_warnings") or [],
            "manually_edited": profile.get("transcript_manually_edited") or {},
            "last_edited_at": profile.get("transcript_last_edited_at"),
        },
    }


@router.patch("/profile/transcript")
async def patch_profile_transcript(request: Request, body: dict = Body(...)):
    """Persist manual edits to the user's transcript data.
    Accepts a partial update. Tracks which fields were manually edited."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized("Sign in required.")
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists, save_profile
    except ImportError:
        raise errors.internal("Profile store unavailable.")

    ensure_profile_exists(email)

    _editable_fields = {
        "transcript_gpa", "transcript_bcpm_gpa", "transcript_courses",
        "transcript_honors", "transcript_major", "transcript_minor",
    }
    payload: dict = {}
    manually_edited: dict = {}

    for field in _editable_fields:
        if field in body:
            payload[field] = body[field]
            manually_edited[field.replace("transcript_", "")] = True

    if not payload:
        return {"ok": True, "updated": []}

    payload["transcript_last_edited_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    try:
        from projects.dilly.api.profile_store import ensure_profile_exists as _ep
        existing = _ep(email) or {}
        existing_edited = existing.get("transcript_manually_edited") or {}
        payload["transcript_manually_edited"] = {**existing_edited, **manually_edited}
    except Exception:
        payload["transcript_manually_edited"] = manually_edited

    save_profile(email, payload)
    try:
        from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
        write_dilly_profile_txt(email)
    except Exception:
        pass
    return {"ok": True, "updated": list(payload.keys())}


@router.delete("/profile/photo")
async def delete_profile_photo_endpoint(request: Request):
    """Remove current user's profile photo."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    from projects.dilly.api.profile_store import delete_profile_photo
    delete_profile_photo(email)
    return {"ok": True}


@router.post("/subscription/cancel")
async def cancel_subscription(request: Request):
    """Cancel the user's paid subscription WITHOUT deleting their account.

    Tester feedback: cancellation was buried inside "delete account,"
    which most users don't want — they want to stop paying but keep
    their profile and data. This endpoint does just the Stripe cancel
    and flips the profile plan back to "starter." Everything else
    (profile, resume, facts, history) stays intact. If the user comes
    back later, their Dilly remembers them.

    Idempotent: calling this with no active subscription is a no-op
    that returns success. Stripe's API tolerates cancelling an already-
    cancelled subscription (returns the prior state), which is also
    treated as success.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.validation_error("Email required.")

    from projects.dilly.api.profile_store import get_profile as _get_profile, save_profile
    profile = _get_profile(email) or {}
    sub_id = (profile.get("stripe_subscription_id") or "").strip()
    current_plan = (profile.get("plan") or "starter").lower().strip()

    if not sub_id or current_plan == "starter":
        # Nothing to cancel. Still normalize the profile so the client
        # UI reflects a clean starter state.
        if current_plan != "starter":
            save_profile(email, {"plan": "starter", "stripe_subscription_id": ""})
        return {"ok": True, "already_cancelled": True, "plan": "starter"}

    stripe_configured = bool(os.environ.get("STRIPE_SECRET_KEY", "").strip())
    if not stripe_configured:
        # Dev env without Stripe configured. Still flip the plan so
        # testing works, but flag so we don't silently fail in prod.
        save_profile(email, {"plan": "starter", "stripe_subscription_id": ""})
        return {"ok": True, "plan": "starter", "note": "dev_mode"}

    try:
        import stripe
        stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
        stripe.Subscription.cancel(sub_id)
        print(f"[SUB-CANCEL] email={email[:6]}*** sub={sub_id} → cancelled", flush=True)
    except Exception as exc:
        print(f"[SUB-CANCEL-FAIL] email={email[:6]}*** err={exc}", flush=True)
        raise errors.service_unavailable(
            "Could not cancel your subscription right now. Please try again in a minute."
        )

    # Flip plan locally. The Stripe webhook for customer.subscription.deleted
    # will also fire and do the same update, but racing with the UI means
    # we should reflect the change immediately so the user sees Starter
    # when they come back to the settings screen.
    save_profile(email, {"plan": "starter", "stripe_subscription_id": ""})
    return {"ok": True, "plan": "starter"}


@router.post("/account/delete")
async def delete_account(request: Request):
    """
    Permanently delete the current user's account. Wipes EVERYTHING:
    - Stripe subscription (cancelled before any local data is deleted)
    - Profile folder (profile.json, audits.json, applications, resume, photos)
    - PostgreSQL: profile_facts, students row
    - Parsed resume text files
    - Auth: user record + all sessions
    This is irreversible. The user is gone.

    IMPORTANT ORDER: Stripe first, then local data. If we delete the
    profile row first and then Stripe fails, we lose the stripe_subscription_id
    and the user gets charged forever with no way for us to find them.
    """
    import traceback
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.validation_error("Email required.")

    # 0. Cancel Stripe subscription FIRST (before we lose the profile row
    # that holds the subscription_id). If Stripe is unreachable we bail
    # out — better to leave the profile intact than to orphan a paid
    # subscription that keeps charging a deleted user.
    from projects.dilly.api.profile_store import get_profile
    profile_snapshot = get_profile(email) or {}
    sub_id = (profile_snapshot.get("stripe_subscription_id") or "").strip()
    stripe_configured = bool(os.environ.get("STRIPE_SECRET_KEY", "").strip())
    if sub_id and stripe_configured:
        try:
            import stripe
            stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
            # Immediate cancel — the user asked to leave. If the sub is
            # already cancelled Stripe returns the prior state; still OK.
            stripe.Subscription.cancel(sub_id)
            print(f"[DELETE-ACCOUNT] Stripe subscription cancelled: {sub_id}", flush=True)
        except Exception as se:
            print(f"[DELETE-ACCOUNT] Stripe cancel failed for {email}: {se}", flush=True)
            raise errors.service_unavailable(
                "Could not cancel your subscription right now. Please try again in a minute."
            )

    # 1. Delete ALL data from every table (each in its own transaction).
    # Order matters: push_tokens FKs to students(id), so it must go BEFORE
    # students (otherwise the subquery finds no matching student_id and
    # orphan tokens are left behind — this was a real bug). push_tokens
    # has no email column, only student_id, hence the subquery.
    from projects.dilly.api.database import get_db
    delete_queries = [
        ("profile_facts", "DELETE FROM profile_facts WHERE LOWER(email) = LOWER(%s)"),
        ("push_tokens", "DELETE FROM push_tokens WHERE student_id IN (SELECT id FROM students WHERE LOWER(email) = LOWER(%s))"),
        ("students", "DELETE FROM students WHERE LOWER(email) = LOWER(%s)"),
        ("users", "DELETE FROM users WHERE LOWER(email) = LOWER(%s)"),
        ("verification_codes", "DELETE FROM verification_codes WHERE LOWER(email) = LOWER(%s)"),
    ]
    for table, query in delete_queries:
        try:
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute(query, (email,))
                print(f"[DELETE-ACCOUNT] {table}: {cur.rowcount} rows deleted", flush=True)
        except Exception as te:
            print(f"[DELETE-ACCOUNT] {table} error: {te}", flush=True)
    # web_profile_connections uses user_email
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM web_profile_connections WHERE LOWER(user_email) = LOWER(%s)", (email,))
    except Exception:
        pass

    # 2. Delete profile folder (photos, resume files)
    from projects.dilly.api.profile_store import delete_account_data
    delete_account_data(email)

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

    # 4. Delete auth records
    from projects.dilly.api.auth_store import delete_user_and_sessions
    delete_user_and_sessions(email)

    print(f"[DELETE-ACCOUNT] Fully deleted: {email}", flush=True)

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
# Public Web Profile (human-readable slug)
# ---------------------------------------------------------------------------

@router.get("/profile/web/{slug}")
async def get_web_profile(slug: str, prefix: str | None = None):
    """Public web profile data for hellodilly.com/s/ and /p/ pages.
    Returns curated, privacy-safe data. No auth required.
    prefix: 's' for student, 'p' for professional. Filters when same slug exists for both.
    """
    from projects.dilly.api.profile_store import get_profile_by_readable_slug, get_profile_slug
    from projects.dilly.api.memory_surface_store import get_memory_surface
    from projects.dilly.api.schools import get_school_from_email, SCHOOLS

    profile = get_profile_by_readable_slug(slug, user_type_prefix=prefix)
    if not profile:
        raise errors.not_found("Profile not found.")

    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise errors.not_found("Profile not found.")

    # Check if user has opted out of public visibility
    if profile.get("public_profile_visible") is False:
        return JSONResponse(
            status_code=403,
            content={"private": True, "name": (profile.get("name") or "").split()[0] if profile.get("name") else None},
            headers={"Access-Control-Allow-Origin": "*"},
        )

    # School info
    school_id = (profile.get("school_id") or profile.get("schoolId") or "").strip().lower()
    school_config = SCHOOLS.get(school_id) if school_id else get_school_from_email(email)
    school_name = school_config.get("name") if school_config else profile.get("school") or None

    # Majors/minors
    majors = profile.get("majors") or []
    if not majors and profile.get("major"):
        majors = [profile.get("major")]
    minors = [m for m in (profile.get("minors") or []) if m and str(m).strip().upper() not in ("N/A", "NA")]

    # Memory surface for skills and career interests
    surface = get_memory_surface(email)
    facts = surface.get("items") or []

    # Extract public-safe categories only
    SAFE_CATEGORIES = frozenset({
        "skill_unlisted", "soft_skill", "technical_skill", "skill",
        "achievement", "project", "experience", "education",
        "goal", "interest", "career_interest",
    })
    PRIVATE_CATEGORIES = frozenset({
        "challenge", "concern", "weakness", "fear", "personal",
        "contact", "phone", "email_address",
    })

    # Categorize facts for the web profile
    PRIVATE_ALWAYS = frozenset({
        "challenge", "concern", "weakness", "fear", "personal",
        "contact", "phone", "email_address", "areas_for_improvement",
        "life_context",
    })
    STRENGTH_CATS = frozenset({"strength", "achievement", "soft_skill", "personality"})
    SKILL_CATS = frozenset({"skill_unlisted", "soft_skill", "technical_skill", "skill"})

    strengths = []
    skills_technical = []
    skills_soft = []
    career_interests = []
    experience_facts = []
    project_facts = []
    looking_for = []

    SOFT_KEYWORDS = {"leadership", "communication", "teamwork", "collaboration", "problem solving",
                     "adaptability", "creativity", "time management", "mentoring", "public speaking",
                     "negotiation", "empathy", "management", "planning", "interpersonal", "coaching",
                     "writing", "presentation", "organization", "conflict resolution"}

    # Per-fact web visibility: user-toggleable hide list stored on profile.
    # Stored on web_profile_settings.hidden_fact_ids (same blob as sections toggle).
    _web_settings_for_facts = profile.get("web_profile_settings") or {}
    hidden_fact_ids = set(_web_settings_for_facts.get("hidden_fact_ids") or [])

    for f in facts:
        cat = (f.get("category") or "").lower()
        if cat in PRIVATE_ALWAYS:
            continue
        # Respect per-fact web visibility toggle (default: public for safe categories)
        if f.get("id") and f.get("id") in hidden_fact_ids:
            continue
        conf = f.get("confidence", "medium")
        label = f.get("label") or f.get("value", "")
        value = f.get("value") or ""

        if cat in STRENGTH_CATS:
            strengths.append({"label": label, "description": value, "category": cat})
        if cat in SKILL_CATS and conf in ("high", "medium"):
            is_soft = any(kw in label.lower() for kw in SOFT_KEYWORDS)
            target = skills_soft if is_soft else skills_technical
            target.append({"label": label, "confidence": conf})
        if cat in ("goal", "interest", "career_interest"):
            career_interests.append(label)
        if cat in ("target_company", "company_culture_pref"):
            looking_for.append(label)
        if cat in ("achievement", "project", "project_detail"):
            project_facts.append({"label": label, "value": value})
        if cat == "experience":
            experience_facts.append({"label": label, "value": value})

    # Experience expansion (structured)
    experience_items = []
    for exp in (profile.get("experience_expansion") or [])[:8]:
        if not isinstance(exp, dict):
            continue
        role = exp.get("role_label") or ""
        org = exp.get("organization") or ""
        if role or org:
            experience_items.append({
                "role": role,
                "organization": org,
                "skills": (exp.get("skills") or [])[:6],
                "description": "; ".join((exp.get("omitted") or [])[:2]) or None,
            })

    # Determine user type
    user_type = profile.get("user_type") or "student"
    is_student = user_type not in ("general", "professional")
    grad_year = profile.get("graduation_year") or profile.get("class_year") or ""
    cities = profile.get("job_locations") or []
    career_fields = profile.get("career_fields") or []

    # Web profile settings - section visibility
    web_settings = profile.get("web_profile_settings") or {}
    sections_vis = web_settings.get("sections") or {}
    template = web_settings.get("template") or profile.get("card_template") or "default"
    headline = web_settings.get("headline") or profile.get("web_headline") or None

    def sec_on(key: str) -> bool:
        return sections_vis.get(key, True) is not False

    # Combine looking_for with target roles and cities
    target_roles = []
    if career_interests:
        target_roles = [c for c in career_interests if "role" in c.lower() or "internship" in c.lower()][:3]

    # ── Skill groups (podium) ──────────────────────────────────────
    # Zero-LLM: cluster the user's existing skill facts against a
    # curated keyword map. Each group gets member_skills (ranked by
    # confidence) and an evidence_count (raw fact count). The top-3
    # by evidence_count fill the podium. Computed per-request but
    # the cost is a few hundred dict lookups — still effectively
    # free to serve.
    SKILL_GROUP_KEYWORDS: dict[str, list[str]] = {
        "Frontend":          ["react", "vue", "angular", "svelte", "next.js", "nextjs", "tailwind", "css", "html", "ui", "ux", "typescript", "javascript"],
        "Backend":           ["python", "django", "flask", "fastapi", "node", "go ", "golang", "ruby", "rails", "java", "spring", "kotlin", "scala", "backend", "api"],
        "Mobile":            ["ios", "android", "swift", "kotlin", "react native", "flutter", "expo", "swiftui"],
        "Data & ML":         ["ml", "machine learning", "deep learning", "pytorch", "tensorflow", "numpy", "pandas", "scikit", "data", "sql", "snowflake", "bigquery", "airflow", "dbt", "spark", "statistics"],
        "DevOps / Infra":    ["aws", "gcp", "azure", "kubernetes", "k8s", "docker", "terraform", "ci/cd", "devops", "sre", "linux", "bash"],
        "Design":            ["figma", "sketch", "adobe", "photoshop", "illustrator", "branding", "typography", "product design", "visual design"],
        "Product":           ["product management", "roadmap", "prd", "user research", "a/b testing", "prioritization"],
        "Sales & GTM":       ["sales", "outbound", "cold email", "salesforce", "hubspot", "pipeline", "closing", "crm"],
        "Finance":           ["accounting", "audit", "financial modeling", "excel", "valuation", "m&a", "vba", "capital markets"],
        "Consulting / Ops":  ["consulting", "operations", "process improvement", "six sigma", "supply chain"],
        "Writing & Comms":   ["writing", "copywriting", "content", "seo", "blog", "editorial", "communications", "pr"],
        "Biology / Science": ["biology", "chemistry", "physics", "pre-med", "research", "lab", "clinical", "pharmacology", "genetics", "biochem"],
        "Leadership":        ["leadership", "management", "mentoring", "coaching", "team lead", "project management"],
    }

    def _classify_skill(label: str) -> str | None:
        lo = (label or "").lower()
        best_group: str | None = None
        best_score = 0
        for group, keywords in SKILL_GROUP_KEYWORDS.items():
            score = sum(1 for k in keywords if k in lo)
            if score > best_score:
                best_group = group
                best_score = score
        return best_group

    # Build groups from BOTH technical and soft skills so a
    # leadership-heavy profile still lands on the Leadership podium.
    _group_members: dict[str, list[dict]] = {}
    _group_evidence: dict[str, int] = {}
    for s in (skills_technical + skills_soft):
        g = _classify_skill(s["label"])
        if not g:
            continue
        _group_members.setdefault(g, []).append(s)
        _group_evidence[g] = _group_evidence.get(g, 0) + (2 if s.get("confidence") == "high" else 1)

    # Top-3 groups by evidence count. Tie break: alphabetical.
    ranked_groups = sorted(
        _group_evidence.keys(),
        key=lambda g: (-_group_evidence[g], g),
    )[:3]

    skill_groups: list[dict] = []
    for idx, name in enumerate(ranked_groups):
        members = _group_members.get(name, [])
        # Rank members by confidence (high first, then medium) then alpha.
        members_sorted = sorted(
            members,
            key=lambda m: (0 if m.get("confidence") == "high" else 1, m.get("label", "").lower()),
        )
        skill_groups.append({
            "rank":           idx + 1,          # 1 = tallest podium
            "name":           name,
            "evidence_count": _group_evidence.get(name, 0),
            "top_skills":     [m["label"] for m in members_sorted[:3]],
            "all_skills":     [m["label"] for m in members_sorted[:12]],
            "experiences":    [
                e for e in experience_items
                if any(_classify_skill(s) == name for s in (e.get("skills") or []))
            ][:4],
        })

    # ── Dilly's Take (templated, zero-LLM) ─────────────────────────
    # Cheap, human-reasonable one-liner built from facts. If the user
    # asks us to regenerate via an LLM later, we'll cache the result
    # on profile['dilly_take_cached'] and prefer it over the template.
    cached_take = (profile.get("dilly_take_cached") or "").strip()
    if cached_take:
        dilly_take = cached_take
    else:
        _name_first = ((profile.get("name") or "").split() or [""])[0]
        _top_group = skill_groups[0]["name"] if skill_groups else None
        _skill_ct  = len(skills_technical) + len(skills_soft)
        _tag       = (profile.get("profile_tagline") or profile.get("custom_tagline") or "").strip()
        if _tag:
            dilly_take = _tag
        elif _top_group and _skill_ct >= 4:
            dilly_take = f"Strongest signal is {_top_group.lower()}. {_skill_ct} skills tracked across the conversation."
        elif _name_first:
            dilly_take = f"Still getting to know {_name_first}. Fresh profile, growing fast."
        else:
            dilly_take = "Career story in progress."

    # ── Situation-aware PUBLIC personalization ────────────────────
    # The public web profile should adapt to who the user IS, but
    # should NEVER surface stigma-risk signals. We keep a curated
    # allow-list of situation → public framing overrides.
    # Off-list sensitive situations (dropout, refugee, formerly
    # incarcerated, neurodivergent, disabled, lgbtq, parent_returning,
    # first_gen_college, trades_to_white_collar, career_switch,
    # senior_reset) map to an EMPTY override. nothing situation-
    # specific leaks onto the public page. Only the generic profile
    # fields show.
    _user_path_for_web = (profile.get("user_path") or "").strip().lower()
    _positive_framings: dict[str, dict] = {
        "i_have_a_job": {
            "identity_tag":  "ACTIVE PROFESSIONAL",
            "accent_color":  "#2563EB",
        },
        "student": {
            "identity_tag":  "COLLEGE STUDENT",
            "accent_color":  "#4F46E5",
        },
        "international_grad": {
            # Visa users are VERY vulnerable to bias if status is
            # disclosed on a public page. Show nothing situation-
            # specific. Sponsorship targeting stays in the app only.
            "identity_tag":  None,
            "accent_color":  None,
        },
        "veteran": {
            # Veterans typically want their service acknowledged
            # publicly. Opt-in at signup; shown as a positive tag.
            "identity_tag":  "VETERAN",
            "accent_color":  "#15803D",
        },
        "ex_founder": {
            # Founder DNA is a badge, not a liability.
            "identity_tag":  "FOUNDER",
            "accent_color":  "#CA8A04",
        },
        "exploring": {
            # "Open to opportunities" framing, no signal about why.
            "identity_tag":  "OPEN TO WORK",
            "accent_color":  "#7C3AED",
        },
    }
    _situation_public = _positive_framings.get(_user_path_for_web, {
        "identity_tag": None, "accent_color": None,
    })

    out = {
        "name": (profile.get("name") or "").strip(),
        "slug": slug,
        "user_type": user_type,
        "is_student": is_student,
        "tagline": (profile.get("profile_tagline") or profile.get("custom_tagline") or "").strip() or None,
        "bio": (profile.get("profile_bio") or "").strip() or None,
        "headline": headline,
        "template": template,
        "school": school_name,
        "majors": majors,
        "minors": minors,
        "class_year": str(grad_year) if grad_year else None,
        "cities": cities[:5],
        "career_fields": career_fields[:5],
        # Sections (respect toggle visibility)
        "strengths": strengths[:8] if sec_on("strengths") else [],
        "skills_technical": skills_technical[:12] if sec_on("skills") else [],
        "skills_soft": skills_soft[:8] if sec_on("skills") else [],
        "career_interests": career_interests[:6],
        "looking_for": {
            "roles": target_roles,
            "locations": cities[:4],
            "preferences": looking_for[:4],
        } if sec_on("looking_for") else None,
        "experience": experience_items[:5] if sec_on("experience") else [],
        "projects": project_facts[:5] if sec_on("projects") else [],
        "education_visible": sec_on("education"),
        "booking_enabled": bool((profile.get("booking_availability") or {}).get("enabled")),
        "show_qr_button": profile.get("show_qr_button") is not False,
        "show_refer_button": profile.get("show_refer_button") is not False,
        "photo_url": f"/profile/public/{get_profile_slug(email)}/photo",
        "has_photo": bool(profile.get("profile_photo_b64") or False),
        # New fields for the redesigned two-column web profile. All
        # zero-cost: skill_groups from rule-based clustering,
        # dilly_take from a template (or cached LLM result if one
        # exists).
        "skill_groups": skill_groups,
        "dilly_take":   dilly_take,
        # Situation-aware, always-positive framing. Sensitive paths
        # (dropout, refugee, disabled, etc.) resolve to null here, so
        # the public page never leaks stigma.
        "identity_tag":        _situation_public.get("identity_tag"),
        "identity_accent":     _situation_public.get("accent_color"),
        # Mission statement — user-owned, lives on profile fields.
        # We surface whichever is populated. Never auto-generated by
        # an LLM during a view.
        "mission":      (profile.get("profile_bio") or profile.get("mission_statement") or "").strip() or None,
        # Role + company for holders so the new layout can surface
        # the right subtitle instead of "Major / School".
        "current_role":    (profile.get("current_role") or "").strip() or None,
        "current_company": (profile.get("current_company") or "").strip() or None,
    }

    return JSONResponse(
        content=out,
        headers={
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/profile/web/{slug}/photo")
async def get_web_profile_photo(slug: str, prefix: str | None = None):
    """Serve profile photo by readable slug. No auth."""
    from projects.dilly.api.profile_store import get_profile_by_readable_slug, get_profile_photo_path
    profile = get_profile_by_readable_slug(slug, user_type_prefix=prefix)
    if not profile:
        raise errors.not_found("Not found.")
    email = (profile.get("email") or "").strip().lower()
    path = get_profile_photo_path(email)
    if not path or not os.path.isfile(path):
        raise errors.not_found("No photo.")
    ext = os.path.splitext(path)[1].lower()
    media = {".png": "image/png", ".webp": "image/webp"}.get(ext, "image/jpeg")
    return FileResponse(path, media_type=media, headers={"Cache-Control": "public, max-age=300"})


@router.post("/profile/generate-slug")
async def generate_slug_endpoint(request: Request):
    """Generate or return the user's human-readable profile slug."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    from projects.dilly.api.profile_store import (
        generate_readable_slug,
        get_profile as _get_profile,
    )
    slug = generate_readable_slug(email)
    profile = _get_profile(email) or {}
    user_type = profile.get("user_type") or "student"
    is_student = user_type not in ("general", "professional")
    prefix = "s" if is_student else "p"
    return {"slug": slug, "prefix": prefix, "url": f"https://hellodilly.com/{prefix}/{slug}"}


# ---------------------------------------------------------------------------
# Per-fact web visibility: atomic hide/show endpoints
# Safer than PATCH /profile with the whole web_profile_settings blob because
# these just mutate the hidden_fact_ids list in place and return it.
# ---------------------------------------------------------------------------

def _toggle_fact_visibility(request: Request, body: dict, hide: bool) -> dict:
    """Shared logic for hide/show-fact. Wraps everything so any exception
    surfaces the real error type in the 500 detail, and every step logs."""
    tag = "[hide-fact]" if hide else "[show-fact]"
    try:
        print(f"{tag} called, body={body}", flush=True)
        user = deps.require_auth(request)
        email = (user.get("email") or "").strip().lower()
        print(f"{tag} email={email}", flush=True)
        if not email:
            raise HTTPException(status_code=401, detail="Not authenticated.")
        fact_id = str(body.get("fact_id") or "").strip()
        if not fact_id:
            raise HTTPException(status_code=400, detail="fact_id required.")
        from projects.dilly.api.profile_store import save_profile, get_profile as _get_profile
        print(f"{tag} reading profile…", flush=True)
        profile = _get_profile(email) or {}
        print(f"{tag} profile keys={list(profile.keys())[:10]} web_settings_type={type(profile.get('web_profile_settings')).__name__}", flush=True)
        web_settings_raw = profile.get("web_profile_settings") or {}
        # Defensive: if someone ever saved this as a string, coerce back to dict.
        if isinstance(web_settings_raw, str):
            import json as _json
            try:
                web_settings_raw = _json.loads(web_settings_raw)
            except Exception:
                web_settings_raw = {}
        if not isinstance(web_settings_raw, dict):
            web_settings_raw = {}
        web_settings = dict(web_settings_raw)
        existing = web_settings.get("hidden_fact_ids")
        if not isinstance(existing, list):
            existing = []
        if hide:
            hidden = list(existing)
            if fact_id not in hidden:
                hidden.append(fact_id)
        else:
            hidden = [x for x in existing if x != fact_id]
        web_settings["hidden_fact_ids"] = hidden
        print(f"{tag} saving hidden count={len(hidden)}…", flush=True)
        save_profile(email, {"web_profile_settings": web_settings})
        print(f"{tag} OK email={email} fact_id={fact_id} count={len(hidden)}", flush=True)
        return {"hidden_fact_ids": hidden, "count": len(hidden)}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        err_msg = f"{type(e).__name__}: {str(e)[:200]}"
        print(f"{tag} UNEXPECTED ERROR: {err_msg}", flush=True)
        raise HTTPException(status_code=500, detail=err_msg)


@router.post("/profile/web/hide-fact")
async def hide_web_fact(request: Request, body: dict = Body(...)):
    return _toggle_fact_visibility(request, body, hide=True)


@router.post("/profile/web/show-fact")
async def show_web_fact(request: Request, body: dict = Body(...)):
    return _toggle_fact_visibility(request, body, hide=False)


# ---------------------------------------------------------------------------
# Web Profile Connect (visitor wants to connect with the user)
# ---------------------------------------------------------------------------

@router.post("/profile/web/{slug}/connect")
async def web_profile_connect(slug: str, request: Request, prefix: str | None = None):
    """Visitor sends a connection request to a Dilly user via their web profile. Never exposes user email."""
    from projects.dilly.api.profile_store import get_profile_by_readable_slug

    profile = get_profile_by_readable_slug(slug, user_type_prefix=prefix)
    if not profile:
        raise errors.not_found("Profile not found.")
    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise errors.not_found("Profile not found.")

    body = await request.json()
    visitor_name = (body.get("name") or "").strip()[:100]
    visitor_email = (body.get("email") or "").strip()[:200]
    visitor_company = (body.get("company") or "").strip()[:100]
    message = (body.get("message") or "").strip()[:200]

    if not visitor_name or not visitor_email:
        raise HTTPException(status_code=400, detail="Name and email are required.")

    # Store in DB
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS web_profile_connections (
                    id SERIAL PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    visitor_name TEXT NOT NULL,
                    visitor_email TEXT NOT NULL,
                    visitor_company TEXT,
                    message TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    status TEXT DEFAULT 'pending'
                )
            """)
            cur.execute(
                """INSERT INTO web_profile_connections (user_email, visitor_name, visitor_email, visitor_company, message)
                   VALUES (%s, %s, %s, %s, %s)""",
                (email, visitor_name, visitor_email, visitor_company, message),
            )
            conn.commit()
    except Exception as e:
        print(f"[WEB-CONNECT] Error storing connection: {e}", flush=True)

    # Send email notification to the profile owner (never expose their email to visitor)
    try:
        from projects.dilly.api.email_sender import send_email
        user_name = (profile.get("name") or "").split()[0] or "there"
        subject = f"Someone wants to connect with you on Dilly"
        body_text = (
            f"Hey {user_name},\n\n"
            f"{visitor_name}"
            + (f" from {visitor_company}" if visitor_company else "")
            + f" ({visitor_email}) wants to connect with you.\n\n"
            + (f'They said: "{message}"\n\n' if message else "")
            + "You can reply to them directly at their email address above.\n\n"
            + "- Dilly"
        )
        send_email(email, subject, body_text)
    except Exception as e:
        print(f"[WEB-CONNECT] Email notification failed: {e}", flush=True)

    return JSONResponse(
        content={"ok": True, "message": f"Message sent! {profile.get('name', 'They').split()[0]} will get back to you."},
        headers={"Access-Control-Allow-Origin": "*"},
    )


# ---------------------------------------------------------------------------
# Public Profile Narratives (AI-generated, cached)
# ---------------------------------------------------------------------------

import hashlib as _hashlib
import time as _time
from collections import OrderedDict as _OrderedDict

_NARRATIVE_WEB_CACHE: _OrderedDict[str, dict] = _OrderedDict()
_NARRATIVE_WEB_TTL = 7 * 86400  # 7 days
_NARRATIVE_WEB_MAX = 500


@router.get("/profile/web/{slug}/narratives")
async def get_web_profile_narratives(slug: str, prefix: str | None = None):
    """AI-generated narrative sections for the public profile page.
    Cached per user, regenerated when profile changes. No auth.
    """
    from projects.dilly.api.profile_store import get_profile_by_readable_slug
    from projects.dilly.api.memory_surface_store import get_memory_surface

    profile = get_profile_by_readable_slug(slug, user_type_prefix=prefix)
    if not profile:
        raise errors.not_found("Profile not found.")
    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise errors.not_found("Profile not found.")

    # Build profile text for the LLM
    surface = get_memory_surface(email)
    facts = surface.get("items") or []

    # Respect per-fact web visibility (same source as /profile/web/{slug} aggregator)
    _web_settings = profile.get("web_profile_settings") or {}
    hidden_fact_ids = set(_web_settings.get("hidden_fact_ids") or [])

    # Filter out private categories + user-hidden facts
    PRIVATE = frozenset({"challenge", "concern", "weakness", "fear", "personal", "contact", "phone", "email_address"})
    public_facts = [
        f for f in facts
        if (f.get("category") or "").lower() not in PRIVATE
        and (f.get("id") or "") not in hidden_fact_ids
    ]

    if len(public_facts) < 3:
        return JSONResponse(
            content={"impact_lines": [], "differentiator": None, "skills_with_evidence": []},
            headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"},
        )

    # Profile hash for cache — include hidden_fact_ids so hiding a fact invalidates cache
    fact_text = "|".join(f"{f.get('label','')}:{f.get('value','')}" for f in public_facts[:40])
    hidden_text = ",".join(sorted(hidden_fact_ids))
    p_hash = _hashlib.md5(f"{fact_text}#{hidden_text}".encode()).hexdigest()[:12]
    cache_key = f"webnarr2:{slug}"

    # Check cache
    cached = _NARRATIVE_WEB_CACHE.get(cache_key)
    if cached and _time.time() - cached["ts"] < _NARRATIVE_WEB_TTL and cached.get("hash") == p_hash:
        _NARRATIVE_WEB_CACHE.move_to_end(cache_key)
        return JSONResponse(
            content=cached["data"],
            headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"},
        )

    # Build profile context
    name = profile.get("name") or ""
    school = profile.get("school") or ""
    majors = profile.get("majors") or []
    experience_expansion = profile.get("experience_expansion") or []

    parts = [f"Name: {name}"]
    if school:
        parts.append(f"School: {school}")
    if majors:
        parts.append(f"Majors: {', '.join(majors)}")

    for f in public_facts[:30]:
        cat = f.get("category", "")
        label = f.get("label", "")
        value = f.get("value", "")
        if label or value:
            parts.append(f"[{cat}] {label}: {value}")

    for exp in experience_expansion[:8]:
        if not isinstance(exp, dict):
            continue
        role = exp.get("role_label", "")
        org = exp.get("organization", "")
        skills = exp.get("skills") or []
        tools = exp.get("tools_used") or []
        omitted = exp.get("omitted") or []
        if role or org:
            line = f"[EXPERIENCE] {role} at {org}"
            if skills:
                line += f" | Skills: {', '.join(skills[:8])}"
            if tools:
                line += f" | Tools: {', '.join(tools[:6])}"
            if omitted:
                line += f" | Also did: {'; '.join(omitted[:3])}"
            parts.append(line)

    profile_text = "\n".join(parts)

    # Call Claude
    first_name = (profile.get("name") or "").strip().split()[0] if profile.get("name") else "this person"

    system_prompt = (
        "You are Dilly, writing a public profile page for a student you deeply know. "
        "You have studied their entire profile. Your job: make anyone who reads this page "
        "understand who this person really is. Not a resume. Not a list. A real introduction.\n\n"
        "Never use em dashes. Never invent facts. Only cite things from their profile.\n\n"
        "Generate four things:\n\n"
        "1. INTRODUCTION: Exactly 2-3 paragraphs SEPARATED BY \\n\\n (double newline). "
        "Write in third person. Use their first name. This should read like the best "
        "recommendation letter they have ever received, written by someone who actually knows them.\n"
        "Paragraph 1: who they are and what they do. Cite specific work, projects, roles.\n"
        "Paragraph 2: what makes them different from every other student in their field. "
        "Connect dots across their experiences that reveal something non-obvious.\n"
        "Paragraph 3 (optional): where they are headed and why you believe in them.\n"
        "Each paragraph: 2-3 sentences max. Be honest, not flattering. Specific, not generic. "
        "IMPORTANT: separate each paragraph with \\n\\n in the JSON string.\n\n"
        "2. IMPACT LINES: 3-4 one-sentence statements citing specific, concrete things from their profile. "
        "Not 'passionate about technology.' Real evidence. 'Built X that did Y at Z.'\n\n"
        "3. SKILLS WITH EVIDENCE: Top 6-8 skills, each paired with a short proof from their profile.\n"
        'Format: {"skill": "Python", "evidence": "built predictive models at [org]"}\n\n'
        "4. HEADLINE: A single punchy line (under 10 words) that captures who this person is. "
        "Not a job title. Something a recruiter remembers. Like a tagline for a person.\n\n"
        "Return JSON only:\n"
        "{\n"
        f'  "introduction": "2-3 paragraphs about {first_name}",\n'
        '  "headline": "short punchy line",\n'
        '  "impact_lines": ["line 1", "line 2", "line 3"],\n'
        '  "skills_with_evidence": [{"skill": "...", "evidence": "..."}]\n'
        "}"
    )

    try:
        import anthropic
        import json as _json

        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            return JSONResponse(
                content={"impact_lines": [], "differentiator": None, "skills_with_evidence": []},
                headers={"Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*"},
            )

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1500,
            temperature=0.35,
            system=system_prompt,
            messages=[{"role": "user", "content": f"---PROFILE---\n{profile_text}\n---END PROFILE---"}],
        )
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response(email, FEATURES.PROFILE, response,
                                        metadata={"op": "web_narratives"})
        except Exception:
            pass

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()

        parsed = _json.loads(raw)

        data = {
            "introduction": parsed.get("introduction") or None,
            "headline": parsed.get("headline") or None,
            "impact_lines": (parsed.get("impact_lines") or [])[:4],
            "skills_with_evidence": (parsed.get("skills_with_evidence") or [])[:8],
        }

    except Exception as e:
        print(f"[WEB-NARRATIVES] Error: {e}", flush=True)
        data = {"introduction": None, "headline": None, "impact_lines": [], "skills_with_evidence": []}

    # Cache
    _NARRATIVE_WEB_CACHE[cache_key] = {"data": data, "ts": _time.time(), "hash": p_hash}
    _NARRATIVE_WEB_CACHE.move_to_end(cache_key)
    while len(_NARRATIVE_WEB_CACHE) > _NARRATIVE_WEB_MAX:
        _NARRATIVE_WEB_CACHE.popitem(last=False)

    return JSONResponse(
        content=data,
        headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"},
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
    """Return the curated list of interests/fields for the UI picker.
    Now also returns grouped layout + personalized recommendations
    when the user is authenticated."""
    from projects.dilly.api.interests import (
        INTERESTS_LIST, EDUCATION_LEVELS, INTEREST_GROUPS,
        recommend_interests_for_student,
    )

    recommended: list = []
    try:
        user = deps.require_auth(request)
        email = (user.get("email") or "").strip().lower()
        if email:
            from projects.dilly.api.profile_store import get_profile
            profile = get_profile(email) or {}
            majors = profile.get("majors") or ([profile.get("major")] if profile.get("major") else [])
            # Pull skills from Dilly Profile experience_expansion
            skills: list = []
            tools: list = []
            for exp in (profile.get("experience_expansion") or []):
                if isinstance(exp, dict):
                    skills.extend(exp.get("skills") or [])
                    tools.extend(exp.get("tools_used") or [])
            recommended = recommend_interests_for_student(majors, skills[:20], tools[:20])
    except Exception:
        pass  # unauthenticated or no profile — no recommendations

    return {
        "interests": INTERESTS_LIST,
        "groups": INTEREST_GROUPS,
        "recommended": recommended,
        "education_levels": EDUCATION_LEVELS,
    }


# ── Dilly Card (shareable visual business card) ──────────────────────────────

@router.get("/profile/dilly-card")
async def get_dilly_card(request: Request):
    """Generate a beautiful SVG Dilly Card for sharing. Returns SVG with Content-Type image/svg+xml."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile
    profile = get_profile(email) or {}

    name = (profile.get("name") or "Student").strip()
    first = name.split()[0] if name else "Student"
    cohort = profile.get("cohort") or profile.get("track") or "General"
    school = "University of Tampa" if profile.get("school_id") == "utampa" else (profile.get("school_name") or "")
    major = (profile.get("majors") or [None])[0] or profile.get("major") or ""

    # Get scores from DB
    smart, grit, build, dilly_score = 0, 0, 0, 0
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
        cur.execute("SELECT cohort_scores FROM students WHERE LOWER(email) = LOWER(%s)", (email,))
        row = cur.fetchone()
        if row and row["cohort_scores"]:
            cs = row["cohort_scores"]
            if isinstance(cs, str):
                cs = json.loads(cs)
            # Find primary/major cohort
            for cname, cdata in cs.items():
                if cdata.get("level") in ("major", "primary"):
                    smart = round(cdata.get("smart", 0))
                    grit = round(cdata.get("grit", 0))
                    build = round(cdata.get("build", 0))
                    dilly_score = round(cdata.get("dilly_score", 0))
                    cohort = cname
                    break
        conn.close()
    except Exception:
        pass

    def _esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    # Score arc helper (for the circular score ring)
    import math
    def _arc(score: int, cx: int, cy: int, r: int) -> str:
        angle = (score / 100) * 360
        rad = math.radians(angle - 90)
        x = cx + r * math.cos(rad)
        y = cy + r * math.sin(rad)
        large = 1 if angle > 180 else 0
        sx = cx + r * math.cos(math.radians(-90))
        sy = cy + r * math.sin(math.radians(-90))
        if score >= 100:
            return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#1652F0" stroke-width="4"/>'
        if score <= 0:
            return ""
        return f'<path d="M {sx} {sy} A {r} {r} 0 {large} 1 {x:.1f} {y:.1f}" fill="none" stroke="#1652F0" stroke-width="4" stroke-linecap="round"/>'

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340" viewBox="0 0 600 340">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0D1117"/>
      <stop offset="100%" stop-color="#161B22"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1652F0"/>
      <stop offset="100%" stop-color="#4F8AFF"/>
    </linearGradient>
  </defs>

  <!-- Card background -->
  <rect width="600" height="340" rx="20" fill="url(#bg)"/>
  <rect x="0" y="0" width="600" height="4" rx="2" fill="url(#accent)"/>

  <!-- Dilly logo text -->
  <text x="32" y="42" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="800" fill="#1652F0" letter-spacing="2">DILLY</text>

  <!-- Name -->
  <text x="32" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="800" fill="#F0F6FC">{_esc(name)}</text>

  <!-- Cohort + school -->
  <text x="32" y="118" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#8B949E">{_esc(cohort)}</text>
  <text x="32" y="138" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#484F58">{_esc(school)}{(' · ' + _esc(major)) if major else ''}</text>

  <!-- Score ring -->
  <circle cx="520" cy="90" r="38" fill="none" stroke="#21262D" stroke-width="4"/>
  {_arc(dilly_score, 520, 90, 38)}
  <text x="520" y="85" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="800" fill="#F0F6FC" text-anchor="middle" dominant-baseline="central">{dilly_score}</text>
  <text x="520" y="108" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="#484F58" text-anchor="middle" letter-spacing="1">DILLY SCORE</text>

  <!-- Dimension bars -->
  <text x="32" y="185" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#484F58" letter-spacing="1.5">SMART</text>
  <rect x="100" y="176" width="200" height="6" rx="3" fill="#21262D"/>
  <rect x="100" y="176" width="{min(200, smart * 2)}" height="6" rx="3" fill="#58A6FF"/>
  <text x="310" y="184" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#58A6FF">{smart}</text>

  <text x="32" y="215" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#484F58" letter-spacing="1.5">GRIT</text>
  <rect x="100" y="206" width="200" height="6" rx="3" fill="#21262D"/>
  <rect x="100" y="206" width="{min(200, grit * 2)}" height="6" rx="3" fill="#D29922"/>
  <text x="310" y="214" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#D29922">{grit}</text>

  <text x="32" y="245" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#484F58" letter-spacing="1.5">BUILD</text>
  <rect x="100" y="236" width="200" height="6" rx="3" fill="#21262D"/>
  <rect x="100" y="236" width="{min(200, build * 2)}" height="6" rx="3" fill="#3FB950"/>
  <text x="310" y="244" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#3FB950">{build}</text>

  <!-- Bottom tagline -->
  <line x1="32" y1="280" x2="568" y2="280" stroke="#21262D" stroke-width="1"/>
  <text x="32" y="310" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#484F58">Career readiness, scored.</text>
  <text x="568" y="310" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#1652F0" text-anchor="end" font-weight="600">trydilly.com</text>
</svg>'''

    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={
            "Content-Disposition": f'inline; filename="dilly-card-{first.lower()}.svg"',
            "Cache-Control": "no-store",
        },
    )