# Ghosting and the Fair-Chance Thesis

**How we want to be known:** The **largest platform with 100% verified real students** — no fakes, no frauds, no bots. (.edu-only signup is the guarantee. See `MERIDIAN_POSITIONING.md`.)

**Core insight:** Meridian can explode in popularity if it solves the **ghosting** problem. Students aren’t ghosted because they’re bad—they’re ghosted because recruiters often never see their resume, and when they do, it’s buried under volume and noise.

---

## Why students get ghosted

1. **ATS** — Resumes get filtered before a human sees them. Formatting, keywords, structure break in the system. Part of what we already attack.
2. **Volume** — Handshake and LinkedIn made applying frictionless. One click, 500 applications. Recruiters can’t read everything. Good candidates get lost in the pile.
3. **Fake and low-effort applications** — Because applying is so easy, people spray generic or fake resumes. Students compete with hundreds or thousands of applications that aren’t serious. Recruiters become numb; real candidates don’t get a fair look.

So ghosting isn’t only “ATS rejected me.” It’s “I’m real, I’m qualified, but I’m invisible—either filtered out or drowned in noise.”

---

## The .edu guarantee: 100% not fake

**Meridian requires a .edu email to sign up.** There is no way to get a Meridian profile without a verified student email.

So when a recruiter sees an applicant with a Meridian profile or score (e.g. six-second profile link, “Meridian” on the resume), they can say with **100% confidence** that this person is **not fake** — they are a real student. No bots, no spray-and-pray from random domains. That’s a trust signal recruiters don’t get from Handshake or LinkedIn alone.

**Pitch to recruiters:** “If they have Meridian, they’re verified .edu. Real student. You can trust that much before you even read the resume.”

---

## The opportunity

If Meridian finds a way to:

- **Give students a fair chance** — So their application is actually seen and evaluated on merit.
- **Make recruiters’ lives easier** — So they can trust that “Meridian” = verified student (not fake), real, serious, and parseable.

…then the product has a wedge into both sides: students pay to stop getting ghosted; recruiters (or schools/employers) value a signal that cuts through the noise and guarantees “not fake.”

That’s a path to **scale** (students) and **revenue** (students + later, recruiter/employer willingness to pay or partner).

---

## How Meridian already helps (and where to lean in)

| Problem | What we do today | “Fair chance” angle |
|--------|-------------------|---------------------|
| ATS filters me out | ATS analysis, vendor sim, company lookup, rewrites, keyword injection | “Your resume actually gets parsed. You’re not dropped at the door.” |
| My resume is generic / looks like everyone else’s | Track-specific scoring, evidence-based recs, copy-paste fixes, Smart/Grit/Build | “You’re not another generic application. You’re prepared to the bar recruiters care about.” |
| I don’t know if I’m ready | Am I Ready?, job-fit, ready-check | “Apply when you’re ready—don’t waste your shot in the pile.” |
| Recruiters have no signal | Six-second profile, shareable score, outcome capture | “One link shows I’m serious and verified—not a fake or spray-and-pray.” |
| “Is this applicant even real?” | .edu-only signup; no Meridian profile without verified student email | “If they have Meridian, they’re 100% not fake—recruiters can trust that before they read a word.” |

**Narrative:** “You’re not getting ghosted because you’re not good enough. You’re getting ghosted because the system is broken—ATS, volume, and fake applications. Meridian gets you to the bar so you get a fair chance, and gives recruiters a reason to look.”

---

## What could make this “explode”

- **Student side:** Every message (paywall, onboarding, share cards, Voice) that says “get seen, get a fair chance, stop getting ghosted.” Outcome stories: “I stopped getting ghosted / started getting callbacks.”
- **Recruiter/employer side (later):** A clear signal: “Meridian” = **verified .edu = 100% not fake**, plus resume is parseable and prepared. Recruiters can trust the applicant is a real student before they read a line. Filter for that; save time. That’s the “make recruiters’ lives easier” and the path to B2B or employer partnerships.
- **Proof:** Outcome capture (interview/offer) + permission to use stories. “X% of active Meridian users got an interview” + “Students like you got PA interviews after Meridian.” Proof sells the fair-chance story.

