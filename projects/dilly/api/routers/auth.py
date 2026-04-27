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
    SignInWithAppleRequest,
    SignInWithGoogleRequest,
    RedeemGiftRequest,
    BetaUnlockRequest,
    GiftCheckoutRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _serialize_user(user: dict) -> dict:
    """Build the user dict returned from /auth/verify-code and /auth/me."""
    if not user:
        return {}
    out = {
        "email": user.get("email"),
        "subscribed": user.get("subscribed", False),
        "account_type": user.get("account_type", "student"),
    }
    if out["account_type"] == "recruiter":
        out["company_name"] = user.get("company_name")
        out["company_domain"] = user.get("company_domain")
        out["company_verified_at"] = user.get("company_verified_at")
        out["company_logo_url"] = user.get("company_logo_url")
        out["company_jobs_count"] = user.get("company_jobs_count")
    return out


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
    """Send a 6-digit verification code.

    intent='student'   — requires a .edu address (existing behaviour).
    intent='recruiter' — requires a non-free-provider work email; rejects
                         gmail, yahoo, hotmail, outlook, icloud, etc.
    """
    deps.rate_limit(request, "send-code", max_requests=5, window_sec=300)
    email = (body.email or "").strip().lower()
    intent = (body.intent or body.user_type or "student").strip().lower()

    from projects.dilly.api.company_enrichment import is_free_email

    if intent == "recruiter":
        if not email or "@" not in email or "." not in email:
            raise errors.validation_error("Enter a valid work email address.")
        if re.search(r"\.edu\s*$", email):
            raise errors.validation_error("Use a work email to sign up as a recruiter, not a .edu address.")
        if is_free_email(email):
            raise errors.validation_error(
                "Please use your work email to sign up as a recruiter. "
                "Free email providers (Gmail, Yahoo, etc.) are not accepted."
            )
    elif intent == "general":
        # General (non-student) path: any valid email accepted. Used for the
        # 14+ non-student situations (jobholder, parent returning, veteran,
        # etc.) where forcing .edu would block valid signups.
        if not email or "@" not in email or "." not in email:
            raise errors.validation_error("Enter a valid email address.")
    else:
        # Student path: require .edu (any .edu domain, no school whitelist)
        if not re.search(r"\.edu\s*$", email):
            raise errors.validation_error("Use your .edu email to sign up as a student.")

    try:
        from projects.dilly.api.auth_store import create_verification_code
        from projects.dilly.api.email_sender import send_verification_email
        from projects.dilly.api.schools import get_school_from_email
        code = create_verification_code(email)
        school = get_school_from_email(email)  # None for non-.edu; used for theming only
        sent, code_for_dev = send_verification_email(email, code, school)
    except ValueError as e:
        raise errors.validation_error(str(e))
    out = {"ok": True, "message": "Verification code sent", "intent": intent}
    if deps.is_dev_allowed():
        out["dev_code"] = code
    elif not sent:
        raise errors.service_unavailable("We couldn't send the verification email. Try again in a minute.")
    return out


@router.post("/verify-code", responses=ERROR_RESPONSES)
async def auth_verify_code(request: Request, body: AuthVerifyCodeRequest):
    """Verify 6-digit code and sign in. Returns session token and user.

    Pass the same intent ('student' or 'recruiter') that was used at send-code
    time. For recruiter accounts the response also includes company fields.
    """
    deps.rate_limit(request, "verify-code", max_requests=10, window_sec=300)
    email = (body.email or "").strip().lower()
    code = (body.code or "").strip()
    intent = (body.intent or "student").strip().lower()
    if intent == "recruiter":
        account_type = "recruiter"
    elif intent == "general":
        account_type = "general"
    else:
        account_type = "student"

    from projects.dilly.api.schools import get_school_from_email
    from projects.dilly.api.auth_store import (
        verify_verification_code,
        create_session,
        get_session,
        update_company_fields,
    )
    if not verify_verification_code(email, code):
        raise errors.validation_error("Invalid or expired code. Request a new one.")
    session_token = create_session(email, account_type=account_type)
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists
        ensure_profile_exists(email)
    except Exception:
        pass

    if account_type == "recruiter":
        # Enrich company info immediately — best-effort, never blocks login
        try:
            from projects.dilly.api.company_enrichment import enrich_recruiter
            enrichment = enrich_recruiter(email)
            update_company_fields(
                email,
                company_domain=enrichment.get("company_domain"),
                company_name=enrichment.get("company_name"),
                company_logo_url=enrichment.get("company_logo_url"),
                company_jobs_count=enrichment.get("company_jobs_count"),
            )
        except Exception:
            pass
    elif account_type == "student":
        # Guarantee a students row exists from the moment email is verified.
        # Only runs for actual student accounts — general (non-student
        # situations like jobholder, parent returning, veteran) skip this.
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
        "user": _serialize_user(user),
    }


