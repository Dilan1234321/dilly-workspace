# Cost estimate: 500 users, 1 month free reign

Rough monthly cost if 500 testers have full access (no payment) and use the app actively. All figures are estimates; your actual usage will depend on how often people run audits, use Voice, and trigger explain-delta.

---

## What costs money in Meridian

| Service | Used for | Paid? |
|--------|----------|--------|
| **OpenAI (gpt-4o)** | Resume audit (LLM), Voice chat, explain-delta | Yes — per token |
| **Resend** | Verification emails (one per signup; optional re-send) | Free tier: 3,000/month |
| **Stripe** | Checkout (not used during free trial) | $0 while no one pays |
| **API hosting** | Railway / Render / Fly (or similar) | Free tier or ~$5–20/mo |
| **Dashboard** | Vercel (Next.js) | Free tier usually enough |
| **PDF reports** | ReportLab, file storage on API server | No third-party cost |
| **Resume parsing** | Rule-based (no LLM) | $0 |

So the only variable that scales with 500 users is **OpenAI**. Everything else is either free tier or a small fixed hosting cost.

---

## OpenAI usage (model: gpt-4o)

Default model in Meridian is **gpt-4o** (`MERIDIAN_LLM_MODEL` or fallback in `llm_client.py`). Approximate pricing (as of 2025):

- **Input:** $2.50 per 1M tokens  
- **Output:** $10.00 per 1M tokens  

### Per-call estimates

1. **One resume audit (POST /audit/v2)**  
   - System prompt + cohort block: ~4k tokens  
   - User: resume text + instruction: ~2k tokens  
   - Output: JSON (findings, recommendations, evidence): ~2k tokens  
   - **Input:** ~6k × $2.50/1M ≈ **$0.015**  
   - **Output:** ~2k × $10/1M ≈ **$0.02**  
   - **Total per audit:** ~**$0.035–0.04**  
   - Note: content-hash cache reuses result for same resume within 24h, so repeat runs don’t always call the LLM.

2. **Explain-delta (POST /audit/explain-delta)**  
   - Small input (two audit summaries), max_tokens=500.  
   - **Per call:** ~**$0.005**

3. **Voice chat (POST /voice/chat)**  
   - One call for the reply (max_tokens=800), one for the 3 suggestions (max_tokens=200).  
   - **Per user message:** ~**$0.01** (two completions).

---

## Scenario: “Free reign” for 500 users × 1 month

Assumptions: everyone is active; no one is paying; Resend and Stripe are as above.

### High engagement (power users)

- **Audits:** 500 users × 4 audits/month → 2,000 audits. Cache reduces effective calls by ~15% → ~1,700 LLM audits.  
  - 1,700 × $0.037 ≈ **$63**
- **Explain-delta:** 500 × 1.5 calls ≈ 750 × $0.005 ≈ **$4**
- **Voice:** 500 × 15 messages ≈ 7,500 × $0.01 ≈ **$75**
- **OpenAI total:** **~$142**

### Medium engagement (typical testers)

- **Audits:** 500 × 2.5 audits → 1,250 (after cache) → ~1,060 × $0.037 ≈ **$39**
- **Explain-delta:** 500 × 0.8 ≈ 400 × $0.005 ≈ **$2**
- **Voice:** 500 × 6 messages = 3,000 × $0.01 ≈ **$30**
- **OpenAI total:** **~$71**

### Light engagement (many sign up, few use heavily)

- **Audits:** 500 × 1.2 → 600 × $0.037 ≈ **$22**
- **Explain-delta:** 250 × $0.005 ≈ **$1**
- **Voice:** 500 × 2 = 1,000 × $0.01 ≈ **$10**
- **OpenAI total:** **~$33**

---

## Other costs (same for all scenarios)

- **Resend:** 500 signups + maybe 100–200 re-verifications = well under 3,000/month → **$0** (free tier).
- **Stripe:** No payments during trial → **$0**.
- **API hosting:** Depends on provider. Free tier (Railway/Render/Fly) might be enough; if not, **~$5–20/month**.
- **Dashboard (Vercel):** Free tier usually sufficient for 500 users → **$0**.

---

## Total for one month (500 users, free reign)

| Scenario        | OpenAI | Resend | Stripe | Hosting (est.) | **Total**   |
|----------------|--------|--------|--------|----------------|------------|
| High engagement| ~$140  | $0     | $0     | $0–20          | **~$140–160** |
| Medium         | ~$70   | $0     | $0     | $0–20          | **~$70–90**  |
| Light          | ~$33   | $0     | $0     | $0–20          | **~$33–55**  |