---

## Recruiters need to know *before* they click

**The real bottleneck:** Recruiters don't click on most resumes. They're staring at a list of 500 applications. A link *on* the resume or *in* the profile is useless if they never open it. So "add your Meridian link to your application" only helps **after** the recruiter has already decided to look at that candidate.

**What actually solves ghosting:** Recruiters need to know the student is a Meridian student **before** they click—in the list view, the inbox, the candidate card, the ATS dashboard. The signal has to be visible where they're already scanning: a column, a filter, a tag, a badge on the row, or a separate pipeline that only has Meridian applicants.

So the product/partnership question is: **Where do recruiters look, and how do we get "Meridian" (or "Verified student") to show up there before the click?**

| Where recruiters look | How "Meridian" could show up *before* click | What it takes |
|-----------------------|---------------------------------------------|---------------|
| **Handshake** (campus) | Column "Meridian" Yes/No, or filter "Show only Meridian verified," or badge on candidate card | Handshake partnership / API: we (or the school) pass Meridian status when the student applies, or Handshake adds a verified-student field we can populate. |
| **ATS** (Workday, Greenhouse, etc.) | Custom field "Meridian verified," or tag, or separate "Verified" queue | ATS integration or employer-side config: application form includes "Meridian profile URL" or we partner so ATS gets a webhook/feed of Meridian user IDs; employer adds column/filter. |
| **Email inbox** (applications via email) | Subject line or sender: e.g. "[Meridian Verified] Application from Jordan Smith" | Apply-through-Meridian flow: student applies from Meridian, we send the email so we control subject/sender and recruiter sees "Meridian" before opening. |
| **Separate list / pipeline** | Recruiter doesn't look at the big pile; they look at "Meridian verified applicants" list we (or career center) send or host | We (or career center) send a weekly/monthly "Meridian verified" roster to employers. Or: employers come to a Meridian page to see "applicants for [role]" who are verified. We own the list; recruiter sees only Meridian students. |

**Implication:** The highest-leverage work is getting "Meridian" into the **list view** recruiters already use (Handshake, ATS), or creating a **separate first look** (verified roster, Meridian-sourced pipeline) so they don't have to dig through the big pile. Link-on-resume is still worth doing for *after* they click, but it doesn't solve "they never click."

---

## Ideas to solve the ghosting issue

Concrete levers, by who they help.

### 1. Make sure the student gets past the gate (ATS + quality)

| Idea | What it does | Status / note |
|------|----------------|---------------|
| **ATS-by-company before apply** | Student runs “Am I Ready?” + ATS vendor sim for that company before applying. Resume is optimized for *that* ATS so they don’t get filtered out. | We have company→ATS lookup, vendor sim, ready-check. Push “run this before you apply” in copy and UX. |
| **One-click “apply-ready” export** | Export a version of the resume tuned for a specific job (keywords, section order for that ATS). So they’re not dropped at parse. | Build on existing ATS rewrites + keyword inject; add “export for [Company]” flow. |
| **Resume health score + “don’t apply yet” nudge** | If score is below a threshold for their target track, nudge “fix these 3 things first so you’re not filtered out.” Reduces “apply into the void.” | Use existing scores + recommendations; add gate or strong nudge before “apply” when we have target. |

### 2. Recruiters see "Meridian" *before* they click (list-level signal)

*Recruiters don't click most resumes. The signal must appear in the list view, inbox, or a separate pipeline—not only on the resume. The table below emphasizes before-click (list-level) ideas first.*

