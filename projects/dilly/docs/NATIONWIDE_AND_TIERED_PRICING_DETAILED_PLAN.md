# Nationwide Launch + Tiered Pricing — Detailed Implementation Plan

**Parent plan:** `.cursor/plans/nationwide_launch_+_tiered_pricing_1966a012.plan.md`  
**Monetization strategy:** `projects/dilly/docs/MONETIZATION_PLAN_AND_STRATEGY.md`

---

## Part 1: Nationwide .edu Access

### 1.1 Backend: schools.py

**File:** `projects/dilly/api/schools.py`

**Step 1:** Add default school config (after `SCHOOLS` dict, before `_domain_to_school`):

```python
# Default for any .edu not in SCHOOLS (nationwide)
DEFAULT_SCHOOL = {
    "id": "default",
    "name": "Dilly",
    "short_name": "Dilly",
    "primary": "#c9a882",
    "secondary": "#b3a79d",
    "tagline": "Your career center. Open 24/7.",
    "mascot_name": "you",
    "email_headline": "Your future starts with one step.",
    "email_subhead": "Welcome to Dilly",
}
```

**Step 2:** Update `get_school_from_email` (lines 34–39):

```python
def get_school_from_email(email: str) -> dict | None:
    if not email or "@" not in email:
        return None
    domain = email.strip().lower().split("@")[-1]
    return _DOMAIN_MAP.get(domain) or DEFAULT_SCHOOL
```

---

### 1.2 Backend: auth.py — Remove school allowlist

**File:** `projects/dilly/api/routers/auth.py`

**send_magic_link (lines 49–52):** Delete this block:
```python
    from projects.dilly.api.schools import get_school_from_email
    if not get_school_from_email(email):
        raise errors.validation_error(
            "Meridian isn't available at your school yet. We're starting with University of Tampa (spartans.ut.edu).",
        )
```
Keep the `.edu` regex check.

**send_verification_code (lines 76–79):** Delete the same block. Line 84 `school = get_school_from_email(email)` stays — it will return DEFAULT_SCHOOL for unknown domains.

**auth_verify_code (lines 103–105):** Delete:
```python
    from projects.dilly.api.schools import get_school_from_email
    if not get_school_from_email(email):
        raise errors.validation_error("Meridian isn't available at your school yet.")
```

---

### 1.3 Backend: profile_store.py — school_id for unknown domains

**File:** `projects/dilly/api/profile_store.py`

**Function:** `_school_id_from_email` (lines 41–48)

```python
def _school_id_from_email(email: str) -> str | None:
    try:
        from .schools import get_school_from_email
        s = get_school_from_email(email)
        if not s:
            return None
        if s.get("id") == "default":
            domain = (email or "").strip().lower().split("@")[-1]
            return domain.replace(".", "_") if domain else None
        return s["id"]
    except Exception:
        return None
```

---

### 1.4 Frontend: schools.ts

**File:** `projects/dilly/dashboard/src/lib/schools.ts`

Add `DEFAULT_SCHOOL` after SCHOOLS:
```typescript
export const DEFAULT_SCHOOL: SchoolConfig = {
  id: "default",
  name: "Dilly",
  shortName: "Dilly",
  domains: [],
  theme: MERIDIAN_BASE_THEME,
  tagline: "Your career center. Open 24/7.",
};
```

Update `getSchoolFromEmail`:
```typescript
export function getSchoolFromEmail(email: string): SchoolConfig | null {
  const trimmed = (email || "").trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  const domain = trimmed.split("@")[1]?.toLowerCase() || "";
  return DOMAIN_TO_SCHOOL.get(domain) ?? DEFAULT_SCHOOL;
}
```

---

### 1.5 Copy updates

- `projects/dilly/website/public/index.html` — hero, sign-up
- `projects/dilly/website/for-parents.html` — remove UTampa-only references
- Replace "University of Tampa" / "spartans.ut.edu" with "College students nationwide" or "Any .edu email"

---

## Part 2: Tiered Pricing — Backend

### 2.1 Auth store: tier schema

**File:** `projects/dilly/api/auth_store.py`

Add constants:
```python
TIER_FREE = "free"
TIER_STARTER = "starter"
TIER_PRO = "pro"
```

**create_session:** New users get `tier=TIER_STARTER` if first user, else `tier=TIER_FREE`. Set `subscribed = tier in (TIER_STARTER, TIER_PRO)`.

**get_session:** Return `{ email, subscribed, tier }`. Derive `tier` from user dict; if missing, infer from `subscribed`.

**set_tier(email, tier):** New function. Set `user["tier"]` and `user["subscribed"] = tier in (TIER_STARTER, TIER_PRO)`.

**set_subscribed:** Call `set_tier(email, TIER_STARTER if subscribed else TIER_FREE)`.

**Migration:** On load, if user has `subscribed` but no `tier`, set `tier = TIER_STARTER` if subscribed else `TIER_FREE`.

---

### 2.2 deps.py: require_tier

