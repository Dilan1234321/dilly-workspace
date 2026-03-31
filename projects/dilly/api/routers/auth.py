"""
Auth, session, Stripe checkout, and family-invite endpoints.
"""
import os
import re
from fastapi import APIRouter, Body, HTTPException, Request

from projects.dilly.api import deps, errors
from projects.dilly.api.openapi_helpers import ERROR_RESPONSES
from projects.dilly.api.schemas import (
    AuthSendCodeRequest,
    AuthVerifyCodeRequest,
    RedeemGiftRequest,
    BetaUnlockRequest,
    GiftCheckoutRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _stripe_configured() -> bool:
    return bool(
        os.environ.get("STRIPE_SECRET_KEY", "").strip()
        and os.environ.get("STRIPE_PRICE_ID", "").strip()
    )


def _stripe_gift_configured() -> bool:
    return bool(
        os.environ.get("STRIPE_SECRET_KEY", "").strip()
        and os.environ.get("STRIPE_GIFT_6M_PRICE_ID", "").strip()
        and os.environ.get("STRIPE_GIFT_12M_PRICE_ID", "").strip()
    )


def _stripe_family_configured() -> bool:
    return bool(
        os.environ.get("STRIPE_SECRET_KEY", "").strip()
        and os.environ.get("STRIPE_FAMILY_PRICE_ID", "").strip()
    )


@router.post("/send-magic-link")
async def send_magic_link(request: Request, body: AuthSendCodeRequest):
    """Send magic link to email. In dev, returns magic_link URL. Only allowed school domains."""
    email = (body.email or "").strip().lower()
    if not re.search(r"\.edu\s*$", email):
        raise errors.validation_error("Dilly is for students — use your .edu email.")
    from projects.dilly.api.schools import get_school_from_email
    if not get_school_from_email(email):
        raise errors.validation_error(
            "Dilly isn't available at your school yet.",
        )
    try:
        from projects.dilly.api.auth_store import create_magic_token
        token = create_magic_token(email)
    except ValueError as e:
        raise errors.validation_error(str(e))
    base = str(request.base_url).rstrip("/")
    api_magic_link = f"{base}/auth/verify?token={token}"
    return {
        "ok": True,
        "message": "Check your email for the sign-in link.",
        "magic_token": token,
        "magic_link": api_magic_link,
    }


@router.post("/send-verification-code", responses=ERROR_RESPONSES)
async def send_verification_code(request: Request, body: AuthSendCodeRequest):
    """Send a 6-digit verification code to the user's .edu email."""
    deps.rate_limit(request, "send-code", max_requests=5, window_sec=300)
    email = (body.email or "").strip().lower()
    if not re.search(r"\.edu\s*$", email):
        raise errors.validation_error("Dilly is for students — use your .edu email.")
    from projects.dilly.api.schools import get_school_from_email
    if not get_school_from_email(email):
        raise errors.validation_error(
            "Dilly isn't available at your school yet.",
        )
    try:
        from projects.dilly.api.auth_store import create_verification_code
        from projects.dilly.api.email_sender import send_verification_email
        code = create_verification_code(email)
        school = get_school_from_email(email)
        sent, code_for_dev = send_verification_email(email, code, school)
    except ValueError as e:
        raise errors.validation_error(str(e))
    out = {"ok": True, "message": "Check your inbox. No spam, we promise."}
    if deps.is_dev_allowed(request):
        out["dev_code"] = code
    elif not sent:
        raise errors.service_unavailable("We couldn't send the verification email. Try again in a minute.")
    return out


@router.post("/verify-code", responses=ERROR_RESPONSES)
async def auth_verify_code(request: Request, body: AuthVerifyCodeRequest):
    """Verify 6-digit code and sign in. Returns session token and user."""
    deps.rate_limit(request, "verify-code", max_requests=10, window_sec=300)
    email = (body.email or "").strip().lower()
    code = (body.code or "").strip()
    from projects.dilly.api.schools import get_school_from_email
    if not get_school_from_email(email):
        raise errors.validation_error("Dilly isn't available at your school yet.")
    from projects.dilly.api.auth_store import (
        verify_verification_code,
        create_session,
        get_session,
    )
    if not verify_verification_code(email, code):
        raise errors.validation_error("Invalid or expired code. Request a new one.")
    session_token = create_session(email)
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists
        ensure_profile_exists(email)
    except Exception:
        pass
    # Guarantee a students row exists from the moment email is verified
    try:
        import psycopg2, os as _os
        _pw = _os.environ.get("DILLY_DB_PASSWORD", "")
        if not _pw:
            try: _pw = open(_os.path.expanduser("~/.dilly_db_pass")).read().strip()
            except: pass
        _school_info = get_school_from_email(email) or {}
        _conn = psycopg2.connect(
            host=_os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
            database="dilly", user="dilly_admin", password=_pw, sslmode="require"
        )
        _cur = _conn.cursor()
        _cur.execute(
            """INSERT INTO students (email, school, school_id)
               VALUES (%s, %s, %s)
               ON CONFLICT (email) DO NOTHING""",
            (email, _school_info.get("name") or "", _school_info.get("id") or "")
        )
        _conn.commit()
        _conn.close()
    except Exception:
        pass
    user = get_session(session_token)
    return {
        "token": session_token,
        "user": {"email": user["email"], "subscribed": user["subscribed"]},
    }


@router.get("/verify")
async def auth_verify(request: Request, token: str = ""):
    """Verify magic-link token and log user in. Returns session token and user."""
    if not token:
        raise errors.bad_request("Missing token.")
    try:
        from projects.dilly.api.auth_store import verify_magic_token, create_session
        email = verify_magic_token(token)
    except Exception:
        raise errors.validation_error("Invalid or expired link.")
    if not email:
        raise errors.validation_error("Invalid or expired link.")
    session_token = create_session(email)
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists
        ensure_profile_exists(email)
    except Exception:
        pass
    from projects.dilly.api.auth_store import get_session
    user = get_session(session_token)
    return {
        "token": session_token,
        "user": {"email": user["email"], "subscribed": user["subscribed"]},
    }


@router.get("/me")
async def auth_me(request: Request):
    """Return current user if valid Bearer token."""
    user = deps.bearer_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return {"email": user["email"], "subscribed": user["subscribed"]}


@router.post("/logout")
async def auth_logout(request: Request):
    """Invalidate the session token server-side."""
    auth = (request.headers.get("authorization") or "").strip()
    token = auth.removeprefix("Bearer ").strip() if auth.lower().startswith("bearer ") else ""
    if token:
        try:
            from projects.dilly.api.auth_store import delete_session
            delete_session(token)
        except Exception:
            pass
    return {"ok": True}


@router.post("/dev-unlock")
async def auth_dev_unlock(request: Request):
    """Dev only: mark current user as subscribed. Allowed when DILLY_DEV=1 or localhost."""
    if not deps.is_dev_allowed(request):
        raise errors.forbidden("Dev unlock is disabled.")
    u = deps.bearer_user(request)
    if not u:
        raise errors.unauthorized("Not signed in.")
    try:
        from projects.dilly.api.auth_store import set_subscribed
        set_subscribed(u["email"], True)
    except Exception:
        raise errors.internal("Could not update account.")
    return {"ok": True, "message": "Account unlocked. Refresh or re-fetch /auth/me."}


@router.post("/beta-unlock")
async def auth_beta_unlock(request: Request, body: BetaUnlockRequest):
    """Beta test: enter a beta code to unlock full access. Set DILLY_BETA_CODE env var."""
    u = deps.bearer_user(request)
    if not u:
        raise errors.unauthorized("Sign in first.")
    code = (body.code or "").strip()
    expected = (os.environ.get("DILLY_BETA_CODE") or "").strip()
    if not expected:
        raise errors.forbidden("Beta access is not available right now.")
    if code != expected:
        raise errors.forbidden("Invalid beta code.")
    try:
        from projects.dilly.api.auth_store import set_subscribed
        set_subscribed(u["email"], True)
    except Exception:
        raise errors.internal("Could not unlock account.")
    return {"ok": True, "message": "Welcome to the Meridian beta. You're in."}


@router.post("/create-checkout-session")
async def create_checkout_session(request: Request):
    """Create a Stripe Checkout Session for subscription. Returns { url } or { url: null } if not configured."""
    u = deps.bearer_user(request)
    if not u:
        raise errors.unauthorized("Sign in to subscribe.")
    email = (u.get("email") or "").strip().lower()
    if not email:
        raise errors.validation_error("Email required.")
    if not _stripe_configured():
        return {"url": None, "message": "Payment not configured. Use Dev unlock when DILLY_DEV=1."}
    base = str(request.base_url).rstrip("/")
    success_url = os.environ.get("STRIPE_SUCCESS_URL", f"{base.replace('/api', '')}/?subscription=success")
    cancel_url = os.environ.get("STRIPE_CANCEL_URL", base.replace("/api", "") or "/")
    try:
        import stripe
        stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=email,
            line_items=[{"price": os.environ.get("STRIPE_PRICE_ID"), "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"meridian_email": email},
        )
        return {"url": session.url}
    except Exception:
        raise errors.internal("Could not create checkout session.")


@router.post("/create-gift-checkout-session")
async def create_gift_checkout_session(request: Request, body: GiftCheckoutRequest):
    """Create Stripe Checkout for Gift Meridian. Body: { recipient_email (.edu), months: 6|12 }. No auth."""
    recipient_email = (body.recipient_email or "").strip().lower()
    months = body.months if body.months in (6, 12) else 6
    if not recipient_email or ".edu" not in recipient_email:
        raise errors.validation_error("recipient_email must be a .edu address.")
    if not _stripe_gift_configured():
        return {"url": None, "message": "Gift checkout not configured. Set STRIPE_GIFT_6M_PRICE_ID and STRIPE_GIFT_12M_PRICE_ID."}
    price_id = os.environ.get("STRIPE_GIFT_12M_PRICE_ID") if months == 12 else os.environ.get("STRIPE_GIFT_6M_PRICE_ID")
    base = str(request.base_url).rstrip("/")
    app_base = base.replace("/api", "").rstrip("/") or base
    success_url = os.environ.get("STRIPE_GIFT_SUCCESS_URL", f"{app_base}/?gift=success")
    cancel_url = os.environ.get("STRIPE_CANCEL_URL", app_base or "/")
    try:
        import stripe
        stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"type": "gift", "recipient_email": recipient_email, "months": str(months)},
        )
        return {"url": session.url}
    except Exception:
        raise errors.internal("Could not create gift checkout session.")


