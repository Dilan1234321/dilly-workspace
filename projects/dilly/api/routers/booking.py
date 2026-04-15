"""
Book a Chat - built-in scheduling for Dilly web profiles.

Users set availability windows in the app. Visitors pick a slot on the web profile.
Both parties get email confirmations. No external calendar tool needed.

Storage: availability + bookings stored in profile_json (same pattern as applications).
"""
import json
import os
import time
import uuid as _uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse

from projects.dilly.api import deps, errors

router = APIRouter(tags=["booking"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_availability(email: str) -> dict:
    from projects.dilly.api.profile_store import get_profile
    profile = get_profile(email) or {}
    return profile.get("booking_availability") or {
        "enabled": True,
        "timezone": "America/New_York",
        "windows": [
            {"day": 1, "start": "09:00", "end": "17:00"},
            {"day": 2, "start": "09:00", "end": "17:00"},
            {"day": 3, "start": "09:00", "end": "17:00"},
            {"day": 4, "start": "09:00", "end": "17:00"},
            {"day": 5, "start": "09:00", "end": "17:00"},
        ],
        "slot_duration": 30,
        "buffer": 15,
        "max_days_ahead": 14,
    }


def _save_availability(email: str, availability: dict) -> None:
    from projects.dilly.api.profile_store import save_profile
    save_profile(email, {"booking_availability": availability})


def _load_bookings(email: str) -> list[dict]:
    from projects.dilly.api.profile_store import get_profile
    profile = get_profile(email) or {}
    return profile.get("bookings") or []


def _save_bookings(email: str, bookings: list[dict]) -> None:
    from projects.dilly.api.profile_store import save_profile
    save_profile(email, {"bookings": bookings})


def _generate_slots(availability: dict, bookings: list[dict], days_ahead: int = 14) -> list[dict]:
    """Generate available time slots for the next N days based on availability windows."""
    if not availability.get("enabled"):
        return []

    windows = availability.get("windows") or []
    if not windows:
        return []

    slot_duration = availability.get("slot_duration", 30)
    buffer = availability.get("buffer", 15)
    tz_name = availability.get("timezone", "America/New_York")
    max_days = min(availability.get("max_days_ahead", 14), days_ahead)

    # Get booked times for collision check
    booked_times = set()
    for b in bookings:
        if b.get("status") in ("confirmed", "pending"):
            booked_times.add(b.get("datetime"))

    slots = []
    now = datetime.now(timezone.utc)
    # Minimum 2 hours from now
    earliest = now + timedelta(hours=2)

    for day_offset in range(max_days):
        date = now + timedelta(days=day_offset)
        day_of_week = date.weekday()  # 0=Mon, 6=Sun
        # Convert to our format (0=Sun, 1=Mon, ..., 6=Sat)
        dow = (day_of_week + 1) % 7

        for window in windows:
            if window.get("day") != dow:
                continue

            start_str = window.get("start", "09:00")
            end_str = window.get("end", "17:00")

            try:
                start_h, start_m = map(int, start_str.split(":"))
                end_h, end_m = map(int, end_str.split(":"))
            except (ValueError, AttributeError):
                continue

            # Generate slots within this window
            current_minutes = start_h * 60 + start_m
            end_minutes = end_h * 60 + end_m

            while current_minutes + slot_duration <= end_minutes:
                slot_h = current_minutes // 60
                slot_m = current_minutes % 60
                slot_dt = date.replace(hour=slot_h, minute=slot_m, second=0, microsecond=0)

                # Skip if in the past or too soon
                if slot_dt > earliest:
                    iso = slot_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                    if iso not in booked_times:
                        # Format for display
                        day_label = slot_dt.strftime("%A, %B %d")
                        time_label = slot_dt.strftime("%-I:%M %p")
                        slots.append({
                            "datetime": iso,
                            "date_label": day_label,
                            "time_label": time_label,
                            "duration": slot_duration,
                        })

                current_minutes += slot_duration + buffer

    return slots[:50]  # Cap at 50 slots


# ---------------------------------------------------------------------------
# Authenticated endpoints (user manages their availability)
# ---------------------------------------------------------------------------

@router.get("/booking/availability")
async def get_availability(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    return _load_availability(email)


@router.patch("/booking/availability")
async def update_availability(request: Request, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    current = _load_availability(email)

    # Update only provided fields
    if "enabled" in body:
        current["enabled"] = bool(body["enabled"])
    if "timezone" in body:
        current["timezone"] = str(body["timezone"])[:50]
    if "windows" in body and isinstance(body["windows"], list):
        current["windows"] = body["windows"][:20]
    if "slot_duration" in body:
        current["slot_duration"] = max(15, min(120, int(body["slot_duration"])))
    if "buffer" in body:
        current["buffer"] = max(0, min(60, int(body["buffer"])))
    if "max_days_ahead" in body:
        current["max_days_ahead"] = max(1, min(30, int(body["max_days_ahead"])))

    _save_availability(email, current)
    return {"ok": True, "availability": current}


@router.get("/booking/my-bookings")
async def list_my_bookings(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    bookings = _load_bookings(email)
    # Only return upcoming
    now = datetime.now(timezone.utc).isoformat()
    upcoming = [b for b in bookings if (b.get("datetime") or "") >= now[:19]]
    return {"bookings": upcoming}


# ---------------------------------------------------------------------------
# Public endpoints (visitors book a chat)
# ---------------------------------------------------------------------------

@router.get("/booking/slots/{slug}")
async def get_available_slots(slug: str, prefix: str | None = None):
    """Get available time slots for a user's public profile. No auth required."""
    from projects.dilly.api.profile_store import get_profile_by_readable_slug

    profile = get_profile_by_readable_slug(slug, user_type_prefix=prefix)
    if not profile:
        raise errors.not_found("Profile not found.")

    email = (profile.get("email") or "").strip().lower()
    availability = _load_availability(email)

    if not availability.get("enabled"):
        return JSONResponse(
            content={"enabled": False, "slots": [], "name": (profile.get("name") or "").split()[0]},
            headers={"Access-Control-Allow-Origin": "*"},
        )

    bookings = _load_bookings(email)
    slots = _generate_slots(availability, bookings)

    # Group by date for display
    grouped: dict[str, list] = {}
    for s in slots:
        grouped.setdefault(s["date_label"], []).append(s)

    return JSONResponse(
        content={
            "enabled": True,
            "slots": slots,
            "grouped": grouped,
            "timezone": availability.get("timezone", "America/New_York"),
            "slot_duration": availability.get("slot_duration", 30),
            "name": (profile.get("name") or "").split()[0],
        },
        headers={"Access-Control-Allow-Origin": "*"},
    )


@router.post("/booking/book/{slug}")
async def book_slot(slug: str, request: Request, prefix: str | None = None):
    """Book a time slot on a user's profile. No auth required."""
    from projects.dilly.api.profile_store import get_profile_by_readable_slug

    profile = get_profile_by_readable_slug(slug, user_type_prefix=prefix)
    if not profile:
        raise errors.not_found("Profile not found.")

    email = (profile.get("email") or "").strip().lower()
    availability = _load_availability(email)

    if not availability.get("enabled"):
        raise errors.validation_error("Booking is not available for this profile.")

    body = await request.json()
    slot_datetime = (body.get("datetime") or "").strip()
    visitor_name = (body.get("name") or "").strip()[:100]
    visitor_email = (body.get("email") or "").strip()[:200]
    visitor_message = (body.get("message") or "").strip()[:300]

    if not slot_datetime or not visitor_name or not visitor_email:
        raise errors.validation_error("Date/time, name, and email are required.")

    # Check slot is still available
    bookings = _load_bookings(email)
    for b in bookings:
        if b.get("datetime") == slot_datetime and b.get("status") in ("confirmed", "pending"):
            raise errors.validation_error("This time slot is no longer available.")

    # Create booking
    booking = {
        "id": _uuid.uuid4().hex[:12],
        "datetime": slot_datetime,
        "duration": availability.get("slot_duration", 30),
        "visitor_name": visitor_name,
        "visitor_email": visitor_email,
        "message": visitor_message,
        "status": "confirmed",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    bookings.append(booking)
    _save_bookings(email, bookings)

    # Send email to profile owner
    user_name = (profile.get("name") or "").split()[0] or "there"
    try:
        from projects.dilly.api.email_sender import send_email
        # Parse the datetime for display
        try:
            dt = datetime.fromisoformat(slot_datetime.replace("Z", "+00:00"))
            time_display = dt.strftime("%A, %B %d at %-I:%M %p UTC")
        except Exception:
            time_display = slot_datetime

        subject = f"New chat booked: {visitor_name}"
        body_text = (
            f"Hey {user_name},\n\n"
            f"{visitor_name} ({visitor_email}) booked a chat with you.\n\n"
            f"When: {time_display}\n"
            f"Duration: {booking['duration']} minutes\n"
            + (f"Message: \"{visitor_message}\"\n\n" if visitor_message else "\n")
            + f"Reply to {visitor_email} to confirm details or send a meeting link.\n\n"
            + "- Dilly"
        )
        send_email(email, subject, body_text)
    except Exception as e:
        print(f"[BOOKING] Email to owner failed: {e}", flush=True)

    # Send confirmation to visitor
    try:
        from projects.dilly.api.email_sender import send_email
        owner_name = (profile.get("name") or "").strip()
        try:
            dt = datetime.fromisoformat(slot_datetime.replace("Z", "+00:00"))
            time_display = dt.strftime("%A, %B %d at %-I:%M %p UTC")
        except Exception:
            time_display = slot_datetime

        subject = f"Chat confirmed with {owner_name}"
        body_text = (
            f"Hey {visitor_name},\n\n"
            f"Your chat with {owner_name} is confirmed.\n\n"
            f"When: {time_display}\n"
            f"Duration: {booking['duration']} minutes\n\n"
            f"{owner_name} will reach out with meeting details.\n\n"
            + "- Dilly"
        )
        send_email(visitor_email, subject, body_text)
    except Exception as e:
        print(f"[BOOKING] Confirmation email failed: {e}", flush=True)

    return JSONResponse(
        content={
            "ok": True,
            "booking": booking,
            "message": f"Chat booked! {user_name} will reach out with meeting details.",
        },
        headers={"Access-Control-Allow-Origin": "*"},
    )
