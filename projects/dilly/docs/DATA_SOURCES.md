# Meridian Data Sources and Sourcing Policy

**Purpose:** Document where Meridian gets its criteria for schools and companies. Ensures we only use verifiable, legal, and ethical sources. Students bank on Meridian; we must be transparent and accurate.

---

## Sourcing Principles

1. **Public only** — We only use data that is publicly accessible (no login, no paywall bypass).
2. **Legal** — We respect robots.txt, rate limits, and terms of service. We do not scrape sites that prohibit it.
3. **Ethical** — We cite sources. We do not claim insider knowledge we don't have. We distinguish validated vs inferred.
4. **Verifiable** — Every criterion can be traced to a source (URL, publication, or partner validation).

---

## Confidence Levels

| Level | Meaning | Example |
|------|---------|---------|
| **Validated** | Published by institution or validated by partner (career center, employer) | AAMC competencies, school-published GPA ranges |
| **JD-based** | Derived from a specific job description the user provided | "Based on this job posting, you match X of Y requirements" |
| **Inferred** | Aggregated from public career pages, industry research, recruiter surveys | "Based on public hiring criteria and industry research" |
| **Partner-validated** | Reviewed by career center or employer partner | "Validated by UTampa Career Center" |

---

## Current Sources by Track

### Pre-Health
- **AAMC** — Published competencies, MSAR data, applicant/matriculant facts. Validated.
- **ADEA** — Dental school requirements. Validated.
- **School career pages** — Published "what we look for" from individual programs. Inferred (we cite the page).

### Pre-Law
- **LSAC / ABA** — Published data. Validated.
- **School admissions pages** — Published criteria. Inferred.

### Tech
- **Company career pages** — Public "careers" or "students" pages, job descriptions. Inferred.
- **Industry research** — NACE, SHRM, published reports. Inferred.

### Business / Finance / Consulting
- **Company career pages** — Public hiring criteria. Inferred.
- **Industry guides** — Published recruiting guides (Vault, etc.). Inferred.
- **Getting guidelines without outreach:** See [HIRING_GUIDELINES_PUBLIC_SOURCES.md](HIRING_GUIDELINES_PUBLIC_SOURCES.md) for public-only ways to obtain scoring and hiring guidelines (no direct company contact).

---

## Scraping Policy

When we scrape to build or update our knowledge base:

1. **Check robots.txt** — Before any request, verify the URL is allowed for our User-Agent.
2. **Rate limit** — Minimum 2 seconds between requests per domain. Respect Crawl-Delay if specified.
3. **User-Agent** — Identify as `Meridian-Research-Bot/1.0 (+https://meridian-careers.com)` so sites can contact us.
4. **No personal data** — We never scrape or store names, emails, or other PII.
5. **Store source URL** — Every scraped criterion includes the URL it came from.
6. **Refresh policy** — Re-scrape no more than monthly per source. Cache aggressively.

---

## What We Do NOT Do

- Scrape LinkedIn, Indeed, or other sites whose ToS prohibit scraping
- Bypass paywalls or login walls
- Claim "what Goldman actually wants" without a job description or partner validation
- Use data we cannot cite or verify

---

## Job Listings (March 2026)

**Premium standard:** Meridian only lists jobs from companies/sources where we have **verified, high-confidence hiring criteria**. We apply those criteria when matching students. If we cannot confidently do this, we do not list that company's jobs.

- **USAJobs API** — Federal jobs. Free API key from developer.usajobs.gov. **Validated** (OPM, agency manuals). All federal jobs use the same framework.
- **Greenhouse Job Board API** — Public, no auth. We only scrape companies in `knowledge/company_hiring_criteria.json`. Currently: Stripe, Figma. Add more as we document their hiring criteria.

## Roadmap

1. **Phase 1 (current)** — Manual curation + published sources (AAMC, LSAC). Knowledge files in `knowledge/`.
2. **Phase 2** — Ethical scraper for company career pages. Populate `knowledge/` with scraped criteria + source URLs.
3. **Phase 3** — Career center partnership to validate criteria for target employers.
4. **Phase 4** — Outcome tracking ("Did you get an interview?") to refine criteria from real results.