@router.post("/create-family-checkout-session")
async def create_family_checkout_session(request: Request, body: dict = Body(...)):
    """Create Stripe Checkout for Family plan. Body: { parent_email? }. No auth."""
    parent_email = (body.get("parent_email") or "").strip().lower()
    if not _stripe_family_configured():
        return {"url": None, "message": "Family plan not configured. Set STRIPE_FAMILY_PRICE_ID."}
    price_id = os.environ.get("STRIPE_FAMILY_PRICE_ID")
    base = str(request.base_url).rstrip("/")
    app_base = base.replace("/api", "").rstrip("/") or base
    success_url = os.environ.get("STRIPE_FAMILY_SUCCESS_URL", f"{app_base}/?family=success")
    cancel_url = os.environ.get("STRIPE_CANCEL_URL", app_base or "/")
    try:
        import stripe
        stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
        session = stripe.checkout.Session.create(
            mode="payment",
            customer_email=parent_email or None,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"type": "family", "parent_email": parent_email or ""},
        )
        return {"url": session.url}
    except Exception:
        raise errors.internal("Could not create family checkout session.")


@router.post("/redeem-gift")
async def redeem_gift(request: Request, body: RedeemGiftRequest):
    """Redeem a gift code. Body: { code }. Requires sign-in. Recipient must match session email."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    code = (body.code or "").strip()
    try:
        from projects.dilly.api.gift_store import redeem_gift as do_redeem
        from projects.dilly.api.auth_store import set_subscribed
        from projects.dilly.api.profile_store import ensure_profile_exists, save_profile
        if not do_redeem(code, email):
            raise errors.bad_request("Invalid or already redeemed code, or code is for a different email.")
        set_subscribed(email, True)
        ensure_profile_exists(email)
        save_profile(email, {"profileStatus": "active"})
        return {"ok": True, "message": "Gift redeemed. You have full access."}
    except HTTPException:
        raise
    except ValueError as e:
        raise errors.validation_error(str(e))
    except Exception:
        raise errors.internal("Could not redeem gift.")


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Stripe webhook: on checkout.session.completed, set user as subscribed or create gift/family. Requires STRIPE_WEBHOOK_SECRET."""
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise errors.service_unavailable("Webhook not configured.")
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        import stripe
        stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
        event = stripe.Webhook.construct_event(body, sig, secret)
    except Exception:
        raise errors.bad_request("Invalid signature.")
    if event.type == "checkout.session.completed":
        session = event.data.object
        meta = session.get("metadata") or {}
        pay_type = (meta.get("type") or "").strip().lower()
        if pay_type == "gift":
            recipient_email = (meta.get("recipient_email") or "").strip().lower()
            months = int(meta.get("months") or "6")
            if recipient_email and months in (6, 12):
                try:
                    from projects.dilly.api.gift_store import create_gift
                    create_gift(recipient_email, months)
                except Exception:
                    pass
        elif pay_type == "family":
            parent_email = (meta.get("parent_email") or "").strip().lower()
            if parent_email:
                try:
                    from projects.dilly.api.family_store import create_family
                    create_family(parent_email, 3)
                except Exception:
                    pass
        else:
            email = (
                (session.get("customer_email") or session.get("customer_details", {}).get("email") or meta.get("meridian_email") or "")
                .strip()
                .lower()
            )
            if email:
                from projects.dilly.api.auth_store import set_subscribed
                from projects.dilly.api.profile_store import save_profile, ensure_profile_exists
                set_subscribed(email, True)
                ensure_profile_exists(email)
                save_profile(email, {"profileStatus": "active"})
    return {"received": True}
