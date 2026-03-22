# Data Security Roadmap for Meridian at Scale

**Goal:** Secure user data (resumes, profiles, PII) as Meridian grows. This doc outlines what you have today and what to add before or as you scale.

---

## Current State

### Data You Store

| Data | Location | Sensitivity |
|------|----------|-------------|
| Auth (users, sessions, verification codes) | `memory/dilly_auth.json` | High |
| Profiles (name, major, goals, deadlines) | `memory/dilly_profiles/{id}/profile.json` | High |
| Audit history summaries | Per-user `audits.json` | Medium |
| Audit log (resume excerpts, scores) | `memory/meridian_audit_log.jsonl` | High |
| PDF reports | `memory/meridian_reports/` | High |
| Client-side: audit cache, voice convos, action items | `localStorage` (browser) | Medium |

### Current Security Posture

- **Secrets:** Env vars (`OPENAI_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, etc.) — no vault
- **Auth:** JWT-like session tokens in `localStorage` — not HttpOnly cookies
- **Storage:** Plain JSON files on disk — no encryption at rest
- **Transit:** HTTPS assumed in prod — good
- **CORS:** Currently `*` — needs restriction for prod
- **LLM:** Resume text sent to OpenAI — check their DPA and data retention policy

---

## Phase 1: Before You Grow (Do Soon)

### 1.1 Restrict CORS

- Replace `*` with explicit allowed origins (e.g. `app.meridian.ai`, `meridian-careers.com`)
- Set via `CORS_ORIGINS` env var; parse and use in FastAPI middleware

### 1.2 Secure Token Storage

- **Today:** Token in `localStorage` — vulnerable to XSS
- **Target:** HttpOnly, Secure, SameSite cookies for session token
- **Change:** API sets cookie on verify; dashboard reads from cookie (or keep token for API calls but don’t expose to JS if possible)
- **Fallback:** If you keep localStorage, ensure no sensitive data in token payload; short expiry; refresh flow

### 1.3 Secrets Management

- **Today:** Secrets in `.env` / host env
- **Target:** Use a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault, Doppler) before scaling
- **Quick win:** Never commit secrets; use `.env.example` with placeholders; rotate keys periodically

### 1.4 LLM Data Handling

- **OpenAI:** Confirm you’re on a plan that does not train on your data (API data is not used for training per their policy, but verify DPA)
- **Document:** Add a short “We do not train on your data” note in privacy policy
- **Optional:** Use Azure OpenAI or a proxy if you need stricter data residency

---

## Phase 2: As You Scale (Pre-Enterprise)

### 2.1 Encryption at Rest

- **Today:** JSON files on disk, no encryption
- **Target:** Encrypt sensitive files before writing
- **Options:**
  - Application-level: Encrypt `meridian_auth.json`, profile JSON, audit log with a key from env (e.g. `MERIDIAN_ENCRYPTION_KEY`)
  - Infrastructure: Use a DB or object store with encryption at rest (e.g. S3 + KMS, RDS encryption)
- **Key management:** Store encryption key in secrets manager; rotate periodically

### 2.2 Move to a Database

- **Today:** File-based (JSON, jsonl)
- **Target:** PostgreSQL (or SQLite for small scale) for auth, profiles, audit history
- **Benefits:** ACID, backups, access control, easier encryption at rest
- **Migration:** Script to import existing JSON into DB; run in a maintenance window

### 2.3 Audit Logging

- Log: who accessed what (user ID, endpoint, timestamp)
- Store in a separate log (not mixed with app logs)
- Retain for 90 days (adjust for compliance)
- Use for incident investigation and compliance

### 2.4 Data Retention & Deletion

- **Policy:** Define how long you keep:
  - Audit history
  - Profile data
  - Audit log entries
  - PDF reports
- **Deletion:** Implement “delete my account” that:
  - Removes profile, audit history, reports
  - Prunes audit log entries for that user
  - Invalidates sessions
- **Backups:** Ensure backups are purged when user data is deleted (or support point-in-time restore and purge)

---

## Phase 3: Enterprise / Compliance

### 3.1 Compliance Frameworks

| Framework | When You Need It | Main Focus |
|-----------|------------------|------------|
| **FERPA** | Selling to US schools | Student data handling, consent, access |
| **CCPA** | California users | Disclosure, opt-out, deletion |
| **GDPR** | EU users | Consent, portability, right to erasure |
| **SOC 2 Type II** | Enterprise sales | Security controls, third-party audits |

### 3.2 Privacy Policy & DPA

- **Privacy policy:** What you collect, why, how long you keep it, who you share with (e.g. OpenAI, Stripe, Resend)
- **DPA:** Data Processing Agreement for subprocessors (OpenAI, Resend, Stripe, hosting)
- **Subprocessor list:** Maintain and publish a list of third parties that process data

### 3.3 Access Control

- **RBAC:** Roles (admin, support, user) with least privilege
- **Support access:** Support should not see raw resumes by default; use masked or tokenized access if needed
- **Admin:** Separate admin auth; MFA for admin accounts

### 3.4 Incident Response

- **Plan:** Document steps for a suspected breach (contain, assess, notify, remediate)
- **Notification:** Know when you must notify users/regulators (e.g. 72h under GDPR)
- **Contact:** Designate a security contact (email) for reports

---

## Quick Reference: Sensitive Data Flow

```
User uploads resume
  → API receives PDF/text
  → Stored in memory (audit log, possibly parsed)
  → Sent to OpenAI for audit
  → Results stored (audit history, report)
  → Some cached in localStorage (last audit)
```

**Risks:** Unencrypted storage, token in localStorage, CORS wide open, no formal retention/deletion.

---

## Prioritized Checklist

| Priority | Item | Effort |
|----------|------|--------|
| P0 | Restrict CORS to prod origins | Low |
| P0 | Verify OpenAI DPA / no training on data | Low |
| P1 | HttpOnly cookies for session | Medium |
| P1 | Secrets in a vault (not just env) | Medium |
| P1 | Encryption at rest for auth + profiles | Medium |
| P2 | Migrate to PostgreSQL | High |
| P2 | Audit logging (access logs) | Medium |
| P2 | Retention policy + delete-account flow | Medium |
| P3 | SOC 2 prep (when enterprise-ready) | High |
| P3 | FERPA/CCPA/GDPR documentation | Medium |

---

## Resources

- [OpenAI API data usage](https://openai.com/policies/api-data-usage-policy)
- [FERPA and edtech](https://www2.ed.gov/policy/gen/guid/fpco/ferpa/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) — general web security
