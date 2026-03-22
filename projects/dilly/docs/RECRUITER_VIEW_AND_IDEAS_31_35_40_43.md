# Recruiter View & Ideas #31–35, #40–43

**Purpose:** Explain what these ideas are (no implementation here). Use this when prioritizing or scoping.

---

## Recruiter view

**From IDEAS.md (Ideas / On hold):**  
*Recruiter uploads a job description and gets "Meridian-fit" attributes; or anonymized Meridian scores for a candidate pool.*

**What it is:**
- A **recruiter-facing product**: recruiter pastes or uploads a JD; Meridian returns something like "Meridian-fit" attributes (e.g. which Smart/Grit/Build profile the role needs, or which resume signals matter).
- Alternatively: recruiter sees **anonymized Meridian scores** for a candidate pool (e.g. after students apply via Meridian or opt in). Lets them compare candidates by Meridian dimensions without seeing full resumes first.

**Why it matters:**  
Turns Meridian into a B2B tool (recruiters pay or employers partner). Different use case from the student app: demand is "score this JD" or "rank these candidates," not "improve my resume."

**Complexity:**  
Medium–high. Needs: (1) JD parsing and mapping to Meridian dimensions / criteria, (2) clear definition of "Meridian-fit" (rule-based and/or LLM), (3) recruiter auth and possibly a separate recruiter UI or API. Candidate-pool view needs student consent and data pipeline.

---

## #31–35 (Expansion / technical)

### 31. Rigor Index API

*Other companies send GPA + major; Meridian returns Meridian-Adjusted GPA (1.40x logic).*

- **What:** External API: input = GPA + major (and maybe school); output = single "Meridian-Adjusted GPA" or rigor score (e.g. 1.40x-style adjustment for major difficulty).
- **Use case:** Employers, ATS vendors, or partners use it to normalize GPA across majors/schools.
- **Complexity:** Medium. Requires exposing current rigor logic as a stable, versioned API and possibly rate limits / API keys.

### 32. Interactive radar

*Recruiter (or user) clicks a dimension spike → e.g. timeline of clinical hours or projects that drove that score.*

- **What:** From the radar chart, click a dimension (e.g. Build) and see **what drove that score**: e.g. timeline of experiences, projects, or evidence that the auditor used. "This spike is from these bullets / this section."
- **Use case:** Transparency for students ("why did Build go up?") and for recruiters ("why is this candidate’s Grit high?").
- **Complexity:** High. Backend must store or recompute evidence-per-dimension (or link scores to specific resume sections). Frontend needs interactive radar + detail view.

### 33. Self-correction logic

*Second AI agent audits the first agent's scores to ensure Ground Truth (e.g. 1.40x) was applied correctly.*

- **What:** A second model (or rule layer) reviews the first auditor’s output and checks calibration (e.g. GPA weighting, dimension definitions). Flags or corrects drift from "Ground Truth."
- **Use case:** Quality control and consistency as the main auditor or rubric changes.
- **Complexity:** High. Needs a clear spec for "Ground Truth," a second audit path, and comparison/override logic.

### 34. RAG / vector embeddings

*Cluster candidates; "This student's Build profile looks like a Junior Dev at NVIDIA." Predictive or similarity signals.*

- **What:** Embed resumes (or Meridian score + evidence) in a vector space; support similarity search and clustering. E.g. "students like you" or "your profile is similar to X outcome."
- **Use case:** Career suggestions, outcome prediction, or recruiter "find similar candidates."
- **Complexity:** High. Requires embedding pipeline, vector store, and careful privacy (anonymization, consent).

### 35. Predictive Success Score

*Track where gold-standard students end up in 2 years; train auditor on which Smart/Grit/Build combinations lead to best outcomes.*

- **What:** Outcome data (e.g. internship, first job, grad school) linked to Meridian scores; model predicts "success" or outcome likelihood from Smart/Grit/Build (and maybe track). Could influence scoring or surface "students with your profile often..."
- **Use case:** Differentiate Meridian as predictive, not just descriptive; guide students and recruiters.
- **Complexity:** Very high. Needs longitudinal data, consent, and a clear definition of "success" per track.

---

## #40–43 (Idea board: interactive AI & habit-forming)

### 40. Personalization

*Use name and goals; reference their resume ("Your Data Science Club presidency is your strongest Grit signal"); track-specific tone.*

- **What:** Every touchpoint (Voice, copy, emails) uses the user’s name, goals, and concrete resume/audit details. Tone and examples match their track (e.g. Pre-Health vs Tech).
- **Use case:** Feels like a coach who knows them; increases engagement and trust.
- **Complexity:** Medium. Much is already in place (Voice context, track); extend to more surfaces and stricter "never generic" rules.

### 41. Two-way dialogue

*Clarifying questions before advice; option menus ("I can (a) mock audit (b) cover opener (c) interview bullets"); confidence check.*

- **What:** Voice (or other flows) doesn’t just answer—it asks a short clarifying question or offers a menu of actions. E.g. "Do you want a quick check or a full mock audit?" or "Which matters most right now: interview prep or resume gaps?"
- **Use case:** Better answers with less back-and-forth; user feels heard.
- **Complexity:** Medium. Prompt and tool design; optionally structured replies (buttons/chips) in the UI.

### 42. Rituals

*"Daily tip" or "Today's focus"; weekly recap; helpful reminders ("48 hours until deadline").*

- **What:** Recurring, lightweight content: e.g. one tip per day, one "focus" when they open the app, weekly summary of progress, or deadline reminders. Not full nudges—small rituals that build habit.
- **Use case:** Reason to open the app daily or weekly; reinforces identity as "someone who works on their career."
- **Complexity:** Medium. Needs content pipeline (or LLM), scheduling, and in-app (or push) placement.

### 43. Habit hooks

*Variable rewards (job alerts, "new role at [Company]"), "what's new when I open?" feed, progress/streaks, identity ("I'm a Meridian user"), loss aversion (real deadlines, "you'd be a fit"), frictionless next step, AI as "person" they don't want to let down.*

- **What:** Product design that leans on habit psychology: variable rewards (e.g. new jobs, new insights), a feed of "what’s new," streaks and progress, identity framing, loss aversion (deadlines, FOMO), and one clear next step so the loop (open → do one thing → feel progress) is easy. Voice positioned as a "person" they care about not letting down.
- **Use case:** Retention and daily/monthly active use; turns Meridian into a habit, not a one-off tool.
- **Complexity:** High. Cuts across many features (notifications, feed, streaks, copy, Voice tone). Best tackled as a theme in product/design, then implemented in phases.

---

*Last updated: March 2026. See IDEAS.md for full roadmap.*
