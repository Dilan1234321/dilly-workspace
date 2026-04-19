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
    """Send magic link to email. In dev, returns magic_link URL."""
    email = (body.email or "").strip().lower()
    user_type = (body.user_type or "student").strip().lower()
    if user_type != "general":
        # Student path: require .edu
        if not re.search(r"\.edu\s*$", email):
            raise errors.validation_error("Use your .edu email to sign up as a student.")
    else:
        # General path: any valid email
        if not email or "@" not in email or "." not in email:
            raise errors.validation_error("Enter a valid email address.")
    try:
        from projects.dilly.api.auth_store import create_magic_token
        token = create_magic_token(email)
    except ValueError as e:
        raise errors.validation_error(str(e))
    base = str(request.base_url).rstrip("/")
    api_magic_link = f"{base}/auth/verify?token={token}"
    return {"ok": True, "message": "Magic link sent to your email"}


@router.post("/send-verification-code", responses=ERROR_RESPONSES)
async def send_verification_code(request: Request, body: AuthSendCodeRequest):
    """Send a 6-digit verification code. Students need .edu, general users can use any email."""
    deps.rate_limit(request, "send-code", max_requests=5, window_sec=300)
    email = (body.email or "").strip().lower()
    user_type = (body.user_type or "student").strip().lower()
    is_general = user_type == "general"

    if not is_general:
        # Student path: require .edu (any .edu domain, no school whitelist)
        if not re.search(r"\.edu\s*$", email):
            raise errors.validation_error("Use your .edu email to sign up as a student.")
    else:
        # General path: basic email validation only
        if not email or "@" not in email or "." not in email:
            raise errors.validation_error("Enter a valid email address.")
    try:
        from projects.dilly.api.auth_store import create_verification_code
        from projects.dilly.api.email_sender import send_verification_email
        from projects.dilly.api.schools import get_school_from_email
        code = create_verification_code(email)
        school = get_school_from_email(email)  # None for non-.edu; used for theming only
        sent, code_for_dev = send_verification_email(email, code, school)
    except ValueError as e:
        raise errors.validation_error(str(e))
    out = {"ok": True, "message": "Verification code sent"}
    if deps.is_dev_allowed():
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
    if not deps.is_dev_allowed():
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
    return {"ok": True, "message": "Welcome to the Dilly beta. You're in."}


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
            metadata={"dilly_email": email},
        )
        return {"url": session.url}
    except Exception:
        raise errors.internal("Could not create checkout session.")


@router.post("/create-gift-checkout-session")
async def create_gift_checkout_session(request: Request, body: GiftCheckoutRequest):
    """Create Stripe Checkout for Gift Dilly. Body: { recipient_email (.edu), months: 6|12 }. No auth."""
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


# ---------------------------------------------------------------------------
# Promo codes. Hardcoded allowlist — only the codes in _PROMO_CODES grant
# access. Anything else returns 400. This isn't a "generate infinitely many
# codes" system; it's a "Dilan wanted two specific free-comp codes for
# Tampa students" feature. Rename the codes here if we roll more.
#
# Each code maps to (plan, message). Setting plan also flips `subscribed`
# on so all the downstream gating already works.
# ---------------------------------------------------------------------------

_PROMO_CODES = {
    "DILANTAMPAPRO": ("pro", "Dilly Pro unlocked. Welcome."),
    "DILANTAMPAPLUS": ("dilly", "Dilly unlocked. Welcome."),
}


