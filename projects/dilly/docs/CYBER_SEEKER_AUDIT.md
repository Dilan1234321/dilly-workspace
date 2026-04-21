# Honest Audit — "Can Dilly actually help a cybersecurity job seeker?"

Date: 2026-04-21
Owner: Dilan
Framing question: your friend is a cybersecurity guy, out of work,
struggling. If he downloads Dilly tonight, does it help him get the job?

**Short answer: No. Not today. Roughly 30% of the promise is real,
70% is either missing, generic, or wrong for his cohort.**

This document walks through what he'd actually experience, step by
step, and names the gaps in order of how badly they break the
promise. Every gap has a fix that does NOT require a model provider,
does NOT require new infra, and in most cases takes 1-3 days.

---

## What Dilly tells him it does (from marketing + onboarding copy)

1. "Dilly helps you land the job" — clear functional promise
2. "Cohort-aware coaching" — your cohort shapes what you see
3. "Live job feed tailored to you"
4. "ATS scan so your resume parses through the systems real recruiters use"
5. "Interview prep that looks like what you'll actually get"
6. "Coaching so you know what to work on"

All six are concrete promises. Let's walk each one.

---

## Walk-through — the cybersecurity seeker's session

### Step 1: He opens Dilly and signs up
**Works.** Onboarding asks his major/minor, industry target. He picks
Computer Science + Cybersecurity interest. Cohort gets set to
`tech_cybersecurity` via `select_cohorts_for_student()`.

### Step 2: He uploads his resume
**Works.** Upload parses into the profile. Facts get extracted.
Cohort confirmed.

### Step 3: He opens the Jobs feed
**PARTIALLY WORKS.** Here's what he sees:

- **444 jobs in `tech_cybersecurity`** after yesterday's canonical cohort
  backfill (before the backfill it was effectively 0 — the legacy
  label was "Cybersecurity & IT" but the UI expected the canonical
  ID and the two were never connected).
- For reference, LinkedIn shows ~30k "cybersecurity" jobs at any time
  in the US. **We have 1.5% market coverage.**
- Of those 444, most are senior (+5 years). Junior/mid count is
  probably ~100. This is a man looking for work; the feed shows him
  enough for maybe 2 days of applying.

**Gap 1: Job feed is too thin for this cohort.**
- Fix: execute the scraper surge plan (docs/SCRAPER_SURGE_PLAN.md)
  Phase 2 — plumb Workday + USAJobs specifically. Every DoD/CISA/NSA
  contractor is Workday. USAJobs has thousands of cybersecurity roles.
  Expected lift for `tech_cybersecurity` alone: 444 → 3,500-5,000.
- Effort: ~2 days.

### Step 4: He taps a job to read the "fit narrative"
**HALF-WORKS.** Dilly writes a paragraph about why he's a fit or not.
Uses his profile facts. Claude-driven, costs money per call. Problem:

- Many jobs have NO profile context (Dilly doesn't know enough about
  him yet for a specific fit narrative) — you flagged this one yesterday.
- When it does write one, it's generic because the legacy cohort label
  ("Cybersecurity & IT") is too broad. A SOC analyst role, a cloud
  security engineer role, and a pentester role all get the same
  narrative shape.

**Gap 2: Fit narrative should be gated AND sub-cohort aware.**
- Fix A (gating, quick): in `jobs.tsx` / `jobs_narrative.py`, don't
  surface fit narrative until the user has ≥ 8 facts AND the user's
  cohort matches the job's canonical_cohorts. You already asked for
  this yesterday.
- Fix B (sub-cohort, medium): add sub-cohort tags to
  `tech_cybersecurity` — `{soc, cloud_security, appsec, pentest,
  grc_compliance, incident_response}`. Tag each job with one. Shape
  the narrative per sub-cohort.
- Effort: A is 2-3 hours. B is 1 day.

### Step 5: He opens ATS Scanner on his resume
**WORKS, but doesn't know what cyber recruiters actually scan for.**

The ATS scanner in `ats_engine.py` has zero references to
cybersecurity-specific keywords. No concept that a cyber recruiter
is scanning for: CISSP, Security+, CEH, SIEM, SOAR, CVE, MITRE
ATT&CK, OWASP Top 10, NIST, ISO 27001, penetration testing, incident
response, blue team/red team, Splunk, Wireshark, Burp Suite, Nessus.

He'll get a generic ATS score. It won't tell him "your resume is
missing the 4 cert acronyms that every cyber role requires."

**Gap 3: ATS scanner has no security-domain keyword bank.**
- Fix: add cohort-specific keyword banks to `ats_engine.py`. For
  cyber: certs (CISSP, Security+, CEH, OSCP, SSCP, GSEC, GCIH,
  CompTIA), frameworks (NIST, ISO 27001, MITRE ATT&CK, OWASP),
  tools (Splunk, Wireshark, Burp, Nessus, CrowdStrike, Palo Alto),
  roles (SOC, SIEM, IR, red team, blue team, purple team, CTI).
- Effort: 1 day for cyber; then 3 days to do the other 15 cohorts.

### Step 6: He opens Interview Prep
**BROKEN.** This is the worst one. From `routers/interview_prep.py`
line 224: `_TRACK_QUESTION_BANKS` has banks for these tracks:
- `software_engineering_cs`
- `finance_accounting`
- `consulting_strategy`
- `data_science_analytics`
- `design_creative_arts`

**That's it. 5 cohorts. Cybersecurity is not one of them.**

He gets `_DEFAULT_QUESTION_BANK`:
> "Tell me about yourself"
> "Describe a challenging project"
> "What's your greatest strength"
> "Tell me about a time you failed"

