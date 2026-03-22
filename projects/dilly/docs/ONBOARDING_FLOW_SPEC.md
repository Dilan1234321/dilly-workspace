# Meridian — Onboarding & First-Run Flow (Spec)

**Goal:** When a user opens the app, they get .edu sign-in → a short question flow → a “blow them away” run-through → then resume upload as the final drumroll → BOOM: the full app with their audit. This doc defines the steps and where the paywall fits.

---

## Flow (order)

| Step | What happens | Notes |
|------|----------------------|--------|
| **1. Sign in** | .edu email → magic link (or future: verification code). User is authenticated. | Already built. |
| **2. Questions** | One screen or a short wizard. Collect: | See question list below. |
| **3. Run-through** | A “tour” or preview of the app designed to blow them away. | Teaser of value before they upload. |
| **4. Resume** | “Final drumroll” — prompt to upload their resume. | Single clear CTA. |
| **5. BOOM** | Full app: audit runs, they see scores, evidence, recommendations, share, etc. | Current results experience. |

**Paywall:** See “Where to put the paywall” below.

---

## Questions (draft)

Use these as the post–sign-in question set. Order and exact wording can change.

| # | Question | Purpose | Storage / use |
|---|----------|---------|----------------|
| 1 | **What’s your name?** | Personalization, report cover, “Hi [Name].” | Profile / session. Pre-fill from resume later if we parse it. |
| 2 | **What year are you?** | e.g. Freshman / Sophomore / Junior / Senior / Grad. Context for recommendations. | Profile. |
| 3 | **What’s your major?** | Track detection, cohort, “Your cohort” card. | Profile; can override from resume later. |
| 4 | **What are you applying to?** | Internship / Full-time job / Grad school / Just exploring. Tailors recommendations. | Profile; pass to audit API when we add `application_target`. |
| 5 | **What are your current goals?** | Free text or chips (e.g. “Land summer analyst,” “Get into med school”). For banner, Meridian Voice later, “Am I Ready?”. | Profile. |
| 6 | **Upload your college transcript (optional)** | “So we can develop a personalized profile.” GPA, rigor, verified later. | Separate flow; optional. If we don’t have transcript verification at launch, can be “Coming soon” or skip. |

**Suggestions:**

- Keep **transcript** optional and/or “Coming soon” at launch unless you have a clear MVP (e.g. “We use it for GPA + rigor only, no verification yet”).
- **Name / year / major** can be pre-filled from resume after first upload if you want to avoid asking twice; for “blow away” feel, asking first then matching to resume is fine.
- **Goals** can be one short text field or 2–3 chips (“Get an internship,” “Get into grad school,” “Land full-time role”) plus “Other.”

---

## Run-through (“blow them away”)

Before they upload a resume, show them why the app is worth it.

**Options:**

- **A. Static preview** — 2–3 screens: “Here’s what Meridian does” with sample radar, sample “Top X%,” sample recommendation. No real data.
- **B. Sample audit** — Use a canned resume or anonymized example; walk them through “This is what you’ll see: your scores, your evidence, your recommendations.”
- **C. Short video or animated explainer** — “Run Meridian before every application” + key screens.
- **D. One hero screen** — Single screen: value prop + “Upload your resume to see your own results” as the only CTA.

Recommendation: **B or D** for launch. B is more “wow” but needs one canonical sample. D is simpler and still sets up the drumroll.

---

## Resume as “final drumroll”

- After the run-through, one clear screen: **“Now add your resume. This is where it gets real.”** (or similar)
- Single CTA: upload PDF/DOCX (same as today).
- On success → run audit → show full results (radar, evidence, recommendations, share, etc.). **BOOM.**

---

## Where to put the paywall

Three options. Pick one and we can wire it.

| Option | When paywall appears | Pros | Cons |
|--------|----------------------|------|------|
| **A. Before questions** | Right after sign-in, before any questions. “Subscribe to continue.” | Clear: pay first, then experience. | They haven’t seen value yet; might drop off. |
| **B. After run-through, before resume** | They see the run-through (teaser), then “Subscribe to run your first audit.” | They’ve seen the “wow” and are one step from the drumroll. | Some may leave before subscribing. |
| **C. After first audit (current)** | They do questions → run-through → upload → see full results. Then when they try a *second* audit or PDF download, paywall. | Maximum “wow” before asking for money; they’ve felt the product. | Need to be clear: “First audit free; subscribe for unlimited.” |

**Chosen:** **C** — First audit free, then paywall for more (unlimited audits, PDF, explain-delta). They get the full experience once, then we ask. Matches “drumroll then BOOM.”

---

## What to build (implementation order)

1. **Profile/session storage** — Where we store name, year, major, application_target, goals (and later transcript ref). Backend: e.g. extend auth store or add `profiles` keyed by email. Dashboard: read/write from context or API.
2. **Question flow UI** — One page with steps or a short wizard (name → year → major → applying to → goals → optional transcript). Submit once at the end; save to profile.
3. **Run-through** — One or a few screens (sample audit or hero + CTA). No API needed if static.
4. **Resume CTA** — Dedicated “Add your resume” step after run-through; on upload, run audit and redirect to results.
5. **Paywall** — Place per chosen option (A, B, or C); keep existing paywall component, just move when it’s shown.
6. **Wire “What are you applying to?”** — Pass `application_target` from profile into `/audit/v2` and LLM prompt (already deferred; add when question flow exists).

---

## Open decisions

- [ ] Transcript: in scope for launch or “Coming soon”?
- [ ] Run-through: B (sample audit) vs D (hero + CTA)?
- [x] Paywall: **C** (after first audit; first one free, then subscribe).
- [ ] Year: dropdown (Freshman…Senior) or free text?
- [ ] Goals: free text, chips, or both?

Once you decide these, we can turn this into concrete screens and API changes.

*Created from your description. Edit this file as you refine.*
