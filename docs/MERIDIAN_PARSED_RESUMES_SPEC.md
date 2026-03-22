# Meridian: Parsed Resumes & High-Impact Explanations

**Product decisions (captured for continuity).** When in doubt, ask questions to get a deeper analysis and ensure the product is perfect.

---

## 1. Parsed Resume Format (Q1)

- **Structured version (B):** Save a **structured** representation so we can reliably say which block is which (e.g. Education, Experience, Leadership, Honors, Skills).
- Not just raw text; labeled sections/blocks that Meridian can programmatically use.

---

## 2. When & Where Files Live (Q2)

- **On upload:** When someone uploads a new version of their resume, parse it and **overwrite** the existing text file for that person (no version history for now).
- **Location:** Parsed resumes live in a folder called **`parsed_resumes`** inside the **meridian** folder (e.g. `projects/meridian/parsed_resumes/`).

---

## 3. How Explanations Are Driven (Q3)

- **Primary driver: LLM.** The LLM should receive the **full parsed resume content** (from the text file) as context.
- **Output:** High-quality, high-impact explanations that cite **specific** content from the parsed file (e.g. "President of the Data Science Club" and other roles), not generic phrases like "your leadership roles."

---

## 4. Scope (Q4)

- Applies to **all three dimensions:** Smart, Grit, and Build.
- **Audit findings** and **recommendations** are both driven by the same parsed-file analysis (not just the one-sentence evidence).

---

## 5. Identity / Matching

- **All based on email.** One canonical parsed file (and profile) per person, keyed by email. File naming / overwrite uses email, not candidate name alone.
- **First time opening the app:** Ask for a **.edu email**; then ask them to **create a password**. (Sign-up flow.)
- **When uploading a resume and choosing "Update Existing Profile":** Ask them to **type their email and password** (sign-in) so we verify identity and overwrite that account’s parsed resume. No overwriting without email + password.
- **New profile:** If they don’t choose "Update Existing Profile" (e.g. first-time user or "New profile"), we create a new file/keyed profile (and after sign-up we have their email for future overwrites).

---

## Follow-up: Structure & Flow

### Section labels (inferred, not fixed)
- Use **explicit labels** in the structured file (e.g. `[EDUCATION]`, `[EXPERIENCE]`, `[LEADERSHIP]`).
- **Do not** use a fixed set of section names. Meridian (LLM or parser) should **infer** section names from the resume (e.g. "Leadership & Involvement" → keep or normalize to a label).

### Block format (light structure)
- Inside each section: **light structure** per role/entry, e.g. `Role: President | Org: Data Science Club | Dates: 2024–Present` then bullets, so the LLM and code can reliably use role + org for Grit, etc.

### When parsing runs
- **Same request as audit.** Upload → extract text → parse → write to `parsed_resumes/` → run LLM audit using that file. No separate "parse only" endpoint.

### What the LLM sees per dimension
- Send **only the sections relevant to each dimension** (e.g. Education/Honors for Smart, Experience/Leadership for Grit, projects/clinical/tech for Build). Not the full file in one go per call unless we combine dimensions.

### Prompt wording (evidence + findings + recommendations)
- **Never say anything that isn’t there, isn’t true, or turns someone’s achievements into something they’re not.** Meridian turns students’ real projects and roles into phenomenal wording **without lying**. One of Meridian’s key features.
- **Length:** Cover all parts of the resume that relate to the dimension, but **not crazy long**. Concise and high-impact.
- **Tone:** Innovative, professional, smart. User must feel they have a **professional consultant and advisor in their pocket** (Meridian = app, $19.99/mo)—top-quality advice without paying for in-person consultants or wasting time. It must be obvious why people pay for Meridian instead of giving ChatGPT/Gemini their resume.
- **Explicit scope:** Tell the model which section labels we’re sending for this dimension (e.g. “For Grit we are sending: [EXPERIENCE], [LEADERSHIP]”).
- **Avoid generic language.** Users pay for a consultant in their pocket, not an app that says what anyone else could say. No generic phrases (e.g. “your leadership roles”, “various experiences”)—always cite specific roles, orgs, honors, projects.

### File naming & identity
- **Primary key: email.** Parsed resume file (and profile) is keyed by user's email (e.g. sanitized email in filename or in an index). One file per email.
- **Disambiguator:** Only when we don't have email (e.g. anonymous or pre-auth upload)—use candidate name + disambiguator (e.g. `John_Smith_1.txt`) so we don't overwrite the wrong person. Once they sign up / sign in, we attach that upload to their email.
- **Email source:** Eventually from (a) app sign-up/sign-in and (b) parser extraction from resume. For now use **parser extraction** so the email parser is production-ready by launch. Auth = .edu + verification code (no password)—see below.

---

## App auth: .edu only, no password (Q3 + Q4 — revised)

