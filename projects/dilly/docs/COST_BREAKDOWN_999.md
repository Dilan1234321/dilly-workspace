# Meridian — Cost Breakdown at $9.99/month

**Price:** $9.99/month per subscriber.  
**Goal:** See what you keep after costs (payment processing, LLM, hosting, etc.).

---

## 1. Revenue (what the customer pays)

| Item | Amount |
|------|--------|
| **Price** | $9.99 / month |

---

## 2. Costs (what you pay)

### 2.1 Payment processing (Stripe, when you add it)

| Item | Rate | On $9.99 |
|------|------|----------|
| Stripe fee | 2.9% + $0.30 per charge | ~$0.59 |

**You receive after Stripe:** **~$9.40** per paying subscriber per month.

*(If you use PayPal or another processor, adjust the rate; 2.9% + $0.30 is standard.)*

---

### 2.2 LLM (OpenAI) — per audit

Meridian uses **gpt-4o** by default (or **gpt-4o-mini** if you set `MERIDIAN_LLM_MODEL=gpt-4o-mini`).

**Approximate usage per full audit (LLM path):**

| Call | Typical tokens (in / out) | GPT-4o cost (approx) | GPT-4o-mini (approx) |
|------|---------------------------|----------------------|----------------------|
| Resume normalizer (optional) | ~4k in, ~2k out | ~$0.03 | ~$0.002 |
| Main auditor | ~10k in, ~2k out | ~$0.045 | ~$0.003 |
| Explain-delta (if they have prior audit) | ~3k in, ~0.5k out | ~$0.01 | ~$0.001 |
| **Total per audit (full LLM)** | | **~$0.05–0.09** | **~$0.005–0.01** |

*GPT-4o: input $2.50/1M, output $10/1M. GPT-4o-mini: much lower (e.g. ~$0.15/1M in, ~$0.60/1M out).*

**If you run without LLM** (`MERIDIAN_USE_LLM=0`): **$0** per audit (rule-based only).

**Assumption for “typical” subscriber:**  
- **5 audits/month** with LLM → **~$0.25–0.45/month** (gpt-4o) or **~$0.03–0.05** (gpt-4o-mini).

---

### 2.3 Hosting (API + dashboard)

| Service | Typical monthly cost |
|---------|----------------------|
| API (Railway / Render / Fly / VPS) | ~$5–25 |
| Dashboard (Vercel or same host) | $0 (free tier) or ~$20 |
| **Total hosting** | **~$10–45/month** |

*Depends on traffic and region. One small API instance often fits in $10–20.*

---

### 2.4 Other (optional)

| Item | Notes |
|------|--------|
| Magic-link email | Free tier (Resend/SendGrid/etc.) often covers early volume; later ~$10–20/month. |
| Domain | ~$10–15/year. |
| Support / your time | Not a direct cash cost; set aside if you want a “salary” line. |

---

## 3. Profit per subscriber (summary)

**After Stripe:** **$9.40** per subscriber per month.

**Costs that scale with usage:**

| Scenario | LLM cost per sub/month | You keep (before hosting) |
|----------|-------------------------|----------------------------|
| 5 audits/month, **gpt-4o** | ~$0.30–0.45 | **~$9.00–9.10** |
| 5 audits/month, **gpt-4o-mini** | ~$0.03–0.05 | **~$9.35–9.37** |
| 5 audits/month, **no LLM** (rule-based) | $0 | **~$9.40** |
| 20 audits/month, gpt-4o | ~$1.00–1.80 | **~$7.60–8.40** |

**Fixed cost (hosting):** e.g. **$15–25/month** total. So:

- **100 subscribers:**  
  - Revenue after Stripe: **$940**  
  - LLM (5 audits/sub, gpt-4o): **~$30–45**  
  - Hosting: **~$15–25**  
  - **Profit ≈ $870–890** (or **~$8.70–8.90 per subscriber**).

- **500 subscribers:**  
  - Revenue after Stripe: **$4,700**  
  - LLM: **~$150–225**  
  - Hosting: **~$25–50** (slightly more capacity)  
  - **Profit ≈ $4,425–4,525** (or **~$8.85–9.05 per subscriber**).

---

## 4. Short answers

| Question | Answer |
|----------|--------|
| **If the price is $9.99, how much do I profit?** | **Roughly $8.50–9.40 per subscriber per month** after Stripe, LLM (at 5 audits/month with gpt-4o), and a share of hosting. Most of the $9.99 is profit at low/medium usage. |
| **What drives cost up?** | Heavy LLM use (many audits per user) and using gpt-4o instead of gpt-4o-mini. |
| **How to improve margin?** | Use **gpt-4o-mini** where quality is fine; cap or discourage very high audit counts per user; keep rule-based fallback when LLM isn’t needed. |

*Last updated: 2025-03. Stripe and OpenAI pricing can change; re-check their sites when you launch.*