Same 8 questions a sport management student gets. Same a pre-health
student gets. No SOC triage scenarios. No MITRE ATT&CK walkthroughs.
No "you detect a lateral movement alert at 2am, walk me through your
first 30 minutes." No behavioral-under-fire questions (cyber
interviews ALWAYS have these).

**Gap 4: Interview prep has question banks for 5 of 16 cohorts.**
- This is arguably the biggest single break of the promise. A user
  who pays for Dilly Pro to "prepare for their interview" gets
  generic filler for 11 of 16 cohorts.
- Fix: write 8-10 question banks per missing cohort. Static data.
  No AI cost. Can draft cyber tonight if you want.
- Effort: 2-3 days for all 11 missing cohorts. Cyber alone: ~2 hours.

### Step 7: He asks Dilly for help
**WORKS.** Ask Dilly overlay works. Claude picks up context from
facts. This is Dilly's strongest surface.

But: the coaching prompt doesn't know cyber-specific pain
("struggling to land SOC 1 → SOC 2 jump", "security clearance
limitations", "no CISSP yet"). It coaches generically.

**Gap 5: System prompts don't carry cohort-specific coaching priors.**
- Fix: add a per-cohort "coaching style" block to the system prompt.
  For cyber: "candidates typically struggle with getting past the
  HR screen without a cert; home lab + HackTheBox/TryHackMe write-ups
  are the cheat code for junior candidates; security clearance is a
  dealbreaker/non-dealbreaker per role."
- Effort: 4-6 hours for a cohort priors map, ~1 day to wire in.

### Step 8: He opens Chapter (the weekly ritual)
**WORKS.** Chapter generates a personal reflection. Uses his facts.
Honestly the most differentiated surface in the app.

Also the one least broken for his cohort because it's fundamentally
about HIM, not about his domain.

### Step 9: He tracks an application
**WORKS.** Tracker works. But doesn't learn:
- No "this is your 4th SOC analyst applied, 0 responses — your resume
  signal is weak for SOC, consider cloud security pivot."
- No conversion funnel view.
- No "you got an interview from X, here's what their rubric probably
  is" because the rubric system doesn't have sub-cohort granularity.

**Gap 6: Tracker doesn't close the learning loop.**
- Fix: add a weekly "your pipeline tells us..." summary. Zero-cost —
  just SQL over `applications` + `generated_resumes`.
- Effort: 1-2 days.

---

## Priority-ordered fix list (for next 10 days)

Each item has a "delta to promise" score: 1-5 (5 = biggest honesty gap).

| # | Fix | Delta | Effort | Cost |
|---|---|---|---|---|
| 1 | Cybersecurity question bank (cover `tech_cybersecurity`) | 5 | 2h | $0 |
| 2 | All 11 missing cohort question banks | 5 | 3d | $0 |
| 3 | Fit-narrative gating (≥8 facts + cohort match) | 4 | 3h | $0 (saves $) |
| 4 | ATS security keyword bank | 4 | 1d | $0 |
| 5 | All 16 ATS cohort keyword banks | 4 | 3d | $0 |
| 6 | Workday crawler + USAJobs surge → 3k cyber jobs | 5 | 2d | $0 |
| 7 | Cohort-specific coaching priors in system prompt | 3 | 1d | ~$0 marginal |
| 8 | Tracker weekly funnel insight | 3 | 1-2d | $0 |
| 9 | Cyber sub-cohort tagging (SOC/cloud/appsec/etc) | 3 | 1d | $0 |
| 10 | Rest of cohort scraper floors (Phase 3 of scraper plan) | 3 | 3-5d | $0 |

**Total effort to actually deliver the promise for ALL 16 cohorts:
~3 weeks of focused work, ~$0 marginal cost.**

**Fastest path to "it works for cyber specifically": items 1, 3, 4, 6 =
~3-4 days.**

---

## What Dilly DOES deliver today (being fair)

- Chapter — unique, genuinely Dilly-shaped, works across cohorts
- Resume Forge — parses resumes, generates tailored bullets, does the ATS
  scan (even if the keyword bank is shallow)
- Ask Dilly — best in class for "what should I work on" coaching
- Profile system — Dilly DOES get to know you; the facts accumulate
- Customize Dilly — every screen now honors theme (as of yesterday's
  sweep)
- Privacy-first design — no dark patterns, no retention traps

Those are real. The promise breaks when the domain-specific surfaces
(interview prep, ATS scan, job feed, fit narrative) hit a cohort that
isn't in the hot 3-5 that the app was clearly built around first
(SWE, data, finance, consulting, design).

---

## Honest recommendation for the cybersecurity friend specifically

If he opens Dilly tonight, tell him:
1. Use Resume Forge + ATS scan — **but also run his resume through
   a free tool like Resume Worded** for cyber-specific keyword hits
   until we ship the bank.
2. Use Chapter and Ask Dilly — those are genuinely strong.
3. Browse the job feed **but supplement** with ClearanceJobs,
   LinkedIn, Dice, CyberSecJobs.com. He'll get 10x the volume.
4. **Don't rely on Dilly's interview prep for cyber** until we ship
   the question bank — it'll actively waste his time with generic
   questions.

If we ship items 1, 3, 4, 6 above in the next 4 days, that advice
changes to: "Use Dilly. It's cohort-aware for cybersecurity now."

---

## What I'd build first if I had to pick ONE thing tonight

**Item 1: cybersecurity question bank.** Because:
- It's 2 hours.
- It's pure-data, zero risk, zero AI cost.
- It's the most visibly broken promise — you pay for Dilly Pro and
  get "tell me about yourself" as cyber interview prep.
- Covering ONE cohort proves out the pattern, the other 10 are copy+paste+research.

Say the word and I'll write it now.