| Idea | What it does | Status / note |
|------|----------------|---------------|
| **Handshake: Meridian column or filter** | In the application list, column "Meridian" Yes/No or filter "Verified only." Recruiter sees it before opening any resume. | **Before-click.** Handshake partnership or school passes Meridian status. |
| **ATS: Meridian verified field or tag** | Employer ATS shows tag/custom field on candidate row; recruiters sort/filter to Meridian first. | **Before-click.** App form captures Meridian ID; ATS displays it. |
| **Apply-through-Meridian** | Student applies from Meridian; we email employer subject "[Meridian Verified] Name – Role." Signal in inbox. | **Before-click.** We own apply flow for participating employers. See `MERIDIAN_APPLY_ENGINE.md` for product spec. |
| **Verified roster** | We or career center send employers list: "Meridian verified applicants." First look is this list, not the 500 pile. | **Before-click.** Roster export or feed; we are the shortlist. |
| **Meridian badge/link on every application** | Student adds “Meridian profile: [link]” or “Verified student · Meridian” on resume and in Handshake/LinkedIn. Recruiter sees “verified .edu” and can click to six-second profile. | We have six-second profile and share link. Make “add this to every application” the default CTA and teach it in onboarding. |
| **Recruiter-facing “Verified student” page** | Simple landing: “When you see Meridian on an application, they’re 100% verified .edu. No fakes, no bots. Here’s what the score means.” Optional: search or link validation (paste profile URL → see it’s real). | New page (e.g. meridian-careers.com/recruiters or /verified). Builds trust and gives recruiters a reason to prioritize. |
| **Employer/Handshake integration** | Employers get a filter or tag in Handshake: “Meridian verified” so they can sort or filter to verified students first. | Partnership / API. Long-term; depends on Handshake or employer ATS. |
| **Cohort or school “verified list”** | Career center or employer gets a list (or report): “These N students are Meridian-verified and job-ready.” Recruiters get a pre-vetted shortlist. | We have batch audit; add “verified roster” export or report for career centers / employers. |

### 3. Make “verified” and “ready” the default story

| Idea | What it does | Status / note |
|------|----------------|---------------|
| **“Stop getting ghosted” in every funnel** | Onboarding, paywall, share card, and email: “You’re not ghosted because you’re not good enough. You’re ghosted because the system is broken. Meridian gets you seen.” | Copy and placement; no new feature. |
| **Outcome proof everywhere** | “X% got an interview”; “4 PA interviews after Meridian”; “I stopped getting ghosted.” In-app, website, sales. | We have outcome capture; surface stats and stories wherever we ask for trust. |
| **School/career center as amplifier** | “Meridian for [School]” + “Our students are Meridian-verified.” Career center promotes; employers at that school learn to look for Meridian. | Positioning + school theme; career center pitch in CAREER_CENTER_SALES_STRATEGY. |

### 4. Structural / partnership ideas (longer-term)

| Idea | What it does | Note |
|------|----------------|-----|
| **Employer pledge** | “We look at every Meridian applicant” or “Meridian applicants get a human review.” Students get a list of pledge employers; employers get a pipeline of verified students. | Brand + partnerships; needs sales and legal. |
| **ATS / job-board “verified” channel** | Workday, Greenhouse, or a job board adds “Meridian verified” as a field or filter. Applications from Meridian users get a badge or go into a “verified” queue. | Product partnerships; high impact, high effort. |
| **University as validator** | School officially “blesses” Meridian (e.g. “UTampa Career Center recommends Meridian”). .edu + school endorsement = even stronger “real student” signal. | Sales and relationship; then we reflect it in product (e.g. “Meridian for Spartans · Recommended by UTampa”). |

---

## Connection to REALITY_CHECK and product bar

- **Reality Check:** The “credit score for talent” / recruiter adoption is still a long bet. But “fair chance” and “stop getting ghosted” don’t require recruiters to adopt us first. They work as a **student value prop** today (better resume → more likely to get seen and not ghosted). Recruiter side is the upside.
- **Product bar:** Paywall proof, outcome capture, shareable score, ATS by company, job-fit—all support “you get a fair chance.” Keep shipping those; frame them under this narrative so positioning is clear and consistent.

---

**Bottom line:** Ghosting is the pain. Fair chance is the promise. Meridian already builds toward it (ATS, evidence, track-specific, readiness). Double down on that story in copy, proof, and eventually recruiter-facing signal, and the “explode in popularity” and “make recruiters’ lives easier” outcomes become the same strategy.
