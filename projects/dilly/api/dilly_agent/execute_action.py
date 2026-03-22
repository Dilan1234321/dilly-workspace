"""Action execution layer for Dilly agent."""

from __future__ import annotations

import time
import uuid
from datetime import date, datetime, timezone
from typing import Any

from projects.dilly.api.conversation_output_store import create_action_items, list_actions, update_action, delete_action
from projects.dilly.api.memory_surface_store import add_memory_item, get_memory_surface, save_memory_surface
from projects.dilly.api.profile_store import get_profile, save_profile
from projects.dilly.api.resume_loader import load_parsed_resume_for_voice
from projects.dilly.api.routers.applications import _load_applications, _save_applications
from projects.dilly.api.audit_history import append_audit


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_date(iso: str) -> date | None:
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).date()
    except Exception:
        return None


def _deadline_exists(deadlines: list[dict[str, Any]], label: str) -> bool:
    key = " ".join(str(label or "").strip().lower().split())
    return any(" ".join(str(d.get("label") or "").strip().lower().split()) == key for d in deadlines if isinstance(d, dict))


def _application_exists(apps: list[dict[str, Any]], company: str, role: str) -> bool:
    c = " ".join(str(company or "").strip().lower().split())
    r = " ".join(str(role or "").strip().lower().split())
    for app in apps:
        if not isinstance(app, dict):
            continue
        if " ".join(str(app.get("company") or "").strip().lower().split()) == c and " ".join(str(app.get("role") or "").strip().lower().split()) == r:
            return True
    return False


