# Payment (B.4) — Stripe subscription

Subscription is gated: `/audit/v2`, report PDF, and explain-delta require a signed-in user with `subscribed: true`. Without Stripe configured, use **Dev unlock** (MERIDIAN_DEV=1 or localhost).

---

## Env vars (API)

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | For live payment | Stripe secret key (sk_live_… or sk_test_…) |
| `STRIPE_PRICE_ID` | For live payment | Stripe Price ID for $9.99/month (e.g. price_…) |
| `STRIPE_WEBHOOK_SECRET` | For webhook | Stripe webhook signing secret (whsec_…) |
| `STRIPE_SUCCESS_URL` | Optional | Where to redirect after payment (default: dashboard `/?subscription=success`) |
| `STRIPE_CANCEL_URL` | Optional | Where to redirect if user cancels (default: dashboard root) |

When all of `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are set, **Unlock full access** in the dashboard creates a Checkout Session and redirects to Stripe. When the user pays, Stripe calls the webhook and we set `subscribed: true` for their email.

---

## API endpoints

- **POST /auth/create-checkout-session**  
  Requires `Authorization: Bearer <token>`. Creates a Stripe Checkout Session (subscription, one line item = `STRIPE_PRICE_ID`). Returns `{ "url": "https://checkout.stripe.com/..." }`. If Stripe is not configured, returns `{ "url": null, "message": "..." }`.

- **POST /auth/webhook/stripe**  
  Stripe calls this with `checkout.session.completed`. We set `subscribed: true` and `profileStatus: "active"` for the customer email (profile becomes permanent). Requires `STRIPE_WEBHOOK_SECRET` to verify the signature.

- **POST /auth/dev-unlock**  
  Dev only (MERIDIAN_DEV=1 or localhost). Sets current user to subscribed. No Stripe needed.

- **GET /cron/cleanup-draft-profiles?token=CRON_SECRET**  
  Deletes draft profiles older than 3 days (no payment = profile removed). Set `CRON_SECRET` in env and call daily from a cron job.

---

## Stripe setup

1. Create a Product and a recurring Price ($9.99/month) in Stripe Dashboard; copy the **Price ID**.
2. In Developers → Webhooks, add endpoint: `https://your-api.com/auth/webhook/stripe`, event `checkout.session.completed`; copy the **Signing secret**.
3. Set env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`. Optionally `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` (e.g. your dashboard origin).
4. Dashboard: user clicks **Unlock full access** → redirect to Stripe → pays → redirect to success URL → we refetch `/auth/me` so `subscribed` is true.

---

## Protected routes

These require a valid session and `subscribed: true` (enforced by `_require_subscribed`):

- `POST /audit/v2`
- `POST /audit/explain-delta`
- `POST /report/pdf` (and any report generation)

Profile (GET/PATCH) and auth endpoints only require sign-in.

---

## Gift Meridian & Family plan

### Env vars (optional)

| Variable | Description |
|----------|-------------|
| `STRIPE_GIFT_6M_PRICE_ID` | One-time Price ID for 6-month gift |
| `STRIPE_GIFT_12M_PRICE_ID` | One-time Price ID for 12-month gift |
| `STRIPE_FAMILY_PRICE_ID` | One-time Price ID for family plan (e.g. 3 students) |
| `STRIPE_GIFT_SUCCESS_URL` | Redirect after gift payment (default: app `/?gift=success`) |
| `STRIPE_FAMILY_SUCCESS_URL` | Redirect after family payment (default: app `/?family=success`) |

### API endpoints

- **POST /auth/create-gift-checkout-session**  
  Body: `{ "recipient_email": "student@edu", "months": 6|12 }`. No auth. Creates Stripe Checkout (payment mode). Metadata: `type=gift`, `recipient_email`, `months`. On success, webhook creates gift redemption; student redeems with **POST /auth/redeem-gift**.

- **POST /auth/redeem-gift**  
  Body: `{ "code": "..." }`. Requires sign-in. Redeems gift for current user's email; sets subscribed and profileStatus active.

- **POST /auth/create-family-checkout-session**  
  Body: `{ "parent_email": "optional" }`. No auth. Creates Stripe Checkout for family plan. Webhook creates family record; parent adds students via **POST /family/add-student** with `family_add_token` (from success page or email).

- **GET /family/add?token=**  
  Returns `{ family_id, slots_used, slots_total, student_emails }` for add-student page. Token = `family_add_token` from family record.

- **POST /family/add-student**  
  Body: `{ "family_add_token": "...", "student_email": "student@edu" }`. No auth. Adds student to family and sets them subscribed.

Family-plan students are treated as subscribed (see `_bearer_user` and `family_store.is_student_in_any_family`).
