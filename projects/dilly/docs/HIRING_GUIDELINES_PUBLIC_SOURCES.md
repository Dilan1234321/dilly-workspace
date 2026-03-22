# Getting Hiring Guidelines Without Reaching Out to Companies

**Purpose:** Meridian scores and recommendations are based on **real hiring guidelines**. This doc lists ways to obtain and document those guidelines **without contacting companies directly** — using only public, legal, and verifiable sources.

---

## Yes: Public Sources (No Outreach Required)

| Source | What you get | How we use it | Confidence |
|--------|--------------|---------------|------------|
| **Company career pages** | "What we look for," "Qualifications," "Ideal candidate" | Rubric building, score alignment | Inferred |
| **Public job postings** | Required/Preferred skills, experience, education | JD-based matching; infer what they value | JD-based |
| **OPM / USAJobs** | Federal hiring criteria, competencies, assessment guides | Validated criteria for federal roles | Validated |
| **Regulatory & professional bodies** | AAMC (med), ABA/LSAC (law), SOA/CAS (actuarial) | Validated competencies and requirements | Validated |
| **Industry surveys & research** | SHRM, NACE, recruiter/hiring-manager surveys | What recruiters screen for (e.g. quantifiable impact, GPA) | Inferred |
| **Published recruiting guides** | Vault, Wall Street Prep, Mergers & Inquisitions, WetFeet | What BB banks, MBB, and firms value (GPA floors, modeling, deal experience) | Inferred |
| **Company blogs & engineering posts** | Stripe, Google rework, Meta careers — "how we hire" | Tech rubric and Build/Smart/Grit alignment | Inferred |
| **Levels.fyi / Glassdoor (aggregated)** | Compensation and hiring bar signals (not individual reviews) | Calibration and tier context; we do not scrape ToS-prohibited sites | Inferred |
| **Academic / career-center partnerships** | School-published employer lists, career-center "employers that hire our grads" | Cohort employer list; still public or partner-provided | Partner-validated |

We **do not** need to email or call a company to use the above. We read public pages, published research, and job postings; we cite the source (URL or publication) so students and partners can verify.

---

## How This Supports "Scores Based on Real Hiring Guidelines"

1. **Per-track rubrics** — We document which sources we used (e.g. TECH_HIRING_GUIDELINES_ACCURACY.md, business.json Finance/Consulting firms, DATA_SOURCES.md). Each track’s Smart/Grit/Build definition and point rules can point to these.
2. **In-app line** — We can show: *"Scored using hiring guidelines from employers and programs that hire [Tech/Finance/Pre-Health/…] candidates. Sources: [career pages, OPM, AAMC, industry research]."* No claim that "Goldman told us" unless we have partner validation; we say "based on public hiring criteria and industry research."
3. **Adding a new company** — When we add a firm to `company_hiring_criteria.json`, we do it by scraping or reading their **public** career page and job postings, then documenting the URL. No outreach required.

---

## What We Do NOT Do

- Claim a company "validated" our rubric unless they did (e.g. partner agreement).
- Scrape sites that prohibit it (e.g. LinkedIn, Indeed if ToS forbid it).
- Use paywalled or login-only content without permission.
- Invent criteria we cannot point to a public or validated source for.

---

## How Meridian Is Populated (No Outreach)

So that when you **do** reach out to companies, they can see Meridian already has many employer guidelines:

1. **Seed file** — `knowledge/company_guidelines_public_seed.json` lists dozens of companies (Tech, Finance, Consulting) with:
   - `criteria_source`: URL or citation (career page, Vault, WSP, M&I, business.json)
   - `criteria_for_llm`: what we tell the matching engine
   - `meridian_scores`: bar for Target/Reach (inferred from track and public guides)
   - All entries are **inferred** from public sources only.

2. **Ingest script** — `scripts/ingest_public_company_guidelines.py` merges the seed (and optionally `knowledge/scraped_criteria.json` from the career-page scraper) into `knowledge/company_hiring_criteria.json`. Existing rules (e.g. USAJobs, Stripe, Figma) are never overwritten. New rules use `source=career_page` and `confidence=inferred`.

3. **Scraper (optional)** — `scripts/company_criteria_scraper.py` fetches public career pages, respects robots.txt and rate limits, and can write to `scraped_criteria.json`. Run `ingest_public_company_guidelines.py --merge-scraped` to turn those extracts into rules.

4. **In the app** — `/companies` lists every company we have criteria for. Companies from the seed appear with “What they look for” and a cited source; we do not claim they “validated” us unless we have partner validation.

**To add more companies:** Add entries to `company_guidelines_public_seed.json` (with `criteria_source` and `criteria_for_llm` from public pages or guides), then run `python projects/meridian/scripts/ingest_public_company_guidelines.py`. No outreach required. Restart the Meridian API after ingest so the companies list reflects the new rules (criteria are cached in memory).

---

## Track scoring frameworks (from company guidelines)

Meridian builds **scoring frameworks per track** by aggregating the company guidelines we have for that track:

- **API:** `GET /tracks/frameworks` returns all tracks with a framework (summary, company count, average score bar). `GET /tracks/{track}/framework` returns one track’s framework (companies, summary, average_scores, source_note).
- **Use:** The app can show “How we score Tech” (or Finance, Consulting, etc.) with “Based on hiring guidelines from N employers” and the aggregated summary. The rule-based scoring in `dilly_core/tracks.py` and `scoring.py` is aligned with these employer criteria; the frameworks API exposes the link for transparency and for future refinement of weights from company bars.

---

## Company pages on the website

- **Authenticated:** `/companies` and `/companies/[slug]` show the full Meridian breakdown (score bar, what they look for as **voice-friendly bullets**, open roles, certs, recruiter advice). “Listen with Meridian Voice” sends the guidelines to Voice so the user can hear them read aloud.
- **Public (no sign-in):** `/companies/[slug]/guidelines` shows the same hiring guidelines in a scannable, voice-friendly format. No auth required. Use for shareable links and for “company pages on the website.”
- **API:** `GET /companies/{slug}/guidelines` (no auth) returns `display_name`, `criteria_source`, `confidence`, `meridian_scores`, `criteria_for_llm`, and `voice_friendly_bullets` (short list of strings for scanning and Voice).

---

## Summary

**Yes — we can get scoring and hiring guidelines from companies without reaching out.** We use public career pages, job postings, OPM, regulatory bodies, industry research, and published recruiting guides. We cite sources and use confidence levels (Validated vs Inferred) so the product stays defensible and transparent. Meridian is pre-populated with many company guidelines from these public sources so that when you reach out, employers see we already have a substantial set of hiring criteria on the platform.
