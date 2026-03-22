# Finance Track Scoring Spec

**Purpose:** Document how Finance (Big Four, investment banking, asset management) is scored so it stays aligned with public hiring guidelines and `knowledge/business.json` (Finance subtrack). All score drivers must be traceable to signals we extract or to cited sources.

**Sources:** `knowledge/business.json` (subtracks.Finance), HIRING_GUIDELINES_PUBLIC_SOURCES.md, Vault / Wall Street Prep / Mergers & Inquisitions recruiting guides (public).

---

## Track Definition

**Finance** = students targeting Big Four (audit/tax/advisory), bulge bracket and elite boutique banks, asset management, and financial firms. Distinct from general Business; majors include Finance, Economics, Accounting (see `tracks.py` MAJOR_TO_TRACK).

---

## Dimensions (aligned to business.json)

### Smart (Technical Depth for Finance)

- **GPA in Finance / Economics / Accounting** — 3.5+ typical for BB; 3.7+ for elite boutiques (business.json firms).
- **Relevant coursework:** financial modeling, statistics, econometrics, accounting — business.json dimensions.smart.
- **CFA Level I prep or CPA progress** — business.json; audit_finance keywords (cfa, cpa).
- **Honors, academic distinction** — scoring.py compute_smart_score (honors_count, major multiplier).
- **Prestige-neutral:** We do not boost Smart for school name; we use stated GPA, coursework, and certifications only.

*Traceability:* scoring.py `compute_smart_score` (GPA × MAJOR_MULTIPLIERS["Finance"], honors); major from parser or input.

### Grit (Shipping and Ownership for Finance)

- **Quantifiable impact** ($, %, revenue, cost savings, growth) — SHRM/recruiter research; business.json "quantifiable impact"; Big Four and banks value numbers.
- **Deal or audit experience** — internships, client work, transaction exposure (business.json dimensions.grit).
- **Leadership in finance/accounting orgs** (e.g. Beta Alpha Psi, investment club) — business.json; leadership_density in scoring.
- **Work/experience density** (dated roles) — recruiter screening; work_entry_count in scoring.

*Traceability:* scoring.py `compute_grit_score`: quantifiable_impact_count, leadership_density, work_entry_count; tracks.py audit_finance uses same signals for Build bonuses.

### Build (Finance readiness)

- **Financial modeling proof:** DCF, LBO, merger model, valuation — business.json dimensions.build; keywords in audit_finance (modeling, valuation, due diligence, transaction, deal).
- **Tools:** Excel, Tableau, Bloomberg, Capital IQ, FactSet — business.json; finance_kw in tracks.py (excel, tableau, etc.).
- **Certifications / exam progress:** CFA, CPA — finance_kw (cfa, cpa).
- **Deal/audit/tax exposure:** internship or project with audit, tax, advisory, compliance — finance_kw (audit, tax, advisory, compliance, gaap, sec).
- **Leadership density** (≥1) — +12 to Build (tracks.py audit_finance).
- **Quantifiable impact** (≥2) — +18 to Build (tracks.py audit_finance); aligned with "numbers and ownership" from business.json.

*Traceability:* tracks.py `audit_finance`: finance_kw list, build_raw = 6 per keyword hit; bonuses for leadership_density >= 1 and quantifiable_impact_count >= 2; cap at 100.

---

## Keyword list (tracks.py audit_finance)

Current list used for Build raw score (6 points per hit):

- excel, tableau, cfa, cpa, financial, audit, tax, advisory, valuation, modeling  
- investment, banking, asset management, private equity, hedge fund, analyst, internship  
- revenue, budget, forecast, due diligence, transaction, deal, compliance, gaap, sec  

Plus leadership_density ≥ 1 → +12; quantifiable_impact_count ≥ 2 → +18.

---

## Common gaps (business.json → recommendations)

- No financial modeling proof → recommend Wall Street Prep / BIWS and add DCF/LBO to projects.
- GPA below 3.5 without compensating signal → note BB GPA floor; suggest boutiques or regional shops.
- No finance internship before junior year recruiting → note IB recruiting timeline (sophomore year for junior summer).
- No investment club or finance org → recommend joining and adding a stock pitch.

These feed into rule-based and LLM recommendations (auditor.py, llm_auditor.py Finance cohort prompt).

---

## Regression

Finance scoring regression lives in:

- `scripts/fixtures/finance_scoring_regression_expected.json` — expected signals and build_min/build_max per snippet.
- `scripts/finance_scoring_regression.py` — runs extract_scoring_signals + audit_finance and asserts.

Update fixtures when we intentionally change Finance scoring or keyword list.