@router.post("/redeem-promo-code")
async def redeem_promo_code(request: Request, body: dict = Body(...)):
    """Redeem a promo code. Body: { code }. Requires sign-in.

    Valid codes (hardcoded):
      DILANTAMPAPRO  -> grants Dilly Pro
      DILANTAMPAPLUS -> grants Dilly

    Codes are case-insensitive. No Stripe involved — this just flips
    the profile flags locally, same way gift redemption does. These
    are intended as comp codes, not a distribution mechanism.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized("Sign in to redeem.")
    raw = (body.get("code") or "").strip().upper()
    if not raw:
        raise errors.validation_error("Enter a code.")
    mapping = _PROMO_CODES.get(raw)
    if not mapping:
        # Generic message on purpose — don't confirm or deny which codes
        # exist. Discourages fishing.
        raise errors.bad_request("That code isn't valid.")
    plan, message = mapping
    try:
        from projects.dilly.api.auth_store import set_subscribed
        from projects.dilly.api.profile_store import ensure_profile_exists, save_profile
        ensure_profile_exists(email)
        set_subscribed(email, True)
        save_profile(email, {"plan": plan, "profileStatus": "active"})
        return {"ok": True, "plan": plan, "message": message}
    except Exception:
        raise errors.internal("Could not redeem code.")


# ---------------------------------------------------------------------------
# Stripe event idempotency. Stripe retries webhook deliveries until we return
# 2xx, so the same event.id can arrive multiple times. We keep a tiny table
# keyed by event.id and bail early on duplicates. Lazy-create the table on
# first use to avoid a separate migration step.
# ---------------------------------------------------------------------------

def _ensure_stripe_events_table() -> None:
    from projects.dilly.api.database import get_db
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS processed_stripe_events (
                event_id    TEXT PRIMARY KEY,
                event_type  TEXT,
                received_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )


def _stripe_event_already_processed(event_id: str) -> bool:
    """Return True if we've already handled this event and it should be skipped.
    Also records the event so subsequent retries are no-ops. Returns False on
    the first call for a given event_id."""
    if not event_id:
        return False
    from projects.dilly.api.database import get_db
    try:
        _ensure_stripe_events_table()
        with get_db() as conn:
            cur = conn.cursor()
            # ON CONFLICT ... RETURNING tells us whether we actually inserted
            cur.execute(
                "INSERT INTO processed_stripe_events (event_id) VALUES (%s) ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
                (event_id,),
            )
            return cur.fetchone() is None
    except Exception as e:
        # Fail-open: if the idempotency table is unreachable we'd rather
        # double-process than drop a paid subscription event. Log and move on.
        print(f"[STRIPE] idempotency check failed: {e}", flush=True)
        return False


def _plan_from_subscription(sub: dict) -> tuple[str, bool]:
    """Map a Stripe subscription status to (plan, subscribed).
    `active` and `trialing` count as paid; `past_due` keeps access during
    grace; anything else downgrades to Starter."""
    status = (sub.get("status") or "").lower()
    if status in ("active", "trialing", "past_due"):
        return ("dilly", True)
    return ("starter", False)


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Stripe webhook. Handles the full subscription lifecycle:

    - checkout.session.completed  → mark subscribed, save customer_id + subscription_id
    - customer.subscription.updated  → sync plan from latest status/price
    - customer.subscription.deleted  → downgrade to Starter
    - invoice.payment_failed  → flag past_due + start grace window
    - invoice.payment_succeeded  → clear grace

    Events are idempotent via processed_stripe_events so Stripe's retry policy
    doesn't double-apply. Requires STRIPE_WEBHOOK_SECRET.
    """
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

    event_id = getattr(event, "id", None) or event.get("id") if hasattr(event, "get") else None
    event_type = getattr(event, "type", None) or event.get("type") if hasattr(event, "get") else None

    # Idempotency guard — short-circuit duplicate deliveries.
    if _stripe_event_already_processed(event_id):
        return {"received": True, "duplicate": True}

    from projects.dilly.api.auth_store import set_subscribed
    from projects.dilly.api.profile_store import (
        save_profile,
        ensure_profile_exists,
        get_profile_by_stripe_customer_id,
    )

    def _email_for_customer(customer_id: str) -> str | None:
        p = get_profile_by_stripe_customer_id(customer_id)
        if p and p.get("email"):
            return p["email"]
        return None

    if event_type == "checkout.session.completed":
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
                (session.get("customer_email") or session.get("customer_details", {}).get("email") or meta.get("dilly_email") or "")
                .strip()
                .lower()
            )
            if email:
                set_subscribed(email, True)
                ensure_profile_exists(email)
                # Capture both IDs so later subscription.* / invoice.* events
                # can be mapped back to this user. Without these, Stripe tells
                # us "customer X cancelled" and we have no way to know who X is.
                patch: dict = {"profileStatus": "active", "plan": "dilly"}
                customer_id = session.get("customer")
                subscription_id = session.get("subscription")
                if customer_id:
                    patch["stripe_customer_id"] = customer_id
                if subscription_id:
                    patch["stripe_subscription_id"] = subscription_id
                save_profile(email, patch)

    elif event_type == "customer.subscription.updated":
        # Tier change or status transition. Re-sync plan from the subscription.
        sub = event.data.object
        customer_id = sub.get("customer")
        email = _email_for_customer(customer_id) if customer_id else None
        if email:
            plan, subscribed = _plan_from_subscription(sub)
            set_subscribed(email, subscribed)
            save_profile(email, {
                "plan": plan,
                "stripe_subscription_id": sub.get("id"),
            })

    elif event_type == "customer.subscription.deleted":
        # Stripe has finalized the cancellation. Downgrade to Starter.
        sub = event.data.object
        customer_id = sub.get("customer")
        email = _email_for_customer(customer_id) if customer_id else None
        if email:
            set_subscribed(email, False)
            save_profile(email, {
                "plan": "starter",
                "profileStatus": "cancelled",
                "stripe_subscription_id": None,
                "payment_state": None,
                "grace_ends_at": None,
            })

    elif event_type == "invoice.payment_failed":
        # Card declined or payment failed. Start 7-day grace. User keeps
        # access during grace; downgrade happens either via a follow-up
        # subscription.deleted (Stripe auto-cancels after retries) or via
        # our nightly reconciliation sweep.
        invoice = event.data.object
        customer_id = invoice.get("customer")
        email = _email_for_customer(customer_id) if customer_id else None
        if email:
            import time as _time
            grace_end = _time.time() + 7 * 24 * 3600
            save_profile(email, {
                "payment_state": "past_due",
                "grace_ends_at": grace_end,
            })

    elif event_type == "invoice.payment_succeeded":
        # Card recovered (or renewal succeeded). Clear grace.
        invoice = event.data.object
        customer_id = invoice.get("customer")
        email = _email_for_customer(customer_id) if customer_id else None
        if email:
            save_profile(email, {
                "payment_state": None,
                "grace_ends_at": None,
            })

    return {"received": True}


# Note: user-facing account deletion lives at POST /account/delete in
# profile.py (router prefix-free). That endpoint already does a thorough
# wipe across all tables, and now cancels Stripe first before deletion.
