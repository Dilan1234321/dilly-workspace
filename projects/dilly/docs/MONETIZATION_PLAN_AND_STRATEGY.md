# Dilly Monetization Plan and Strategy

**Purpose:** Single source of truth for pricing, tiers, revenue streams, and go-to-market monetization decisions.  
**Audience:** Founder, investors, product decisions.  
**Last updated:** 2026-03-19.

---

## 1. Executive Summary

Dilly monetizes college students (.edu) through **tiered subscriptions**: Free (first audit only), Starter ($9.99/mo), and Pro ($19.99/mo). Higher tiers unlock more features. Primary revenue is student subscriptions; secondary streams include Gift Meridian (parents), Family plan, and (post-traction) Recruiter API and campus partnerships.

**Launch strategy:** Nationwide .edu access, 3 tiers, first-audit-free to maximize conversion. Add premium tiers ($29.99+) only when we have features that justify them.

---

## 2. Tier Structure

### 2.1 Tiers at Launch

| Tier | Price | Target User |
|------|-------|-------------|
| **Free** | $0 | Try before you buy; one audit to experience value |
| **Starter** | $9.99/mo | Core user: unlimited audits, Voice, playbooks, PDF |
| **Pro** | $19.99/mo | Power user: Apply through Meridian, company pages, advanced ATS |

### 2.2 Feature Mapping

| Feature | Free | Starter | Pro |
|---------|------|---------|-----|
| First resume audit | ✅ (one only) | ✅ | ✅ |
| Unlimited audits | ❌ | ✅ | ✅ |
| Dilly (AI career coach) | ❌ | ✅ | ✅ |
| Track playbooks & recommendations | ❌ | ✅ | ✅ |
| Peer percentiles | ❌ | ✅ | ✅ |
| PDF report | ❌ | ✅ | ✅ |
| Basic ATS (parseability, checklist) | ❌ | ✅ | ✅ |
| ATS keyword density | ❌ | ✅ | ✅ |
| Apply through Meridian | ❌ | ❌ | ✅ |
| Company pages (target-firm breakdowns) | ❌ | ❌ | ✅ |
| ATS vendor sim (Workday, Greenhouse, etc.) | ❌ | ❌ | ✅ |
| ATS company lookup | ❌ | ❌ | ✅ |
| Recruiter profile enhancements | ❌ | ❌ | ✅ |

### 2.3 Pricing Rationale

- **$9.99 (Starter):** Anchored against Chegg ($16/mo), career coaching ($200+/hr). "Less than a coffee a month." Proven in VC pitch and cost breakdown (see `COST_BREAKDOWN_999.md`).
- **$19.99 (Pro):** 2× Starter for power features. Apply through Meridian and company-specific ATS are high-value differentiators; students targeting competitive roles will pay.
- **No $29.99/$34.99 at launch:** College students are price-sensitive. Add a premium tier later when we have 1:1 coaching, human review, or recruiter concierge features that justify the price.

---

## 3. Revenue Streams

### 3.1 Primary (Launch)

| Stream | Price | Status | Notes |
|--------|-------|--------|------|
| **Student subscription** | $9.99 or $19.99/mo | Stripe integrated; live pending | Primary revenue. Tier selection at checkout. |
| **First-audit-free** | $0 | Implemented | Conversion hook; Free tier gets one audit, then paywall. |

### 3.2 Secondary (Built, Paused)

| Stream | Price | Status | Notes |
|--------|-------|--------|------|
| **Gift Meridian** | 6 or 12 months prepaid | Built | Parents buy for students. Revisit when Stripe live. |
| **Family plan** | 2–3 students, one billing | Built | Same. |

### 3.3 Post-Traction

| Stream | Description | Timing |
|--------|-------------|--------|
| **Recruiter API** | Pay-per-search or subscription for verified candidate pool | 2K+ subscribers |
| **Campus partnerships** | Universities license Dilly for students | Per-school sales |
| **Premium tier** | $29.99–$34.99 for 1:1 coaching, human review, concierge | When features exist |
| **Affiliate referrals** | Test prep (MCAT, LSAT), certifications, internship platforms | Track-specific |

---

## 4. Unit Economics

### 4.1 Targets

| Metric | Target | Notes |
|--------|--------|------|
| **CAC** | <$15 | Organic: ambassadors, .edu viral loops, referrals |
| **LTV** | $120+ | 12+ month retention at $9.99; Pro users higher |
| **LTV:CAC** | 8:1+ | Healthy SaaS benchmark |
| **Gross margin** | 85%+ | LLM ~$0.02–0.05/audit; Stripe ~$0.59 on $9.99 |