- **.edu only (Q1):** Sign-up / sign-in accepts **only .edu emails**. Ensures student-only, reduces fakes, bots, and fraud (Handshake/LinkedIn-style issues). Meridian is for college students only.

- **No password (Q4):** User enters .edu email → we **send a verification code** to that email → user enters the code in the app → if it matches, they're logged in. No password to remember or store. **Locked in:** (1) **Rate limit** codes/links per email per hour (e.g. 3–5) to prevent abuse and spam. (2) **Verification code expiry** (e.g. 10–15 min) so old codes can't be reused. (3) **.edu check** before sending—validate domain is .edu so no one can fake a non-student email.

- **Resume upload only when logged in (Q3 — revised):** There is **no** "New profile" vs "Update Existing Profile" choice. Resume re-uploads are allowed **only when the user is already logged in**. Home screen has an **"Update resume"** (or similar) button; when they're logged in, the app already knows who they are (from session), so any new upload **is** that user's resume update—we overwrite their parsed file. Obvious who it belongs to. First-time users: they sign in (or sign up via verification code), then upload once to create their profile; later, same flow—logged in, tap Update resume, upload replaces their file.

---

## Section → dimension mapping (Q5 — chosen: 3 Hybrid)

- **Default mapping in code:** E.g. section label contains "education" or "honors" → Smart; "experience", "leadership", "work" → Grit; "project", "clinical", "tech", "research" (for Build) → Build. Gives a reliable fallback.
- **LLM can override per resume:** Based on section names and content, the LLM can refine (e.g. "this [PROJECTS] section is mostly leadership, also use for Grit") so we don't miss relevant blocks when resume section names are nonstandard.

---

## Verification flow — alternatives (Q4)

**Chosen: no password.** User types .edu email → we send a **verification code** → user enters code → if match, they're in. Other options that also avoid passwords:

- **Magic link:** Send a link to their email (e.g. "Click to log in to Meridian"); clicking it logs them in. Fewer steps than typing a code; requires the app or browser to open the link. Used by Notion, Slack, etc.
- **Verification code (what you chose):** 6-digit (or short alphanumeric) code; user types it in the app. Familiar (like 2FA), works even if link-opening is awkward. Slightly more steps.
- **Both:** Offer "Email me a link" or "Email me a code" so users can choose.

**Implemented (Q4 — locked in):** (1) **Rate limit** codes/links per email per hour (e.g. 3–5). (2) **Expiry:** Code valid for 10–15 minutes. (3) **.edu check:** Validate domain is .edu before sending; reject non-.edu so no one can fake an email. Magic link can be added later as an optional alternative to code.

---

## When to build auth (Q2 — re-asked)

**What Q2 is solving:** We have two big pieces—(1) **parsed resumes + audit** (structured file, LLM explanations, section mapping, one file per user) and (2) **auth** (verification code, .edu check, rate limit, expiry, session, so "Update resume" overwrites the right user's file). We can't do everything at once. Q2 is: **do we build (1) first and document (2) for later, or build (2) now** so the full "log in → Update resume → overwrite my file" flow works in this repo today? It's an ordering/priority decision.

Given: **no password**, **verification code** (rate limit, expiry, .edu check) to log in; **resume upload only when logged in**; home screen has **"Update resume"** and the app knows who the user is from session. So auth = .edu email + send code → verify code → issue session/token; resume uploads are always tied to the logged-in user.

- **Option (a) — Design and document only (no auth code yet).** We write down the full flow (sign-in with .edu + verification code, home screen with "Update resume" when logged in, overwrite that user's parsed file on upload). The **parsed-resume + audit** work (structured file, LLM explanations, section mapping) gets built first. No login/send-code/verify API in the current codebase yet; when auth is built later, it follows this spec and file-naming is already keyed by email.

- **Option (b) — Build auth in this repo now.** We add: (1) API to request a code (accept .edu email, validate .edu, send code via email, store code + expiry), (2) API to verify code and return a session/token, (3) protected upload endpoint that uses the session to know which user's file to overwrite. The full flow works end-to-end: .edu-only, code-based sign-in, "Update resume" overwrites the right parsed file. Requires an email-sending service (e.g. SendGrid, Resend, AWS SES) and a place to store pending codes (e.g. DB or file).

**Summary:** (a) = spec + parsed/audit first, auth later. (b) = verification-code auth + email sending implemented now.

**Chosen: Option (a).** Build parsed-resume + audit first; auth stays documented only until we implement it later. **Implemented:** Structured resume is built and written to `projects/meridian/parsed_resumes/{key}.txt` on each audit; LLM receives the structured text (with [SECTION] labels) so it can cite specific roles/orgs; prompt instructs model to use those sections and avoid generic phrases.

---

## Working Principle

**Ask questions** to get a deeper analysis and ensure the product is perfect. Document answers here and in USER.md as needed.
