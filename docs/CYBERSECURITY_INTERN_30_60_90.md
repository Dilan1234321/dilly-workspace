# Dilly Trust & Security Intern — 30 / 60 / 90 Day Plan

**Company context:** Dilly (talent platform) handles sensitive student data (resumes, profiles, AI conversations, audit-related content, etc.). Security priorities include PII protection, auth/session hygiene, transport and storage controls, third-party data flows (e.g. LLM, email, payments), and a path toward retention, deletion, and compliance as you scale.

**Purpose of this plan:** Onboard quickly, deliver concrete artifacts (documentation + fixes + repeatable checks), and build toward owning a slice of the security roadmap—not “security theater.”

---

## Success criteria (end of 90 days)

- **Visibility:** Up-to-date asset and data-flow picture (what data lives where, who can access it, what leaves the network).
- **Hardening:** Measurable improvements (e.g. CORS tightened, secrets hygiene, checklist items closed from the internal security roadmap).
- **Repeatability:** At least one recurring process the team can run without you (monthly access review template, dependency scan cadence, or incident runbook draft).
- **Judgment:** You can explain tradeoffs (e.g. localStorage vs cookies, encryption at rest vs key management) in the context of this product.

---

## First 30 days — Learn, map, quick wins

**Theme:** *Understand the system; don’t break production; ship small, verifiable improvements.*

### Week 1 — Onboarding

- [ ] Sign NDAs / acceptable-use / access agreements; get accounts (repo, hosting, monitoring, email) with least privilege.
- [ ] Read existing internal docs: product auth model (.edu / verification), privacy commitments, and any **data security / scaling roadmap** (if present).
- [ ] Shadow one deploy or release; note where secrets and env vars are set (no secrets in chat or tickets).
- [ ] **Deliverable:** One-page “questions for the CTO” — gaps in your mental model only; keep it short.

### Week 2 — Inventory (no changes yet unless trivial)

- [ ] **Data map (high level):** What categories of PII exist (resume text, email, scores, audit logs)? Where are they stored (app, DB, files, object storage, logs)?
- [ ] **Trust boundaries:** Browser → API → LLM/vendor → backups. Mark where data is encrypted in transit vs at rest.
- [ ] **Auth & sessions:** How users prove identity; how sessions are issued and invalidated; token lifetime and storage.
- [ ] **Deliverable:** Diagram (Mermaid or whiteboard photo) + bullet list of “top 10 risks” *you* see, ranked by impact × likelihood, with one sentence each.

### Week 3 — Tooling & baselines

- [ ] Run dependency / CVE scans on the main app repos (whatever the stack uses: `npm audit`, `pip-audit`, GitHub Dependabot, etc.). Triage: critical vs noise.
- [ ] Review CORS, cookie flags, and HTTPS redirects in staging/prod configs (read-only first).
- [ ] **Deliverable:** Short “scan report” — findings, proposed fixes, and **what not** to auto-fix without review.

### Week 4 — First fixes (with review)

- [ ] Close 1–3 **low-risk** items: e.g. `.env.example` completeness, removing a stray debug endpoint, tightening a log line that might leak PII, documentation-only PRs.
- [ ] Pair on one config change if approved (e.g. CORS allowlist in a non-prod environment first).
- [ ] **Deliverable:** PR(s) merged or ready; short retro: what was harder than expected?

**30-day checkpoint (30-minute sync):** Review data map + risk list + first PRs. Adjust scope for days 31–60 based on stack reality.

---

## 60 days — Process, deeper review, measurable hardening

**Theme:** *Turn knowledge into repeatable practice and ship meaningful controls.*

### Days 31–45 — Secure SDLC habits

- [ ] **Threat modeling (lightweight):** Pick one flow (e.g. “upload resume → parse → score → show result”). STRIDE or simple abuse cases: spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege.
- [ ] **Secrets:** Inventory how API keys are stored and rotated; propose a rotation calendar; ensure no keys in git history (use approved scanning).
- [ ] **Deliverable:** One-page threat model + recommended mitigations mapped to “now / next / later.”

### Days 46–60 — Roadmap alignment

- [ ] Align with internal priorities: e.g. CORS restriction, session storage hardening (HttpOnly cookies vs localStorage tradeoffs), encryption-at-rest planning, retention/deletion story, subprocessors list for privacy.
- [ ] Pick **one** medium-sized initiative to drive with supervision (examples):
  - Document and test a **staging** CORS policy.
  - Draft **security requirements** for a future “delete my account” feature.
  - Define **logging standards**: what must never appear in logs vs what’s OK for debugging.
- [ ] **Deliverable:** Short spec or checklist the engineering team can execute against.

**60-day checkpoint:** Demo threat model + progress on the chosen initiative; revisit intern goals with the CTO.

---

## 90 days — Ownership, metrics, handoff

**Theme:** *You own a slice; the company keeps running when you’re back in class.*

### Days 61–75 — Metrics & accountability

- [ ] Define **3–5 security KPIs** appropriate for stage (examples: time to patch critical CVEs, % of deps on latest minor, open high findings count, MTTR for security bugs, % of endpoints behind auth).
- [ ] Set up or improve **one dashboard or recurring report** (even if it’s a weekly Markdown summary in the repo at first).
- [ ] **Deliverable:** KPI definitions + first report snapshot.

### Days 76–90 — Incident readiness & continuity

- [ ] Draft a **one-page incident checklist**: detect → contain → eradicate → recover → postmortem; include who to call and what *not* to do (e.g. don’t delete logs in panic).
- [ ] Run a **tabletop** (30 min): “API key leaked in a screenshot” or “suspicious login spike.” Capture gaps.
- [ ] **Deliverable:** Runbook v1 + tabletop notes + backlog of follow-ups.
- [ ] **Final presentation (15–20 min):** What you learned, what you shipped, what you’d do next quarter, and what the company should fund (tools, time, audits).

**90-day checkpoint:** Decide together whether to extend, convert, or part on good terms—with a clear handoff doc.

---

## How you’ll be evaluated

| Area | Strong signal | Weak signal |
|------|----------------|-------------|
| **Communication** | Clear, concise written updates; asks early when blocked | Silent until deadline; dumps problems without options |
| **Execution** | Small PRs, tests where appropriate, reversible changes | Large risky diffs without review |
| **Security mindset** | Threat-led thinking, least privilege, privacy by default | Checkbox compliance only |
| **Team fit** | Documents for the next person; respects prod | Heroics or unsupervised prod changes |

---

## Notes for the hiring manager (Dilan)

- Adjust depth to **school schedule**; this plan assumes ~15–20 hrs/week—scale milestones if part-time.
- **Pairing beats solo:** Interns learn fastest reviewing real diffs with you or a senior engineer.
- Reuse internal roadmap items (CORS, token storage, secrets, retention, vendor DPAs) as **backlog fuel** so work ties to company reality, not generic OWASP homework.

---

*Last updated: 2025-03-20*
