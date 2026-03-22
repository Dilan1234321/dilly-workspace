# Meridian Apply Engine — Apply Through Meridian

**Idea:** Students apply to jobs **on Meridian**. We send the application (resume + Meridian profile) to the employer. Recruiters see **[Meridian Verified]** in the subject line and sender before they open anything—so they know the applicant is a real, verified student.

---

## Why this solves ghosting

- Recruiters don't click most resumes. The signal has to be **before** the click.
- When we send the application, we control **subject line** and **sender**: e.g. `[Meridian Verified] Jordan Smith – Marketing Intern at Acme` from `apply@meridian-careers.com`.
- Recruiter's inbox becomes the list view: they see "Meridian Verified" and can prioritize those applications first. No Handshake or ATS integration required for v1.

---

## How it could work

### Student flow

1. Student is on **Jobs** (we already have recommended jobs, Apply button today goes to external URL).
2. For jobs that support **Apply through Meridian**, we show **Apply on Meridian** (or **Apply** that runs our flow).
3. Student clicks → confirmation: "We'll send your resume and Meridian profile to [Company]. Recruiters will see you're a verified student." Optional: add a short note (cover line), pick which resume (last audit PDF or upload).
4. Student confirms → we send the application (see below). Success: "Application sent. Recruiters will see [Meridian Verified] in their inbox."

### What we send to the employer

