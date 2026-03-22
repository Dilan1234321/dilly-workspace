# Parent Features — Implementation Plan

**Status: Implemented but paused.** All parent features (trust copy, parent dashboard, share report, milestones, Gift Meridian, Family plan) are built and documented here. We’re putting them to the side for now and will revisit later.

Parent-focused monetization and trust: Gift Meridian, Family plan, trust copy, parent dashboard, share report to parent, milestone notifications.

---

## 1. Trust copy for parents

**Deliverable:** Marketing page and copy so parents see .edu-only, no data selling, resume stays private.

- **Website:** New page `for-parents.html` (and `public/for-parents.html`).
  - Hero: "Give your student a career edge."
  - Sections: Why parents choose Meridian, .edu only, we don't sell data, resume stays private, Gift Meridian & Family plan CTAs.
  - FAQ: Is it safe? Who sees the resume? Can I see their progress?
- **Nav/footer:** Add "For parents" link sitewide (index, features, pricing, about, etc.).

---

## 2. Profile fields (parent)

**Schema (PATCH /profile):**

| Field | Type | Description |
|-------|------|-------------|
| `parent_email` | string \| null | Parent's email (for share report + milestone emails). Optional. |
| `parent_milestone_opt_in` | boolean | If true and parent_email set, send milestone emails to parent. Default false. |

**Parent invite (view-only dashboard):**

- Student generates a **parent invite token** (long-lived, one per student). Stored in profile as `parent_invite_token` (or in a small parent_invites store keyed by token → student email).
- Parent visits `https://meridian-careers.com/parent?token=...` or `https://app.meridian-careers.com/parent?token=...` and sees read-only summary (no resume).

---

## 3. Parent dashboard ("Is my student on track?")

**API: GET /parent/summary?token={parent_invite_token}**

- No auth. Token is the only auth.
- Returns:
  - `student_name`, `track`, `school_id`
  - `last_audit_at` (ISO or null), `last_scores` (smart, grit, build), `on_track` (derived: e.g. all dimensions ≥ 50 or tier-1 bar)
  - Optional: `peer_percentiles` if we have them
- If token invalid/expired → 404.

**Data:** Token → student_email mapping. We store in profile: `parent_invite_token` (created when student clicks "Generate link for parent"). Lookup: find profile where parent_invite_token == token.

**UI:** Public page (website or app) at `/parent` with query `?token=...`. Renders summary cards; no login.

---

## 4. Share report to parent

**API: POST /report/email-to-parent**

- Body: optional `{ "parent_email": "..." }`. If omitted, use profile.parent_email.
- Requires: signed-in, subscribed user; profile has parent_email or body has parent_email.
- Flow: Generate report PDF (same as POST /report/pdf with latest audit), get signed URL, send email to parent with link and short message ("[Student name] shared their Meridian report with you.").
- Uses existing `email_sender` + new template (or Resend template).

**Dashboard:** Button "Email report to parent" in report/share section. If parent_email not set, prompt once and save to profile.

---

## 5. Milestone notifications

**Trigger:** After a successful audit (e.g. in `/audit/v2` response path or in a post-audit hook).

- If profile has `parent_email` and `parent_milestone_opt_in`:
  - First audit ever → email parent: "Your student completed their first Meridian audit."
  - Later audits → optional: "Your student ran a new audit. Scores: Smart X, Grit Y, Build Z." (or only on "Strong" in any dimension to avoid spam.)
- Use `email_sender`; new helper e.g. `send_parent_milestone_email(parent_email, student_name, milestone_type, payload)`.

---

## 6. Gift Meridian

**Flow:**