def execute_action(action: str, extracted_data: dict[str, Any], uid: str, conv_id: str = "voice", confirmed: bool = False) -> dict[str, Any]:
    a = str(action or "").strip().upper()
    data = extracted_data if isinstance(extracted_data, dict) else {}
    profile = get_profile(uid) or {}
    deadlines = profile.get("deadlines") if isinstance(profile.get("deadlines"), list) else []

    # Hard guards.
    if a.startswith("DELETE_") and not confirmed:
        return {"guarded": True, "reason": "Delete actions require explicit confirmation."}
    if a in {"UPDATE_MAJOR", "UPDATE_TRACK"} and not confirmed:
        return {"guarded": True, "reason": "Major/track updates require explicit confirmation."}

    if a == "CREATE_DEADLINE":
        label = str(data.get("label") or data.get("deadline_label") or "").strip()
        date_iso = str(data.get("date") or data.get("date_resolved") or "").strip()
        if not label or not date_iso:
            return {"skipped": True, "reason": "Missing label/date."}
        d = _safe_date(date_iso)
        if d is None or d < date.today():
            return {"skipped": True, "reason": "Past date requires clarification."}
        if _deadline_exists(deadlines, label):
            return {"skipped": True, "reason": "Duplicate deadline."}
        row = {"id": str(uuid.uuid4()), "label": label, "date": date_iso, "createdBy": "voice", "source": "voice", "completedAt": None}
        deadlines.append(row)
        save_profile(uid, {"deadlines": deadlines})
        return row

    if a == "CREATE_SUB_DEADLINE":
        parent_label = str(data.get("parent_label") or data.get("deadline_label") or "").strip()
        label = str(data.get("label") or "").strip()
        date_iso = str(data.get("date") or "").strip()
        if not parent_label or not label or not date_iso:
            return {"skipped": True, "reason": "Missing sub-deadline fields."}
        d = _safe_date(date_iso)
        if d is None or d < date.today():
            return {"skipped": True, "reason": "Past date requires clarification."}
        for row in deadlines:
            if " ".join(str(row.get("label") or "").strip().lower().split()) != " ".join(parent_label.lower().split()):
                continue
            sub = row.get("subDeadlines") if isinstance(row.get("subDeadlines"), list) else []
            sub.append({"id": str(uuid.uuid4()), "label": label, "date": date_iso})
            row["subDeadlines"] = sub
            save_profile(uid, {"deadlines": deadlines})
            return {"parent": row.get("id"), "sub_deadline_label": label, "date": date_iso}
        return {"skipped": True, "reason": "Parent deadline not found."}

    if a == "UPDATE_DEADLINE":
        target_label = str(data.get("target_label") or data.get("label") or "").strip()
        new_date = str(data.get("date") or "").strip()
        new_label = str(data.get("new_label") or "").strip()
        if not target_label:
            return {"skipped": True, "reason": "Missing target deadline label."}
        for row in deadlines:
            if " ".join(str(row.get("label") or "").strip().lower().split()) != " ".join(target_label.lower().split()):
                continue
            if new_date:
                d = _safe_date(new_date)
                if d is None or d < date.today():
                    return {"skipped": True, "reason": "Past date requires clarification."}
                row["date"] = new_date
            if new_label:
                row["label"] = new_label
            save_profile(uid, {"deadlines": deadlines})
            return row
        return {"skipped": True, "reason": "Deadline not found."}

    if a == "DELETE_DEADLINE":
        target_label = str(data.get("target_label") or data.get("label") or "").strip()
        target_id = str(data.get("deadline_id") or "").strip()
        kept = []
        removed = None
        for row in deadlines:
            hit_id = target_id and str(row.get("id") or "") == target_id
            hit_label = target_label and " ".join(str(row.get("label") or "").strip().lower().split()) == " ".join(target_label.lower().split())
            if hit_id or hit_label:
                removed = row
                continue
            kept.append(row)
        if not removed:
            return {"skipped": True, "reason": "Deadline not found."}
        save_profile(uid, {"deadlines": kept})
        return {"deleted_deadline": removed.get("label")}

    if a == "CREATE_ACTION_ITEM":
        text = str(data.get("text") or "").strip()
        if not text:
            return {"skipped": True, "reason": "Missing action text."}
        created = create_action_items(
            uid,
            conv_id,
            [
                {
                    "text": text,
                    "dimension": data.get("dimension"),
                    "estimated_pts": data.get("estimated_pts"),
                    "effort": data.get("effort") or "medium",
                    "action_type": data.get("action_type"),
                    "action_payload": data.get("action_payload") if isinstance(data.get("action_payload"), dict) else {},
                }
            ],
        )
        return created[0] if created else {"skipped": True, "reason": "Action duplicate or invalid."}

    if a == "COMPLETE_ACTION_ITEM":
        action_id = str(data.get("action_id") or "").strip()
        if action_id:
            out = update_action(uid, action_id, {"done": True, "done_at": _now_iso()})
            return out or {"skipped": True, "reason": "Action not found."}
        # fallback by text
        text = str(data.get("text") or "").strip().lower()
        for item in list_actions(uid):
            if text and text in str(item.get("text") or "").lower():
                out = update_action(uid, str(item.get("id") or ""), {"done": True, "done_at": _now_iso()})
                return out or {"skipped": True}
        return {"skipped": True, "reason": "Action not found."}

    if a == "SNOOZE_ACTION_ITEM":
        action_id = str(data.get("action_id") or "").strip()
        until = str(data.get("snoozed_until") or data.get("date") or "").strip()
        if not action_id or not until:
            return {"skipped": True, "reason": "Missing action_id or snoozed_until."}
        out = update_action(uid, action_id, {"snoozed_until": until})
        return out or {"skipped": True, "reason": "Action not found."}

    if a == "DELETE_ACTION_ITEM":
        action_id = str(data.get("action_id") or "").strip()
        if not action_id:
            return {"skipped": True, "reason": "Missing action_id."}
        ok = delete_action(uid, action_id)
        return {"deleted": ok}

    if a == "UPDATE_CAREER_GOAL":
        goal = str(data.get("career_goal") or data.get("value") or "").strip()
        if not goal:
            return {"skipped": True, "reason": "Missing career goal."}
        save_profile(uid, {"career_goal": goal})
        return {"career_goal": goal}

    if a == "ADD_TARGET_COMPANY":
        company = str(data.get("company") or data.get("label") or "").strip()
        if not company:
            return {"skipped": True, "reason": "Missing company."}
        existing = get_memory_surface(uid).get("items") or []
        norm = " ".join(company.lower().split())
        if any(str(i.get("category") or "") == "target_company" and " ".join(str(i.get("label") or "").lower().split()) == norm for i in existing if isinstance(i, dict)):
            return {"skipped": True, "reason": "Company already saved."}
        row = add_memory_item(
            uid,
            {
                "category": "target_company",
                "label": company,
                "value": company,
                "source": "voice",
                "action_type": "open_am_i_ready",
                "action_payload": {"company": company},
                "confidence": "medium",
                "shown_to_user": False,
            },
        )
        return row or {"skipped": True}

    if a == "REMOVE_TARGET_COMPANY":
        company = str(data.get("company") or data.get("label") or "").strip()
        if not company:
            return {"skipped": True, "reason": "Missing company."}
        surface = get_memory_surface(uid)
        items = surface.get("items") or []
        key = " ".join(company.lower().split())
        kept = [
            i
            for i in items
            if not (
                str(i.get("category") or "") == "target_company"
                and " ".join(str(i.get("label") or "").lower().split()) == key
            )
        ]
        if len(kept) == len(items):
            return {"skipped": True, "reason": "Target company not found."}
        save_memory_surface(uid, items=kept)
        return {"removed_company": company}

    if a == "UPDATE_MAJOR":
        major = str(data.get("major") or data.get("value") or "").strip()
        if not major:
            return {"skipped": True, "reason": "Missing major."}
        save_profile(uid, {"major": major})
        return {"major": major}

    if a == "UPDATE_TRACK":
        track = str(data.get("track") or data.get("value") or "").strip()
        if not track:
            return {"skipped": True, "reason": "Missing track."}
        save_profile(uid, {"track": track})
        return {"track": track}

    if a == "UPDATE_JOB_LOCATIONS":
        locs = data.get("job_locations")
        if isinstance(locs, str):
            locs = [x.strip() for x in locs.split(",") if x.strip()]
        if not isinstance(locs, list):
            return {"skipped": True, "reason": "Missing job_locations."}
        cleaned = [str(x).strip() for x in locs if str(x).strip()]
        save_profile(uid, {"job_locations": cleaned})
        return {"job_locations": cleaned}

    if a == "UPDATE_APPLICATION_TARGET":
        target = str(data.get("application_target") or "").strip()
        label = str(data.get("application_target_label") or "").strip() or None
        if not target:
            return {"skipped": True, "reason": "Missing application target."}
        save_profile(uid, {"application_target": target, "application_target_label": label})
        return {"application_target": target, "application_target_label": label}

    if a == "CREATE_APPLICATION":
        company = str(data.get("company") or "").strip()
        role = str(data.get("role") or "").strip()
        if not company or not role:
            return {"skipped": True, "reason": "Missing company/role."}
        apps = _load_applications(uid)
        if _application_exists(apps, company, role):
            return {"skipped": True, "reason": "Duplicate application."}
        row = {
            "id": str(uuid.uuid4()),
            "company": company,
            "role": role,
            "status": str(data.get("status") or "saved"),
            "applied_at": data.get("applied_at"),
            "deadline": data.get("deadline"),
            "notes": str(data.get("notes") or "")[:500] or None,
            "next_action": str(data.get("next_action") or "")[:200] or None,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "outcome_captured": False,
        }
        apps.insert(0, row)
        _save_applications(uid, apps)
        return row

    if a == "UPDATE_APPLICATION_STATUS":
        app_id = str(data.get("app_id") or "").strip()
        status = str(data.get("status") or "").strip()
        if not app_id or not status:
            return {"skipped": True, "reason": "Missing app_id/status."}
        apps = _load_applications(uid)
        for app in apps:
            if str(app.get("id") or "") != app_id:
                continue
            app["status"] = status
            app["updated_at"] = _now_iso()
            _save_applications(uid, apps)
            return app
        return {"skipped": True, "reason": "Application not found."}

    if a == "DELETE_APPLICATION":
        app_id = str(data.get("app_id") or "").strip()
        if not app_id:
            return {"skipped": True, "reason": "Missing app_id."}
        apps = _load_applications(uid)
        before = len(apps)
        apps = [a_row for a_row in apps if str(a_row.get("id") or "") != app_id]
        if len(apps) == before:
            return {"skipped": True, "reason": "Application not found."}
        _save_applications(uid, apps)
        return {"deleted": True, "app_id": app_id}

    if a == "ADD_APPLICATION_NOTE":
        app_id = str(data.get("app_id") or "").strip()
        note = str(data.get("note") or data.get("notes") or "").strip()
        if not app_id or not note:
            return {"skipped": True, "reason": "Missing app_id/note."}
        apps = _load_applications(uid)
        for app in apps:
            if str(app.get("id") or "") != app_id:
                continue
            existing = str(app.get("notes") or "").strip()
            app["notes"] = f"{existing}\n{note}"[:500].strip() if existing else note[:500]
            app["updated_at"] = _now_iso()
            _save_applications(uid, apps)
            return app
        return {"skipped": True, "reason": "Application not found."}

    if a == "TRIGGER_AUDIT":
        resume_text = load_parsed_resume_for_voice(uid, max_chars=120000) or ""
        if not resume_text.strip():
            return {"skipped": True, "reason": "No resume on file."}
        try:
            from dilly_core.auditor import run_audit
            from dilly_core.evidence_quotes import get_fallback_evidence_quotes
            result = run_audit(resume_text, candidate_name=(profile.get("name") or "Unknown"), major=(profile.get("major") or "Unknown"), filename="voice-trigger")
            scores = {"smart": result.smart_score, "grit": result.grit_score, "build": result.build_score}
            evidence = {
                "smart": f"Smart score derived from resume evidence in {result.track}.",
                "grit": f"Grit score derived from leadership/impact evidence in {result.track}.",
                "build": f"Build score derived from projects/technical evidence in {result.track}.",
            }
            audit = {
                "id": uuid.uuid4().hex,
                "ts": time.time(),
                "candidate_name": result.candidate_name,
                "detected_track": result.track,
                "major": result.major,
                "scores": scores,
                "final_score": result.final_score,
                "audit_findings": result.audit_findings or [],
                "evidence": evidence,
                "evidence_quotes": get_fallback_evidence_quotes(resume_text),
                "recommendations": [],
                "raw_logs": ["Triggered by Dilly agent"],
                "resume_text": resume_text,
                "structured_text": resume_text,
                "page_count": None,
            }
            append_audit(uid, audit)
            return {"audit_id": audit["id"], "final_score": audit["final_score"]}
        except Exception:
            return {"skipped": True, "reason": "Audit trigger failed."}

    if a == "SAVE_BULLET_REWRITE":
        rewrite = str(data.get("rewritten") or data.get("text") or "").strip()
        if not rewrite:
            return {"skipped": True, "reason": "Missing rewrite text."}
        notes = profile.get("voice_notes") if isinstance(profile.get("voice_notes"), list) else []
        notes.append(f"Bullet rewrite saved: {rewrite[:220]}")
        save_profile(uid, {"voice_notes": notes[-200:]})
        return {"saved": True}

    if a == "SAVE_RESUME_NOTE":
        note = str(data.get("note") or data.get("text") or "").strip()
        if not note:
            return {"skipped": True, "reason": "Missing resume note."}
        notes = profile.get("voice_notes") if isinstance(profile.get("voice_notes"), list) else []
        notes.append(f"Resume note: {note[:220]}")
        save_profile(uid, {"voice_notes": notes[-200:]})
        return {"saved": True}

    return {"skipped": True, "reason": "Unknown action."}