**File:** `projects/dilly/api/deps.py`

```python
def _tier_rank(tier: str) -> int:
    return ["free", "starter", "pro"].index((tier or "free").lower()) if (tier or "free").lower() in ["free", "starter", "pro"] else 0

def require_tier(request: Request, min_tier: str) -> dict:
    user = bearer_user(request)
    if not user:
        raise errors.unauthorized("Sign in to run audits.")
    tier = user.get("tier") or ("starter" if user.get("subscribed") else "free")
    if _tier_rank(tier) < _tier_rank(min_tier):
        raise errors.forbidden("Upgrade to Pro" if min_tier == "pro" else "Subscribe to run audits. $9.99/month.")
    return user

def require_subscribed(request: Request) -> dict:
    return require_tier(request, "starter")
```

---

### 2.3 First-audit-free in audit.py

**File:** `projects/dilly/api/routers/audit.py`

In `audit_resume_v2`:
1. Get user via `bearer_user`, not `require_subscribed`.
2. If `tier == "free"`: check `profile.first_audit_at`. If set → 403. If null → allow audit.
3. After successful audit, if tier was free: `save_profile(email, {"first_audit_at": time.time()})`.
4. If tier is starter or pro: use `require_tier(request, "starter")` as before.

---

### 2.4 API tier gating — Endpoint mapping

| Endpoint | Min tier |
|----------|----------|
| POST /audit/v2 | free (first) or starter |
| POST /audit | starter |
| POST /voice/* | starter |
| POST /report/pdf, /report/email-to-parent | starter |
| POST /apply-through-meridian | **pro** |
| GET /companies/{slug} (auth) | **pro** |
| GET /companies | starter |
| POST /ats-vendor-sim | **pro** |
| GET /ats-company-lookup | **pro** |
| All other ATS endpoints | starter |
| career_brain, templates | starter |

---

### 2.5 Stripe: tier checkout and webhook

**create-checkout-session:** Accept `body: { tier?: "starter" | "pro" }`. Use `STRIPE_PRO_PRICE_ID` if tier=pro, else `STRIPE_STARTER_PRICE_ID` or `STRIPE_PRICE_ID`. Add `metadata.tier` to session.

**Webhook:** On subscription checkout, read `metadata.tier` or infer from `price_id`. Call `set_tier(email, tier)`.

---

### 2.6 Auth responses: include tier

- `auth_verify_code`, `auth_verify`, `auth_me`: add `tier` to response.
- `dev-unlock`, `beta-unlock`, `redeem_gift`: use `set_tier` instead of `set_subscribed`.

---

## Part 3: Frontend

### 3.1 Types

**File:** `projects/dilly/dashboard/src/types/dilly.ts`

```typescript
export type User = { email: string; subscribed: boolean; tier?: string };
```

---

### 3.2 Paywall (page.tsx ~line 3163)

Replace single $9.99 card with:
- **Free:** First audit free — no CTA or "Start free" (runs first audit)
- **Starter $9.99:** Feature list, "Start now" → POST create-checkout-session `{ tier: "starter" }`
- **Pro $19.99:** Feature list, "Get Pro" → POST create-checkout-session `{ tier: "pro" }`

---

### 3.3 Settings

Add "Your plan" section: show `user.tier`. If Starter, "Upgrade to Pro" → checkout with tier=pro.

---

### 3.4 Pro feature gates

- **Jobs:** "Apply on Meridian" — if tier !== "pro", show upgrade prompt or disabled.
- **Companies:** Company detail page — if 403 from API, show "Upgrade to Pro".
- **ATS:** Vendor sim tab, company lookup — if tier !== "pro", show upgrade overlay.

---

### 3.5 Auth/me caching

Ensure `user` object includes `tier` when parsing `/auth/me` response.

---

## Part 4: Website

### pricing.html

Three-tier table: Free, Starter $9.99, Pro $19.99 with feature checkmarks. CTAs link to app.

---

## Part 5: Implementation Order

1. Nationwide: schools.py, schools.ts, auth.py, profile_store.py
2. Auth store: tier, set_tier, get_session, migration
3. deps.py: require_tier
4. First-audit-free: audit.py
5. API tier gating: all routers
6. Stripe: checkout body, webhook
7. Auth responses: tier
8. Frontend: types, paywall, settings, Pro gates
9. pricing.html, copy

---

## Part 6: Testing Checklist

- [ ] Sign up with `user@stanford.edu` — succeeds, default theme
- [ ] Sign up with `user@spartans.ut.edu` — succeeds, UTampa theme
- [ ] Free: first audit OK, second 403
- [ ] Starter: unlimited audits, Voice, PDF, basic ATS
- [ ] Pro: Apply through Meridian, companies, ATS vendor sim
- [ ] Starter: Apply through Meridian → 403
- [ ] Checkout tier=starter → Stripe Starter price
- [ ] Checkout tier=pro → Stripe Pro price
- [ ] Webhook → set_tier correct
- [ ] /auth/me returns tier