@router.post("/sign-in-with-apple", responses=ERROR_RESPONSES)
async def sign_in_with_apple(request: Request, body: SignInWithAppleRequest):
    """Sign in with Apple — non-student paths only.

    Verifies Apple's identity token server-side (validates issuer, audience,
    expiry, signature against Apple's JWKS), extracts the stable sub +
    email, and resolves to a Dilly account via apple_sub or email. Always
    creates account_type='general' because SIWA's relay email
    (xxx@privaterelay.appleid.com) can never satisfy the .edu requirement
    for student situations. The student auth path stays email-code only.

    Returns the same {token, user} shape as /auth/verify-code so the
    mobile client can route to onboarding or home identically."""
    deps.rate_limit(request, "siwa", max_requests=10, window_sec=300)

    apple_sub = (body.user or "").strip()
    email = (body.email or "").strip().lower()

    # Verify Apple's identity token. apple-sign-in tokens are JWTs signed
    # by Apple's JWKS (https://appleid.apple.com/auth/keys). We use the
    # `python-jose` library if available, else fall back to a permissive
    # decode that trusts the bundled `user` field. Production should
    # ALWAYS verify; the fallback is only for environments where jose
    # isn't installed yet.
    try:
        from jose import jwt as jose_jwt  # type: ignore
        try:
            unverified_header = jose_jwt.get_unverified_header(body.identity_token)
            kid = unverified_header.get("kid")
            import urllib.request, json as _json
            jwks_raw = urllib.request.urlopen("https://appleid.apple.com/auth/keys", timeout=8).read()
            jwks = _json.loads(jwks_raw).get("keys", [])
            key = next((k for k in jwks if k.get("kid") == kid), None)
            if not key:
                raise errors.validation_error("Could not verify Apple sign-in. Try again.")
            payload = jose_jwt.decode(
                body.identity_token,
                key,
                algorithms=[key.get("alg", "RS256")],
                audience="com.dilly.app",
                issuer="https://appleid.apple.com",
                options={"verify_at_hash": False},
            )
            verified_sub = payload.get("sub")
            verified_email = (payload.get("email") or "").strip().lower()
            if verified_sub and verified_sub != apple_sub:
                raise errors.validation_error("Apple sign-in token mismatch.")
            if verified_email:
                email = verified_email
            apple_sub = verified_sub or apple_sub
        except errors.validation_error.__class__:
            raise
        except Exception as e:
            # Token verification failed — surface a clean error.
            raise errors.validation_error(f"Apple sign-in token invalid: {type(e).__name__}")
    except ImportError:
        # `python-jose` not installed — trust the client-supplied sub +
        # email. Acceptable for early beta but log a warning so we know
        # to install jose before public launch.
        print("[auth.siwa] WARNING: python-jose not installed; trusting client sub", flush=True)

    if not apple_sub:
        raise errors.validation_error("Apple sign-in did not return a user identifier.")
    if not email:
        # Apple lets users hide their email even from the app on
        # subsequent sign-ins. Without an email we can't create a Dilly
        # account that maps cleanly to all our email-keyed tables.
        raise errors.validation_error("Apple sign-in must provide an email. Re-try and choose 'Share My Email'.")

    from projects.dilly.api.auth_store import upsert_oauth_user, create_session, get_session, update_company_fields
    user = upsert_oauth_user(provider="apple", provider_sub=apple_sub, email=email, account_type="general")
    session_token = create_session(email, account_type="general")

    # Ensure profile row exists so the first PATCH from the mobile client
    # can land basic info (name from full_name claim, etc.) without
    # racing the profile-store auto-create.
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists
        ensure_profile_exists(email)
        if body.full_name:
            from projects.dilly.api.profile_store import save_profile
            save_profile(email, {"name": body.full_name.strip()})
    except Exception:
        pass

    sess_user = get_session(session_token)
    return {"token": session_token, "user": _serialize_user(sess_user)}