1. **Purchase:** Parent goes to website (e.g. "Gift Meridian" CTA) → lands on checkout (Stripe) or gift form. Parent enters **recipient .edu email** and selects 6 or 12 months. Payment via Stripe.
2. **Stripe:** New Price IDs: e.g. `STRIPE_GIFT_6M_PRICE_ID`, `STRIPE_GIFT_12M_PRICE_ID`. Checkout Session with `metadata: { type: "gift", recipient_email: "student@edu" }`. Customer email = parent (or leave blank for guest checkout).
3. **Webhook:** On `checkout.session.completed`, if metadata.type == "gift", create **gift redemption** record: recipient_email, months (6 or 12), expires_at (now + months), optional redemption_code (for "Redeem at app" link).
4. **Redemption:** Student visits app, clicks "Redeem a gift" (or follows email link). Enters code or uses one-time link. Backend: POST /auth/redeem-gift with body `{ "code": "..." }` or GET /redeem?code=... that sets user subscribed and (if we support expiry) subscription_expires_at. For simplicity, first version: gift = N months of subscription; we set subscribed=true and store subscription_expires_at in auth store or profile; cron or middleware can enforce expiry later.

**Data:** Gift redemptions store: `memory/meridian_gift_redemptions.json` or new file. Schema: `{ "redemptions": [ { "recipient_email", "months", "expires_at", "code", "redeemed_at": null } ] }`. When redeemed, set redeemed_at and call set_subscribed(recipient_email, True).

**Email:** After payment, send email to recipient (student) with redemption link/code so they can activate.

---

## 7. Family plan

**Flow:**

1. **Purchase:** Parent buys "Family plan" (e.g. 3 students). Stripe Price: `STRIPE_FAMILY_PRICE_ID`. Checkout metadata: `{ type: "family", parent_email: "..." }`.
2. **Webhook:** On completion, create **family account**: parent_email, slots = 3, student_emails = [].
3. **Adding students:** Parent (or student) goes to "Family" in app. Parent logs in with their email? Or we send parent a magic link to add students. Simpler: parent pays → we email parent a link "Add your students" → parent enters up to 3 .edu emails → we set each as subscribed and link to family_id. Alternatively: students "join" with a family code. For v1: parent gets a dashboard link; adds student emails; we set those users subscribed and store family_id in profile.
4. **Data:** Family store: `memory/meridian_families.json`. Schema: `{ "families": [ { "id", "parent_email", "slots", "student_emails": [], "stripe_subscription_id" } ] }`. Profile: `family_id` (optional). Auth: user is subscribed if either user.subscribed or profile.family_id is set.

**API:**

- POST /family/add-student (parent auth or family token): body `{ "student_email": "..." }`. Consumes one slot.
- GET /family (for parent): list my students and slots.

---

## Implementation order

| Phase | What | Dependencies |
|-------|------|--------------|
| 1 | Trust copy (for-parents page + nav) | None |
| 2 | Profile fields (parent_email, parent_milestone_opt_in), parent_invite_token, GET /parent/summary | None |
| 3 | POST /report/email-to-parent, milestone email on audit | Profile, email_sender |
| 4 | Gift: store, checkout session (gift), webhook, redeem endpoint, email to recipient | Stripe |
| 5 | Family: store, checkout (family), webhook, add-student, GET /family | Stripe |
| 6 | Dashboard: Settings parent section, "Email report to parent", "Invite parent" link, Redeem gift | All above |

---

## Env vars (add)

- `STRIPE_GIFT_6M_PRICE_ID` (optional)
- `STRIPE_GIFT_12M_PRICE_ID` (optional)
- `STRIPE_FAMILY_PRICE_ID` (optional)
- Existing: RESEND_API_KEY, MERIDIAN_EMAIL_FROM for parent emails.

---

## File changes summary

- **Website:** for-parents.html, public/for-parents.html; nav/footer links in index, features, pricing, about.
- **API:** main.py (parent summary, report email, gift redeem, family endpoints, webhook extension); optional parent_store.py or gift_store.py, family_store.py; email_sender.py (parent email templates).
- **Profile:** profile_store.py (no schema change needed; profile is JSON, add parent_* fields via PATCH).
- **Dashboard:** settings page (parent section), redeem gift flow, optional /parent route for invite link destination.