- **To:** Employer application email (we have to have this on file for each job/company that accepts Meridian Apply).
- **From:** e.g. `apply@meridian-careers.com` or `applications@meridian-careers.com` (reply-to: student's email so recruiter can reply).
- **Subject:** `[Meridian Verified] {Student name} – {Job title} at {Company}`.
- **Body:** Short note (optional from student), link to student's six-second Meridian profile, link to download resume PDF (or attach PDF). One line: "This applicant is a verified .edu student via Meridian. View full profile: [link]."

So the recruiter sees in their inbox: **[Meridian Verified]** and the name/role. They don't have to open the resume to know the applicant is verified.

### Which jobs support "Apply through Meridian"

We need a way to know **where** to send the application. Options:

| Option | How we get the destination | Pros | Cons |
|--------|----------------------------|------|------|
| **A. Employer opt-in** | Employers (or career center on their behalf) register with us: company + role(s) + application email. We only show "Apply on Meridian" for those jobs. | Clean; we know the email; recruiter expects Meridian applicants. | Need to sign up employers or partners. |
| **B. Career center pipeline** | Career center gives us a list: e.g. "Career fair employers" or "Campus recruiters" with application emails. We create jobs in our system (or tag existing jobs) with that email. | One relationship (career center); they already have employer contacts. | Jobs list might be campus-specific; we need to match our job feed to their list. |
| **C. Apply email in job record** | Our job schema (e.g. in company_criteria or job_matching) includes optional `application_email`. When present, we show Apply on Meridian and send there. | Works with existing job pipeline if we can get emails (scraping is unreliable; partner data is better). | We need a source for that email. |

**Pragmatic v1:** Start with **B (career center)** or **A (employer opt-in)**. E.g. "Meridian for Spartans" pilot: UTampa Career Center gives us 10–20 employers (or career fair companies) + application emails. We add those jobs (or tag them) so students see "Apply on Meridian" for those roles. We send to the provided email. Later: employers self-serve (A) or we add application_email to job data where we have it (C).

---

## What we need to build

### Backend

- **Store application destination:** For each job (or company/role) that supports Meridian Apply, we need an `application_email` (or equivalent). Could live in job_matching, company_criteria, or a small table `meridian_apply_destinations(job_id or company+role, email, source)`.
- **POST /apply-through-meridian** (or similar): Body: `job_id`, optional `note`. Auth: student must be logged in (we have profile + latest audit). We:
  - Resolve job title, company, application email.
  - Build email: subject `[Meridian Verified] {name} – {title} at {company}`, body with profile link + resume link (or attach PDF from last audit).
  - Send email (Resend, SendGrid, or SMTP). Reply-to: student email.
  - Log the application (so we don't double-send, and for analytics).
- **Resume PDF:** We have POST `/report/pdf` that generates a report. We need either a "resume-only" PDF export or we use the full report; or we let student upload a one-pager and we attach that. Simplest v1: link to existing report PDF (signed URL) in the email body, or generate a resume-only PDF if we have that.

### Frontend

- **Jobs page:** For each job, if we have `application_email` (or "supports Meridian Apply"), show **Apply on Meridian** (primary) and optionally "Apply on company site" (external link) as secondary. If we don't have it, keep current behavior: **Apply** = external link.
- **Apply flow:** Modal or inline step: "We'll send your resume and Meridian profile to [Company]. Recruiters will see you're verified. Optional: add a short note." [Cancel] [Send application]. On success: "Application sent. Recruiters will see [Meridian Verified] in their inbox."
- **Profile link:** We have GET `/profile/public/{slug}`. We include that URL in every application email so recruiters get the six-second profile.

### Email / deliverability

- Sending domain (e.g. `apply@meridian-careers.com`) with SPF/DKIM so we don't land in spam.
- Reply-to student email so recruiters can reply directly to the student.

---

## Scope summary

| Piece | Status / effort |
|-------|-----------------|
| Job has application email | New field or table; fill via career center or employer opt-in. |
| POST apply-through-meridian | New endpoint; send email with subject/body; log application. |
| Resume in email | Link to report PDF or generate resume PDF; or attach from last audit. |
| Jobs UI: "Apply on Meridian" vs external Apply | Conditional button + confirmation modal + success state. |
| Sending domain + deliverability | Set up apply@ (or similar) and DNS. |

---

## Outcome

- Students can **apply on Meridian** for participating jobs. One place to apply; we guarantee the "Meridian Verified" signal.
- Recruiters see **before they click** that the applicant is verified. Inbox becomes the list view; they can triage Meridian applicants first.
- Connects directly to the ghosting fix: "Recruiters need to know beforehand." With the apply engine, we own the channel and the subject line.

---

## Next steps

1. **Decide v1 scope:** Career center pipeline (B) vs employer opt-in (A). If B: what does UTampa (or one school) need to give us (list of employers + emails)?
2. **Schema:** Add `application_email` (or equivalent) to jobs/destinations; API to create/update (admin or partner).
3. **Backend:** POST apply-through-meridian + email send + application log.
4. **Frontend:** Apply on Meridian button + confirmation + success.
5. **Email:** Sending domain and template.

This doc can live next to `GHOSTING_AND_FAIR_CHANCE.md` as the concrete product shape for "apply through Meridian."

---

## Implementation status & getting it known

### Built (March 2026)

- **Apply destinations store** — `api/apply_destinations.py`: `memory/meridian_apply_destinations.json` maps `job_id` → `application_email`. `get_application_email(job_id)`, `set_application_email(job_id, email)` (for admin/career center). Jobs returned from GET `/jobs/recommended` are enriched with `application_email` when set.
- **POST /apply-through-meridian** — Body: `job_id`, optional `note`. Requires subscribed user. Looks up job (verified company only), gets application email, builds profile URL and report PDF link, sends email via `email_sender.send_apply_application` (subject `[Meridian Verified] Name – Title at Company`, reply-to student). Env: `MERIDIAN_APP_URL` for profile link (e.g. https://app.meridian-careers.com), `MERIDIAN_APPLY_EMAIL_FROM` optional for apply sender.
- **Jobs UI** — Job type includes `application_email`. When present, job detail shows **Apply on Meridian** (primary) and "Apply on company site" (secondary). Modal: optional note, Send application → POST apply-through-meridian → success "Application sent. Recruiters will see [Meridian Verified] in their inbox."
- **Recruiter page** — `website/recruiters.html`: "When you see [Meridian Verified] in your inbox, you know they're real." Explains .edu-only, scores + evidence, subject line. Nav on site: "For recruiters" links here.

### How to get it known

1. **Add destinations** — Until employers or career centers provide application emails, no jobs will show "Apply on Meridian." To test: add a job id (from your jobs DB) and an email to `memory/meridian_apply_destinations.json` manually, or expose a small admin/partner API that calls `set_application_email(job_id, email)`.
2. **Career center pipeline** — Pitch: "Students can apply through Meridian for roles you list. We send you the application with [Meridian Verified] in the subject so you see they're real before you open anything." Ask for a list of employers + application emails; add them to apply_destinations (by job_id if jobs exist, or create jobs and then add).
3. **Employer opt-in** — "Want to receive Meridian-verified applicants? Give us your application email for [role/company]. We'll add you so students can Apply on Meridian."
4. **In-app & website** — Jobs page already explains "Recruiters will see you're a verified student." Recruiter page is linked from main nav. Add a line on the homepage or pricing: "Apply on Meridian for select roles—recruiters see [Meridian Verified] before they click."
5. **Email deliverability** — Use a dedicated sending domain (e.g. apply@meridian-careers.com) and set `MERIDIAN_APPLY_EMAIL_FROM`; configure SPF/DKIM so application emails don’t land in spam.