### 4.2 Cost per Subscriber (Starter $9.99)

| Item | Amount |
|------|--------|
| Stripe (2.9% + $0.30) | ~$0.59 |
| LLM (5 audits/mo, gpt-4o) | ~$0.30–0.45 |
| **Net per sub** | **~$8.50–9.10** |

See `COST_BREAKDOWN_999.md` for full breakdown. Pro at $19.99 improves margin further.

### 4.3 Free Tier Economics

- One audit per Free user: ~$0.05–0.09 LLM cost.
- Acceptable as acquisition cost if conversion to paid is strong (target: 10–20% of Free → Starter/Pro).

---

## 5. Conversion Strategy

### 5.1 Funnel

```
Land on site → First audit (Free) → See scores + evidence + recommendations
     → Paywall: "Unlock unlimited audits, Dilly, and more"
     → Choose Starter or Pro → Checkout → Subscribed
```

### 5.2 Paywall Moment

- **When:** Immediately after first audit. User has seen value (scores, evidence, line edits).
- **Copy:** "What you get next" — re-audit to track progress, Am I Ready?, ATS by company, Dilly 24/7.
- **Proof:** "Students like you have landed PA interviews / tech internships…"
- **CTA:** "Subscribe — $9.99/mo" (Starter) and "Get Pro — $19.99/mo" (Pro).

### 5.3 Upgrade Path

- **Starter → Pro:** In-app prompts when user hits Pro-gated features (e.g. Apply through Meridian, company pages). "Upgrade to Pro to unlock."
- **Settings:** "Your plan" section with current tier and "Upgrade" CTA.

### 5.4 Referral Program

- **Reward:** Referrer and referred each get 1 free month when referred user subscribes.
- **Implementation:** See `REFERRAL_LOGIC.md`. Pending Stripe webhook integration.

---

## 6. Launch Pricing and Promotions

### 6.1 Launch Pricing (Through April 30)

- **Starter:** $9.99/mo (strikethrough $19.99 if desired for anchor).
- **Pro:** $19.99/mo.
- **Badge:** "Launch pricing — through April 30" on pricing page.

### 6.2 Risk Reversal

- "Cancel anytime · No questions asked"
- "7-day guarantee: not confident? Cancel and we'll refund."

### 6.3 Annual Plans (Future)

- Consider $99/yr Starter ($8.25/mo) and $199/yr Pro ($16.58/mo) for discount and retention.
- Implement after monthly conversion is proven.

---

## 7. Implementation Checklist

### 7.1 Nationwide + Tiers (from Plan)

- [ ] Auth: accept any .edu (remove school allowlist)
- [ ] School config: default fallback for unknown domains
- [ ] Auth store: add `tier` (free, starter, pro)
- [ ] Stripe: create Starter and Pro products/prices
- [ ] Checkout: tier selection; webhook sets tier
- [ ] API: `require_tier`; first-audit-free for Free
- [ ] Paywall UI: tier comparison, upgrade CTAs
- [ ] Pricing page: Free / Starter / Pro table

### 7.2 Stripe Live

- [ ] `STRIPE_SECRET_KEY`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`
- [ ] `STRIPE_WEBHOOK_SECRET`; webhook handler for `checkout.session.completed`
- [ ] Resend for verification emails (production .edu codes)

### 7.3 Referral

- [ ] Store `referred_by` on sign-up when `?ref=CODE`
- [ ] Webhook: on first payment, grant both users 1 free month

---

## 8. Future: When to Add Premium Tier ($29.99+)

Add a premium tier only when:

1. **Feature exists:** 1:1 coaching sessions, human resume review, recruiter concierge, or similar.
2. **Demand signal:** Users asking for more, or willing to pay for Pro features at higher price.
3. **Unit economics:** CAC and support cost justify the tier.

**Suggested name:** "Pro Plus" or "Concierge" at $29.99. Skip $34.99 unless there is a clear second premium offering.

---

## 9. Summary Table

| Decision | Choice |
|----------|--------|
| Tiers at launch | Free, Starter ($9.99), Pro ($19.99) |
| First-audit-free | Yes |
| Nationwide | Yes (any .edu) |
| Premium ($29.99+) | Later, when features justify |
| Gift / Family | Built; enable when Stripe live |
| Recruiter API | Post-traction (2K+ subs) |
| Campus partnerships | Per-school sales |

---

*Update this doc when pricing, tiers, or strategy change.*
