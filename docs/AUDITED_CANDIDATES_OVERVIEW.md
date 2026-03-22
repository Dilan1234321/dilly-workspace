# How the AI Sees Everyone It Has Audited (Training Data)

Overview of candidates in **`projects/meridian/prompts/training_data.json`** — the examples the LLM uses for few-shot and that grow when new resumes are audited with the LLM (append includes name, major, track, scores, recommendations).

**Note:** The system does **not** store **minors** as a separate field. Minors appear only inside `resume_excerpt` text. Where known from excerpts, they’re listed below under “Minors (from excerpts).”

---

## One row per person (canonical)

Each row is one audited person with their **canonical** name, major, and track. The training file has 51 example entries; the same person can appear multiple times (re-uploads or different parses). This table collapses to one row per person.

| Name | Major | Track |
|------|--------|--------|
| Aidan Rina | Finance | Business |
| Aldana Aniana Flores | Cybersecurity | Tech |
| Bridget E. Klaus | Biochemistry and Allied Health | Pre-Health |
| Cian Mclaughlin | Data Science | Tech |
| Cole Poirier | Data Science | Tech |
| Deng Aguer Bul | Data Science | Tech |
| Dilan Kochhar | Data Science | Tech |
| Ethan Capone | Unknown | Pre-Health |
| Gabriel Chiaravalloti | Computer Science | Tech |
| Gabriel Mfugale | Cybersecurity | Tech |
| Huntur Brockenbrough | International Business & Marketing | Business |
| Jaeden Pouchie | Computer Science | Tech |
| Kate M. Hicks | Business Management | Business |
| Kylee Ravenell | Marketing & Finance | Business |
| Luke DeLoe | Finance | Business |
| Matthew Rivers | Data Science | Tech |
| Michael Zeltser | Data Science | Tech |
| Nicholas Gardner | Marine Science | Science |
| Christopher M. Donnelly | Marine Science | Science |
| Shreya Mehta | Biology | Pre-Health |
| Sydney Farah | Advertising and Public Relations | Communications |
| Sydney Roux | Environmental Studies | Science |
| Thomas Rosenblum | Psychology | Pre-Health |
| Tyler J. Smith | History & International Studies | Pre-Law |
| Vir Shah | Biochemistry | Pre-Health |

### Parse artifacts (not real people)

- **Professional Summary | Communication | Communications** — Name parse error: the rule-based parser took the section header "PROFESSIONAL SUMMARY" as the candidate name. The resume is **Ethan Capone**'s (high school only; not yet updated for college). That one audit is stored under "Professional Summary" in the training file; Ethan himself also appears as Ethan Capone | Unknown | Pre-Health from another run.

### Why there were duplicate rows (Bridget, Huntur, Nicholas)

The table used to show **unique (name, major, track)** combinations, so the same person appeared twice when different audit runs produced different parses:

- **Bridget:** She is a **double major in Biochemistry and Allied Health**; entries are now corrected to that. Some runs had also returned **Unknown** (parser failed on the full degree string); those were fixed earlier.
- **Huntur:** One run had "International Business & Marketing", another "International Business" (same person; canonical = International Business & Marketing).
- **Nicholas:** One run had "Biology" (e.g. from high school context), another "Marine Science" (UT). Canonical = Marine Science (his UT major).

### The one person whose major Meridian parsed wrong: Sydney Farah

**Sydney Farah**’s resume states **Bachelor of Arts in Advertising and Public Relations** (Communications). Meridian had stored her as **Computer Science / Tech**. That was the one person in the table whose major was parsed wrong. All Sydney Farah entries are now corrected to **Advertising and Public Relations / Communications**. The model had been trained on the wrong label (Computer Science) for her; it now sees the correct major and track only.

---

## By track

- **Pre-Health:** Bridget E. Klaus (Biochemistry and Allied Health), Ethan Capone (Unknown), Shreya Mehta (Biology), Thomas Rosenblum (Psychology), Vir Shah (Biochemistry).
- **Pre-Law:** Tyler J. Smith (History & International Studies).
- **Tech:** Aldana Aniana Flores (Cybersecurity), Cian Mclaughlin, Cole Poirier, Deng Aguer Bul, Dilan Kochhar, Gabriel Chiaravalloti, Gabriel Mfugale, Jaeden Pouchie, Matthew Rivers, Michael Zeltser (Data Science).
- **Business:** Aidan Rina (Finance), Huntur Brockenbrough (International Business & Marketing), Kate M. Hicks (Business Management), Kylee Ravenell (Marketing & Finance), Luke DeLoe (Finance).
- **Communications:** Sydney Farah (Advertising and Public Relations).
- **Science:** Christopher M. Donnelly (Marine Science), Nicholas Gardner (Marine Science), Sydney Roux (Environmental Studies).

---

## Minors (from excerpts only — not a stored field)

Parsing does not extract or store minor; these are only visible in the resume text:

| Name | Minor(s) (from excerpt) |
|------|-------------------------|
| Deng Aguer Bul | Finance |
| Matthew Rivers | Mathematics & Computer Science |
| Tyler J. Smith | French, Asian Studies, Economics |
| Dilan Kochhar | Math & Computer Science |
| Aldana Aniana Flores | Management Information Systems and Leadership Studies (minor; major is Cybersecurity) |
| Kylee Ravenell | Law, Justice & Advocacy |
| Cian Mclaughlin | Computer Science |
| Sydney Roux | Leadership Studies & Sociology |
| Luke DeLoe | Accounting |
| Christopher M. Donnelly | Spanish |

---

## Data source and count

- **File:** `projects/meridian/prompts/training_data.json`
- **Total example entries:** 50 (many are duplicate uploads of the same person; the table above shows one canonical row per person).
- **Append behavior:** Each new audit with the LLM appends one example (resume excerpt, candidate_name, major, track, scores, evidence, recommendations) via `dilly_core/training_append.py`, up to `MERIDIAN_TRAINING_MAX_EXAMPLES` (default 500).

To add **minors** to what the AI “sees,” you’d need to add minor extraction in `resume_parser.py` and include it in the appended example and in this overview.