So in practice: **about $35–160 per month**, with a reasonable mid-range of **~$70–100** if testers use the app a normal amount (a few audits, some Voice, occasional explain-delta).

---

## gpt-4o vs gpt-4o-mini

**Pricing (per 1M tokens, 2025):**

| Model        | Input | Output |
|-------------|-------|--------|
| **gpt-4o**  | $2.50 | $10.00 |
| **gpt-4o-mini** | $0.15 | $0.60  |

Mini is about **17× cheaper** (input) and **~17× cheaper** (output).

### Per-call cost comparison

| Call type     | gpt-4o   | gpt-4o-mini | Ratio   |
|---------------|----------|-------------|--------|
| One audit     | ~$0.037  | ~$0.0021   | ~18×   |
| One Voice msg | ~$0.01   | ~$0.00054   | ~18×   |
| Explain-delta | ~$0.005  | ~$0.0003    | ~17×   |

### 500 users × 1 month (same usage as above)

| Scenario        | gpt-4o (OpenAI) | gpt-4o-mini (OpenAI) |
|----------------|------------------|------------------------|
| High engagement| ~$142            | **~$8**                |
| Medium         | ~$71             | **~$4**                |
| Light          | ~$33             | **~$2**                |

So for the same usage, **mini is roughly $65–135 cheaper per month** — you’d land around **$2–8** in OpenAI spend for the 500-user test instead of **$33–142**.

### Quality / capability tradeoffs

- **gpt-4o**  
  - Strong at: long, strict instructions (your audit system prompt), structured JSON, MTS (no hallucination), track-specific nuance, line_edits with exact quotes, consistent persona.  
  - Best for: the main resume audit where quality and “Meridian Hiring Manager” voice matter most.

- **gpt-4o-mini**  
  - Cheaper and faster; good for short, well-defined tasks.  
  - Weaker at: very long system prompts, strict JSON schema, and not inventing content (MTS). You may see more generic recommendations, occasional schema slips, or less consistent cohort-specific advice.

**Practical split:**  
- **Audits:** keep **gpt-4o** if you care about audit quality and MTS; switch to **gpt-4o-mini** only if you’re okay validating quality (e.g. A/B or manual review).  
- **Voice + explain-delta:** **gpt-4o-mini** is a good fit — simpler prompts, shorter answers, big cost savings.  

To use mini only for Voice/explain-delta you’d need a small code change (pass a different `model` for those endpoints). Using `MERIDIAN_LLM_MODEL=gpt-4o-mini` everywhere is one env var and cuts cost to the **~$2–8** range above, with the quality tradeoff mainly on audits.

### Hybrid: 4o for audits, mini for Voice + explain-delta

Same 500 users × 1 month; only audits use gpt-4o; Voice and explain-delta use gpt-4o-mini.

| Scenario        | Audits (4o) | Voice (mini) | Explain-delta (mini) | **OpenAI total** |
|----------------|-------------|--------------|----------------------|------------------|
| High engagement| ~$63        | ~$4          | ~$0.23               | **~$67**         |
| Medium         | ~$39        | ~$1.60       | ~$0.12               | **~$41**         |
| Light          | ~$22        | ~$0.54       | ~$0.08               | **~$23**         |

So **~$23–67/month** for the hybrid (vs ~$33–142 all-4o, or ~$2–8 all-mini). You keep audit quality and save most of the cost from Voice and explain-delta.

---

## How to reduce cost during the test

1. **Use gpt-4o-mini for some calls**  
   Set `MERIDIAN_LLM_MODEL=gpt-4o-mini` (or use it only for Voice/suggestions). gpt-4o-mini is much cheaper (~$0.15/1M in, $0.60/1M out); quality for full audits may be lower, so best for Voice or as an option.

2. **Cap usage per user**  
   For example: max N audits per user per month, or max M Voice messages per day. Not implemented today; would require backend/dashboard changes.

3. **Keep content-hash cache**  
   Already in place: same resume re-audited within 24h returns cached result, so repeat runs don’t burn extra LLM.

4. **Resend**  
   Stay under 3,000 emails/month and you stay on the free tier.

---

## Summary

- **500 users, 1 month, free reign:** expect **~$70–100** in the “typical” case (OpenAI dominates; hosting $0–20).
- **Worst case (very heavy use):** **~$140–160**.
- **Best case (light use):** **~$33–55**.

All of this assumes current architecture: gpt-4o for audit + Voice + explain-delta; Resend for email; no Stripe during trial; file-based storage and your current API/dashboard hosting.