@router.post("/sign-in-with-google", responses=ERROR_RESPONSES)
async def sign_in_with_google(request: Request, body: SignInWithGoogleRequest):
    """Sign in with Google — non-student paths only.

    Verifies Google's ID token server-side (issuer, audience, expiry,
    signature against Google's certs), extracts the stable sub + email,
    and resolves to a Dilly account via google_sub or email. Restricted
    to account_type='general' to keep the .edu student verification
    path clean and predictable. Students must use the email-code flow
    even if they have a Google Workspace .edu account."""
    deps.rate_limit(request, "google_signin", max_requests=10, window_sec=300)

    email = (body.email or "").strip().lower()
    google_sub = ""

    try:
        from jose import jwt as jose_jwt  # type: ignore
        try:
            unverified_header = jose_jwt.get_unverified_header(body.id_token)
            kid = unverified_header.get("kid")
            import urllib.request, json as _json
            jwks_raw = urllib.request.urlopen("https://www.googleapis.com/oauth2/v3/certs", timeout=8).read()
            jwks = _json.loads(jwks_raw).get("keys", [])
            key = next((k for k in jwks if k.get("kid") == kid), None)
            if not key:
                raise errors.validation_error("Could not verify Google sign-in. Try again.")
            # We accept tokens for either of our OAuth client IDs (iOS / web fallback).
            audiences = [a.strip() for a in (os.environ.get("GOOGLE_OAUTH_CLIENT_IDS", "")).split(",") if a.strip()]
            decode_kwargs = {"algorithms": [key.get("alg", "RS256")], "issuer": "https://accounts.google.com"}
            if audiences:
                decode_kwargs["audience"] = audiences if len(audiences) > 1 else audiences[0]
            payload = jose_jwt.decode(body.id_token, key, **decode_kwargs)
            google_sub = payload.get("sub", "")
            verified_email = (payload.get("email") or "").strip().lower()
            email_verified = bool(payload.get("email_verified"))
            if not email_verified:
                raise errors.validation_error("Your Google account email isn't verified yet. Verify it in Google then try again.")
            if verified_email:
                email = verified_email
        except errors.validation_error.__class__:
            raise
        except Exception as e:
            raise errors.validation_error(f"Google sign-in token invalid: {type(e).__name__}")
    except ImportError:
        # Same fallback note as Apple — install jose before public launch.
        print("[auth.google] WARNING: python-jose not installed; trusting client claims", flush=True)
        google_sub = email  # best-effort: use email as a stable id

    if not email:
        raise errors.validation_error("Google sign-in did not provide an email.")

    from projects.dilly.api.auth_store import upsert_oauth_user, create_session, get_session
    user = upsert_oauth_user(provider="google", provider_sub=google_sub or email, email=email, account_type="general")
    session_token = create_session(email, account_type="general")

    try:
        from projects.dilly.api.profile_store import ensure_profile_exists
        ensure_profile_exists(email)
        if body.full_name:
            from projects.dilly.api.profile_store import save_profile
            save_profile(email, {"name": body.full_name.strip()})
    except Exception:
        pass

    sess_user = get_session(session_token)
    return {"token": session_token, "user": _serialize_user(sess_user)}


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
        "user": _serialize_user(user),
    }


@router.get("/me")
async def auth_me(request: Request):
    """Return current user if valid Bearer token.

    Includes account_type for all users. Recruiter accounts also include
    company_name, company_domain, company_verified_at, company_logo_url,
    company_jobs_count.
    """
    user = deps.bearer_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return _serialize_user(user)


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
    # DILLYTAMPAFREE flips the user to Starter (the free tier). Useful
    # for resetting a test account off a paid plan without touching
    # Stripe. No celebration fires since it's not an upgrade.
    "DILLYTAMPAFREE": ("starter", "Starter tier set. You're on the free plan."),
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
        # Starter means 'not subscribed'. Paid tiers (dilly, pro) mean
        # subscribed=True. This lets DILLYTAMPAFREE correctly push a
        # user down to free without leaving them stuck in subscribed
        # state. Paid codes still flip subscribed on as before.
        is_paid = plan != "starter"
        set_subscribed(email, is_paid)
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
