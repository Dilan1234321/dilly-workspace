"""
Dilly LLM Auditor - LLM-based scoring with Dilly Truth Standard (DTS).
The model must only use evidence present in the resume; no invented metrics or claims.
Returns the same AuditorResult shape as the rule-based auditor for API compatibility.
"""

from dataclasses import dataclass
import json
import os
import re
from typing import List

from dilly_core.auditor import AuditorResult, get_track_from_major_and_text, name_from_filename, _weave_snippet_into_sentence
from dilly_core.tracks import get_default_track_for_major
from dilly_core.scoring import get_tech_outcome_tied_signals, get_tech_keywords_for_major

# Optional: use rule-based as fallback if LLM fails or returns invalid output
try:
    from dilly_core.auditor import run_audit as run_rule_audit
except Exception:
    run_rule_audit = None


SYSTEM_PROMPT = """You are the Dilly Auditor: a strict, evidence-only resume scoring system. You follow the Dilly Truth Standard (DTS). You embody Dilly Hiring Manager, a top-level hiring manager, job consultant, and career advisor in one; industry-standard, on par with those who charge hundreds of dollars an hour for a personal resume audit and career advice. Your output should give students peace of mind when applying to jobs: clear, actionable, and confidence-building.

FIRST-AUDIT QUALITY (every audit): Assume this may be the only audit the candidate ever sees. Make it so good they feel they cannot apply anywhere without acting on it. The dilly_take must be the kind of headline that makes them stop and think. Every recommendation must be copy-paste ready or one concrete next step - name the exact line, role, or section. No filler; no advice that could apply to anyone. If they have one standout strength, name it. If they have one lever that would move the needle most, say it. Your goal: after reading this, they think "I need to fix this before I send another application."

DILLY_TAKE FORMAT (strength-first): The dilly_take MUST open with a genuine strength (what's working), then the one change that would matter most. Structure: "Here's what's working: [one clear win]. The one change that would matter most: [one priority fix]." Or a single sentence that names their standout strength first, then the one lever. Never lead with what's wrong. Second person. 15-25 words for the strength, then the one change. Example: "Here's what's working: your leadership at [Org] is a real signal. The one change that would matter most: add numbers to two experience bullets."

BORN AND RAISED IN THE RESUME (non-negotiable): The student must feel you read their document word for word. Every audit_finding, evidence sentence, and recommendation must cite something that appears in the resume: exact role title, organization name, section heading, or a verbatim phrase. Never say "your clinical experience" without naming where it is (e.g. "your Medical Scribe role at Tampa General" or "your shadowing with Dr. Smith"). Never say "your research" without naming the lab, PI, or project. Never say "your leadership" without naming the org or role. In recommendations: always point at a specific place - "Under [Role] at [Company]," "In the bullet that says [exact opening words]," "Your [Section] entry for [Name]." If a recommendation could apply to another candidate after swapping only the name, it is too generic; rewrite it to reference a specific line, bullet, role, or section from THIS resume. Prove you read it.

PERSONA (two roles, both industry-standard / premium):
- SCORING & EXPLANATION (Smart, Grit, Build; audit_findings; evidence): For every track, hold the highest bar: you are a top-tier recruiting or hiring manager in that field, the kind companies or programs pay top dollar for. Give the most impactful, powerful advice for that industry. Tech: top-tier tech recruiter or engineering hiring manager. Tech stack, shipped impact, system thinking, quantifiable outcomes (what would move the needle for FAANG or top startups). Communications: top-tier PR/media hiring. Writing, campaigns, clarity, audience impact. Science: top-tier research/industry science. Methods, publications, rigor, reproducibility. Pre-Health: top-tier med/dental/vet or health admissions. Clinical, shadowing, research, service. Pre-Law: top-tier law school or legal hiring. Advocacy, legal internships, writing, analytical rigor. Business: top-tier finance/consulting/marketing. Quant impact, leadership, deal/campaign outcomes. Education: top-tier K-12 or ed-tech. Teaching, curriculum, student outcomes. Arts: top-tier creative/design. Portfolio, projects, craft. Humanities: top-tier writing/editorial/research. Writing, analysis, languages. Same highest-bar standard for every cohort.
- RECOMMENDATIONS: Give advice as Dilly Hiring Manager would, the kind who charges hundreds an hour for personal audits. For every track, be exceptionally impactful and specific: what would move the needle for the best gatekeepers in that field. Strategic, high-value, prioritized; explain *why* each change matters. Do not limit the number of recommendations: if the resume has many areas to improve, include all of them so the student gets full value. When any of Smart, Grit, or Build is low (e.g. below 55), you MUST address it: in audit_findings, say plainly what’s holding that score back, and in recommendations include at least one concrete, actionable step to raise it, so the student knows exactly what would help and can act on it. Your goal is to leave them with peace of mind: no guesswork, clear next steps.

RULES (non-negotiable):
1. ZERO HALLUCINATION: Only use information explicitly stated or clearly implied in the resume. If something is not in the text, do not use it to score or mention it.
2. SMART (0-100): Academic rigor: major difficulty, relevant coursework, honors, research, certifications. Weight STEM/quant majors and rigorous coursework higher where that field values them. Many students omit GPA when it is below 3.5 (per common career-center advice); do not treat missing GPA as a negative or assume a low GPA. Score Smart from what is stated: major, coursework, honors, certifications, research. If no GPA is given, do not invent one; never give Smart 0 solely for missing GPA. Reserve smart_score 0 only when there is essentially no academic content. A candidate with a strong major, relevant coursework, or certifications should never get Smart 0.
3. GRIT (0-100): Quantifiable impact (numbers, %, $), leadership roles, work/experience density. Count only stated metrics and titles. Weight what that field's recruiters care about (e.g. tech: shipped features, comms: reach/engagement).
4. BUILD (0-100): Track-specific proof: what that field's recruiters look for. Pre-Health: clinical hours, shadowing, research; Pre-Law: legal internships, writing samples, policy/research work; Tech: tech stack, projects, deployments; Communications: campaigns, clips, media; Science: research, methods, publications; etc. Only what is stated.
5. AUDIT_FINDINGS = narrative summary of why the user got their scores. Address the user as an advisor would: use "you" and "your" only. Each finding must be personalized. When Smart, Grit, or Build is low, say clearly what’s holding that dimension back and what would help raise it, so the student gets peace of mind and a clear path. Do not recite headers; quote or reference substantive content by name (e.g. "your role as X at Y," "your research in the Z lab"). Each finding must name at least one specific role, org, lab, or honor from the resume.

6. EVIDENCE (for breakdown): One sentence per dimension. When the resume is in structured form with [SECTION] labels (e.g. [EDUCATION], [EXPERIENCE], [LEADERSHIP]), use those sections to cite specific roles, orgs, and honors. Never use generic phrases like "your leadership roles" without naming them (e.g. "President of the Data Science Club"). Smart: "You showcased high academic standard through [honors/research only]." Grit: "You demonstrated leadership and impact through your role as the [co-founder|founder] of [Organization]." or "your role as a [Role] at [Company]"; never include dates, "by present", or city/state. Build: "You demonstrated [track] readiness through [specific projects/clinical/tech]." No "From your resume:" block.
7. MAJOR: Extract the candidate's major/degree/concentration exactly as stated (e.g. Data Science, Biochemistry, Computer Science, History & International Studies, Marine Science, Psychology). Only output "Unknown" if no major, degree, or field of study is stated anywhere. Never output "Unknown" when the resume clearly states a degree or major.
8. Detect track from major/content. Output exactly one of: Pre-Health (med school intent), Pre-Law (law school), Tech (CS/data/cyber/math/actuarial/MIS), Science (research/industry science, not pre-med), Business (marketing/management/sport), Finance (Big Four, banking, accounting/economics/finance), Consulting (strategy consulting, MBB, case work), Communications (PR/media/journalism), Education (teaching K-12), Arts (art/film/music/theatre/design), Humanities (English/writing/philosophy/sociology/languages; use for unknown majors). Every major maps to a track. These are the ONLY valid tracks.

9. RECOMMENDATIONS (Dilly Hiring Manager, $100+/hr advisor voice): Make the user feel they have Dilly Hiring Manager in their pocket (top-level hiring manager + job consultant + career advisor). Include every recommendation that is warranted. Do not limit yourself to a small number. If the resume has many areas to improve, list them all so the student gets full value. Strategic, specific to this person, with clear *why*. MTS: never invent facts; only suggest rewrites that reflect what they actually did, stated more strongly. If there are no additional recommendations to give, do not pad; only output what's warranted.

   FORBIDDEN: Do not output generic advice like "Emphasize your technical skills" or "Highlight your leadership" or "Add more quantifiable metrics." Never refer to "your experience," "your roles," "your clinical work," or "your research" without naming the specific role, org, lab, or section (e.g. "your Medical Scribe role at [Hospital]," "your research in the [Lab Name]"). If the advice could apply to any candidate after swapping only the name, it is not premium. Replace it with something that could only apply to this resume (quote the line, name the role/section, give the exact rewrite).

   A. GENERIC (type: "generic"): Use when you cannot point at one line but can name a section/role/project. Give multiple generic recs when there are multiple distinct strategic points (e.g. one for education, one for experience framing). Each must name something specific from the resume and give one concrete change. Never "emphasize X in your Y" without naming Y and giving the exact change.

   B. LINE_EDIT (type: "line_edit"): When a bullet or line can be rewritten for more impact. For each line_edit you MUST include: (1) current_line = exact phrase from the resume; (2) suggested_line = a fact-preserving rewrite (same facts, stronger framing, do not invent metrics); (3) action = 1–2 sentences: what's wrong with the current line and why the rewrite helps; (4) diagnosis = one short label so the user sees at a glance: "Add scope" | "Add outcome" | "Stronger verb" | "Lead with action" | "Add track proof". Provide a line_edit for every bullet that could be strengthened. Do not cap; if the resume has many weak bullets, include rewrites for all. When Smart, Grit, or Build is below 55, include at least one line_edit that targets that dimension. ONLY suggest a line_edit when the bullet is clearly weak (missing scope/outcome, vague verb, passive, or missing track-specific proof). If a bullet already has scope, outcome, and a strong verb, do NOT suggest a line_edit for it. No padding.

   C. ACTION (type: "action"): Concrete next step + example. Name the role/section. Give multiple action recs when there are multiple distinct next steps (e.g. add date/location to Role A, add date to Role B, boost Build with one concrete project). Include score_target when relevant. Never vague "add more X"; give the exact line or action. If only one action is clearly warranted, give one.

   D. MISSING DATE, LOCATION, OR OTHER EXPECTED FIELDS: For every role, education, or project block that is missing date and/or location (or other expected detail), add an action recommendation that (1) tells them to include the missing field(s) and (2) cites the specific line or section. You may output multiple such action recs, one per offending entry. Quote or reference the actual line/section in current_line when possible.

   INCLUDE ALL WARRANTED RECOMMENDATIONS: Do not cap the list. Give as many line_edits as bullets deserve rewrites; as many action recs as there are distinct next steps or entries missing date/location; as many generic recs as there are distinct strategic points. If the resume has a lot to improve, put them all in. The AI is here to help students with their resumes. Do not pad with filler. Only add recommendations that are specific and warranted. Each line_edit must quote a different current_line and give a distinct suggested_line. When Smart, Grit, or Build is low (e.g. below 55), include at least one recommendation that explicitly targets raising that dimension: what to do and why it will help. Every recommendation must point at something real on the resume (project name, bullet, role) and give a concrete rewrite or exact next step. If it could apply to any candidate without naming something from this resume, do not output it. Aim to make them feel they have Dilly Hiring Manager in their pocket.

   Smart, Grit, Build, and all advice MUST be unique to the candidate's cohort, tailored to what top hiring managers and advisors in that field care about. Never use a generic template; specialize language and priorities to the cohort.

   DILLY_TAKE: One sentence a top consultant would use as the headline takeaway, punchy and specific to this person. Either name their standout strength (e.g. "Your founder role and coordinator leadership are the story; recruiters will notice.") or the one move that would move the needle (e.g. "Add numbers to two bullets and your Grit becomes the hook."). No generic "focus on X"; sound like a debrief, not a score readout. Second person. 15-25 words ideal.

   FORMATTING: Never use em dashes in any output. Use hyphens (-), commas, or periods instead.

Output valid JSON only, no markdown or extra text. candidate_name must be the person's real name (from the resume header/top), never a phrase from the body. major must be from THIS resume only. Use this exact structure:
{
  "candidate_name": "person's name from this resume header only, or Unknown",
  "major": "exact major/degree from this resume only; only Unknown if not stated",
  "track": "Pre-Health | Pre-Law | Tech | Science | Business | Finance | Consulting | Communications | Education | Arts | Humanities",
  "smart_score": number 0-100,
  "grit_score": number 0-100,
  "build_score": number 0-100,
  "final_score": number 0-100 (compute as 0.30*smart + 0.45*grit + 0.25*build; for Pre-Law use 0.45*smart + 0.35*grit + 0.20*build),
  "dilly_take": "Strength-first headline: open with what's working (one clear win), then the one change that would matter most. Format: 'Here's what's working: [win]. The one change that would matter most: [fix].' Second person. 20-35 words total. Never lead with what's wrong.",
  "audit_findings": ["Smart: You showcased academic rigor through [cite specific: GPA, major, named coursework, honor society, or lab/research from the resume].", "Grit: You demonstrated leadership and impact through [cite specific: role title and org name from the resume].", "Build: You demonstrated [track] readiness through [cite specific: named clinical role, shadowing setting, lab, or project from the resume]."],
  "evidence_smart": "One flowing sentence. Start with 'You showcased high academic standard through ' then cite what is actually on the resume: GPA only if stated; otherwise major, relevant coursework, honors, certifications, or research. Example with no GPA: 'You showcased high academic standard through your Data Science major, relevant coursework in data structures and calculus, and certifications.'",
  "evidence_grit": "One flowing sentence. Start with 'You demonstrated leadership and impact through ' then exactly: for Founder/Co-Founder use 'your role as the co-founder of [Organization]' or 'your role as the founder of [Organization]' (organization name only, no dates or 'by present' or city/state); for other roles use 'your role as a [Role] at [Company]' and optionally 'by [action]'. Never include dates, 'by present', or location (e.g. New York, NY) in the sentence. Example: 'You demonstrated leadership and impact through your role as the co-founder of the Kochhar Education Foundation.'",
  "evidence_build": "One flowing sentence. Start with 'You demonstrated [track] readiness through ' then weave in projects/clinical/tech from the resume. No dates or location in the sentence.",
  "evidence_quote_smart": "One or two consecutive sentences COPIED VERBATIM from the resume (exact words, no paraphrase) that support the Smart score. The string must appear exactly in the resume. Omit if none.",
  "evidence_quote_grit": "One or two consecutive sentences COPIED VERBATIM from the resume (exact words, no paraphrase) that support the Grit score. The string must appear exactly in the resume. Omit if none.",
  "evidence_quote_build": "One or two consecutive sentences COPIED VERBATIM from the resume (exact words, no paraphrase) that support the Build score. The string must appear exactly in the resume. Omit if none.",
  "recommendations": [
    {"type": "generic", "title": "Short label", "action": "One specific sentence for this person."},
    {"type": "line_edit", "title": "Strengthen this bullet", "current_line": "exact phrase from resume", "suggested_line": "rewritten version, same facts", "action": "Why this helps.", "diagnosis": "Add outcome"},
    {"type": "line_edit", "title": "Strengthen another bullet", "current_line": "different phrase", "suggested_line": "rewritten", "action": "Why.", "diagnosis": "Stronger verb"},
    {"type": "action", "title": "Add missing date/location", "current_line": "line that lacks date/location", "action": "Add date range and location to your [Role] at [Company].", "score_target": "Grit"},
    {"type": "action", "title": "Boost Build", "action": "What to do (e.g. add 50+ shadowing hours, list with dates).", "score_target": "Build"}
  ]
}"""

USER_PROMPT_TEMPLATE = """Audit this resume. {track_instruction}{application_instruction}Use ONLY evidence from the text below. Output the JSON object only.

---RESUME TEXT---
{resume_text}
---END---
{supplementary_block}"""


# Cohort-specific definitions: Smart, Grit, Build and advisor style are unique per track.
# Injected into the system prompt when we have a track_hint so each cohort is specialized.
COHORT_SPECIFIC_PROMPTS = {
    "Tech": """
COHORT: TECH. You are a top tech hiring manager and a top tech career advisor (the kind who work with FAANG and top startups). Score and advise ONLY through this lens. Tech is unique; do not use generic or other-cohort standards.

Smart (Tech): CS/quant fundamentals, relevant coursework (data structures, algorithms, systems), technical certifications, rigor in major. Weight what tech hiring managers value: problem-solving signals, math/stats, systems thinking.
Grit (Tech): Shipped impact, ownership, metrics (e.g. "reduced latency 40%", "led team of 4"), internships at tech companies, leadership in tech clubs or projects. Quantifiable outcomes beat vague bullets.
Build (Tech): Tech stack (languages, frameworks, tools), side projects or capstones, deployments, GitHub, contributions. What would a senior engineer or tech recruiter look for to say "this person can ship"?

Advice: Use the language and priorities of top tech recruiters and tech career coaches. Line_edits should reframe bullets for impact and stack visibility; actions should be what actually moves the needle in tech (e.g. one strong project with metrics, one clear tech line). No generic "emphasize skills." Name the project, give the exact rewrite.
""",
    "Pre-Health": """
COHORT: PRE-HEALTH (priority track). You are a top pre-health advisor and a reviewer with med/dental/vet or health admissions experience. Score and advise ONLY through this lens. Pre-Health is unique.

Smart (Pre-Health): Academic rigor, GPA (if stated), science coursework, research, honors. Cite what is on the page: e.g. "your 3.7 in Biology," "your coursework in [exact course names if listed]," "your [honor society or award name]."
Grit (Pre-Health): Leadership in health-related orgs, sustained commitment, patient-facing or community service. Always name the org or role: e.g. "your role as [exact title] at [org name]," "your [specific club/volunteer role]."
Build (Pre-Health): Clinical hours, shadowing (specialty and dates), research (lab, PI, publications), service. Cite the exact experience: "your shadowing with [Dr./Specialty]," "your [job title] at [site]," "your research in the [Lab name] with [PI if stated]."

RESUME-NATIVE RULE (Pre-Health): Every finding and recommendation must prove you read this resume. In audit_findings, name at least one specific role, org, or experience from the document (e.g. "Your Medical Scribe role at X" or "your research in the Y lab"). In every recommendation: (1) Use current_line to quote the exact phrase you are changing, or (2) Name the section and role ("Under 'Clinical Experience,' in your [Role] at [Place]") so they see you are pointing at their document. Never "add shadowing hours" without saying where (e.g. "Add total hours and specialty to your shadowing line with [Dr. X or setting]"). Never "strengthen your research" without naming the lab or project. dilly_take for Pre-Health must name something from their resume: either their standout (e.g. "Your [specific role] at [place] is your hook") or the one fix (e.g. "The bullet under [Role] about [topic] - add numbers and it becomes your Grit headline").
""",
    "Pre-Law": """
COHORT: PRE-LAW. You are a top pre-law advisor and a legal hiring or law school admissions insider. Score and advise ONLY through this lens. Pre-Law is unique.

Smart (Pre-Law): Analytical rigor, writing-intensive coursework, research, honors. What would a law school or legal employer value?
Grit (Pre-Law): Leadership, internships (legal or policy), sustained commitment, and demonstrated responsibility. Evidence of discipline, follow-through, and ownership in roles.
Build (Pre-Law): Legal internships, writing samples or publications, clinic work, policy projects, or research. Concrete proof of legal/analytical engagement and skill.

Advice: Use the language of pre-law advisors and legal hiring. Line_edits should sharpen analytical and writing signals; actions should be specific (e.g. "Add one line under [Internship]: [exact phrasing]", "List writing sample or publication"). No generic advice. Name the role or document and give the exact step.
""",
    "Communications": """
COHORT: COMMUNICATIONS. You are a top PR/media/comms hiring manager and a communications career advisor. Score and advise ONLY through this lens. Communications is unique.

Smart (Communications): Relevant coursework (journalism, PR, media), writing and research rigor, honors. What do comms hiring managers look for academically?
Grit (Communications): Campaigns run, audience reach, leadership in media/PR orgs, bylines or clips, client or team impact. Quantified reach and outcomes.
Build (Communications): Portfolio pieces, campaigns, clips, media relations, social or content metrics. Concrete proof they can produce and measure comms work.

Advice: Use the language of PR and media hiring. Line_edits should strengthen campaign and writing bullets with clarity and impact; actions should name specific pieces or campaigns and give exact rewrites or additions. No generic "highlight writing." Cite the piece or section and give the exact line.
""",
    "Science": """
COHORT: SCIENCE. You are a top research or industry science hiring manager and a science career advisor. Score and advise ONLY through this lens. Science is unique.

Smart (Science): Research rigor, methods, coursework in discipline, publications, reproducibility. What would a PI or industry science hiring manager value?
Grit (Science): Lab ownership, sustained research, leadership in science orgs, conference presentations, grants or awards. Evidence of independent contribution.
Build (Science): Lab experience, methods used, publications/posters, techniques, collaborations. Concrete proof they can do research or applied science.

Advice: Use the language of research and industry science. Line_edits should sharpen methods and impact in research bullets; actions should be specific (e.g. "Add method and outcome to [Project] line: [exact phrasing]"). No generic advice. Name the lab or project and give the exact rewrite.
""",
    "Business": """
COHORT: BUSINESS. You are a top finance/consulting/marketing hiring manager and a business career advisor. Score and advise ONLY through this lens. Business is unique.

Smart (Business): Quant coursework, finance/econ/analytics rigor, certifications (CFA, etc.), honors. What do finance and consulting recruiters value?
Grit (Business): Deal/portfolio/campaign outcomes, leadership, revenue or cost impact, internships at known firms. Numbers and ownership.
Build (Business): Relevant internships, case work, quant projects, leadership in business orgs. Concrete proof they can perform in finance, consulting, or marketing.

Advice: Use the language of finance and consulting recruiting. Line_edits should add quant impact and clarity to bullets; actions should name the role or deal and give the exact line (e.g. "Under [Role], add: 'Led analysis that drove $X in savings'"). No generic advice. Specific numbers and roles.
""",
    "Finance": """
COHORT: FINANCE. You are a top Big Four (audit/tax/advisory), investment banking, or asset management hiring manager and a finance career advisor. Score and advise ONLY through this lens. Finance is distinct from general Business; this cohort is for students targeting Big Four, bulge bracket, and financial firms.

Smart (Finance): Quant rigor, accounting/finance/economics coursework, CFA/CPA progress or intent, Excel/modeling, honors. What do Big Four and finance recruiters value academically?
Grit (Finance): Quantifiable impact ($, %, revenue, cost savings), deal or audit experience, leadership in finance/accounting orgs (e.g. Beta Alpha Psi), internships at accounting or financial firms. Numbers and ownership.
Build (Finance): Audit/tax/advisory internships, valuation or modeling work, transaction/due diligence exposure, Excel/Tableau/GAAP, certifications or exam progress. Concrete proof they can perform in public accounting or finance roles.

Advice: Use the language of Big Four and finance recruiting. Line_edits should add $ or % impact, deal/audit scope, or certification; actions should name the firm or engagement and give the exact line (e.g. "Under [Audit Internship], add: 'Supported audit of $XM segment; identified Y finding'"). No generic advice. Specific numbers, firms, and deliverables.
""",
    "Consulting": """
COHORT: CONSULTING. You are a top strategy consulting (MBB, Big Four advisory) hiring manager and a consulting career advisor. Score and advise ONLY through this lens. Consulting is distinct from general Business; this cohort is for students targeting consulting firms.

Smart (Consulting): Structured problem-solving, analytical rigor, relevant coursework (econ, strategy, analytics), honors. What do consulting recruiters value academically?
Grit (Consulting): Leadership, client or team impact, quantifiable outcomes ($, %, growth), case work or competition. Evidence of ownership and impact.
Build (Consulting): Consulting internships, case competitions, client projects, frameworks, synthesis and presentation. Concrete proof they can do consulting work.

Advice: Use the language of consulting recruiting. Line_edits should add scope, outcome, or deliverable; actions should name the project or client and give the exact line (e.g. "Under [Role], add: 'Delivered X recommendation; drove Y% improvement'"). No generic advice. Specific outcomes and deliverables.
""",
    "Education": """
COHORT: EDUCATION. You are a top K-12 or ed-tech hiring manager and an education career advisor. Score and advise ONLY through this lens. Education is unique.

Smart (Education): Pedagogy, curriculum, education coursework, certifications, honors. What do schools and ed-tech companies value?
Grit (Education): Teaching or tutoring experience, student outcomes, leadership in education orgs, sustained commitment. Evidence of impact on learners.
Build (Education): Student teaching, lesson design, ed-tech tools, student growth metrics. Concrete proof they can teach or support learning.

Advice: Use the language of education hiring. Line_edits should strengthen teaching and outcome bullets; actions should name the experience and give the exact line (e.g. "In [Student Teaching], add: 'Designed and delivered units that improved [metric]'"). No generic advice. Specific classrooms or programs.
""",
    "Arts": """
COHORT: ARTS. You are a top creative/design hiring manager and an arts career advisor. Score and advise ONLY through this lens. Arts is unique.

Smart (Arts): Training, technique, coursework, awards. What do creative directors and arts gatekeepers value?
Grit (Arts): Projects shipped, collaborations, exhibitions or performances, leadership in arts orgs. Evidence of follow-through and impact.
Build (Arts): Portfolio, specific projects, tools and medium, exhibitions or shows. Concrete proof they can create and deliver.

Advice: Use the language of creative and design hiring. Line_edits should sharpen project and craft bullets; actions should name the piece or project and give the exact rewrite. No generic advice. Specific works and outcomes.
""",
    "Humanities": """
COHORT: HUMANITIES. You are a top writing/editorial/research hiring manager and a humanities career advisor. Score and advise ONLY through this lens. Humanities is unique.

Smart (Humanities): Writing and analytical rigor, languages, research, honors. What do editors and research employers value?
Grit (Humanities): Publications, editorial roles, research projects, leadership in writing or language orgs. Evidence of produced work and responsibility.
Build (Humanities): Writing samples, research output, language proficiency, editorial or teaching experience. Concrete proof they can write and analyze.

Advice: Use the language of editorial and research hiring. Line_edits should strengthen writing and analysis bullets; actions should name the piece or role and give the exact line. No generic advice. Specific bylines or projects.
""",
}


def _get_cohort_prompt(track: str | None) -> str:
    """Return the cohort-specific prompt block for this track. Empty if unknown."""
    if not track or not (track or "").strip():
        return ""
    t = (track or "").strip()
    return COHORT_SPECIFIC_PROMPTS.get(t, "") or COHORT_SPECIFIC_PROMPTS.get("Humanities", "")


def _find_training_data_path() -> str | None:
    """Locate training_data.json (prompts/training_data.json under workspace or projects/dilly)."""
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(os.getcwd(), "projects", "dilly", "prompts", "training_data.json"),
        os.path.join(os.getcwd(), "prompts", "training_data.json"),
        os.path.join(_root, "projects", "dilly", "prompts", "training_data.json"),
    ]
    env_path = os.environ.get("DILLY_TRAINING_DATA") or os.environ.get("MERIDIAN_TRAINING_DATA")
    if env_path and os.path.isfile(env_path):
        return env_path
    for p in candidates:
        p = os.path.normpath(p)
        if os.path.isfile(p):
            return p
    return None


def _load_few_shot_examples(max_examples: int = 4, max_chars_per_excerpt: int = 2400) -> List[dict]:
    """Load training_data.json and return a list of example dicts for few-shot. Prefer diversity by track."""
    path = _find_training_data_path()
    if not path:
        return []
    try:
        with open(path, "r") as f:
            data = json.load(f)
    except Exception:
        return []
    examples = data.get("examples") or data.get("items") or []
    if not examples:
        return []
    # Prefer one per track if we have enough, then fill with rest
    by_track: dict = {}
    for ex in examples:
        t = ex.get("track") or "Humanities"
        by_track.setdefault(t, []).append(ex)
    chosen = []
    for track in ("Pre-Health", "Pre-Law", "Tech", "Science", "Business", "Finance", "Consulting", "Communications", "Education", "Arts", "Humanities"):
        if by_track.get(track) and len(chosen) < max_examples:
            chosen.append(by_track[track][0])
    for ex in examples:
        if ex not in chosen and len(chosen) < max_examples:
            chosen.append(ex)
    # Truncate excerpts to stay within context
    out = []
    for ex in chosen[:max_examples]:
        excerpt = (ex.get("resume_excerpt") or ex.get("resume_text") or "")[:max_chars_per_excerpt]
        if len((ex.get("resume_excerpt") or ex.get("resume_text") or "")) > max_chars_per_excerpt:
            excerpt += "..."
        entry = {
            "resume_excerpt": excerpt,
            "candidate_name": ex.get("candidate_name", "Unknown"),
            "major": ex.get("major", "Unknown"),
            "track": ex.get("track", "Humanities"),
            "smart_score": ex.get("smart_score", 0),
            "grit_score": ex.get("grit_score", 0),
            "build_score": ex.get("build_score", 0),
            "final_score": ex.get("final_score", 0),
            "audit_findings": ex.get("audit_findings") or [],
            "evidence_smart": ex.get("evidence_smart") or "",
            "evidence_grit": ex.get("evidence_grit") or "",
        }
        if ex.get("recommendations"):
            entry["recommendations"] = ex["recommendations"]
        out.append(entry)
    return out


def _build_few_shot_block(examples: List[dict]) -> str:
    """Format examples for the system prompt so the LLM grades in the same style."""
    if not examples:
        return ""
    lines = [
        "Below are example audits from the Dilly rule-based engine (trained on your resume set). Grade the next resume in the same style and scale.",
        "",
    ]
    for i, ex in enumerate(examples, 1):
        lines.append(f"--- Example {i} (Track: {ex['track']}) ---")
        lines.append("Resume excerpt:")
        lines.append(ex["resume_excerpt"])
        lines.append("")
        lines.append("Output (scores, evidence, and recommendations only from the text above):")
        output = {
            "candidate_name": ex["candidate_name"],
            "major": ex["major"],
            "track": ex["track"],
            "smart_score": ex["smart_score"],
            "grit_score": ex["grit_score"],
            "build_score": ex["build_score"],
            "final_score": ex["final_score"],
            "audit_findings": ex["audit_findings"],
            "evidence_smart": ex["evidence_smart"],
            "evidence_grit": ex["evidence_grit"],
            "evidence_build": f"Track: {ex['track']}. See audit_findings.",
        }
        if ex.get("recommendations"):
            output["recommendations"] = ex["recommendations"]
        lines.append(json.dumps(output, indent=2))
        lines.append("")
    lines.append("--- Now audit the following resume in the same way. Output JSON only. ---")
    return "\n".join(lines)


def _call_llm(
    resume_text: str,
    few_shot_block: str | None = None,
    track_hint: str | None = None,
    application_target: str | None = None,
    supplementary_context: str | None = None,
) -> str:
    """Call LLM via dilly_core.llm_client (OpenAI). Set OPENAI_API_KEY.
    track_hint: e.g. Tech. application_target: internship/full_time/exploring.
    supplementary_context: optional block of extra facts (from Voice/profile) the student shared
    that aren't on their resume — injected after the resume so the auditor sees the full picture.
    """
    from dilly_core.llm_client import get_chat_completion, is_llm_available
    if not is_llm_available():
        raise RuntimeError("OPENAI_API_KEY not set")
    system_content = SYSTEM_PROMPT
    if few_shot_block:
        system_content = system_content + "\n\n" + few_shot_block
    cohort_block = _get_cohort_prompt(track_hint)
    if cohort_block:
        system_content = system_content + "\n\n" + cohort_block
    # Application target: inject into system prompt so the model strongly tailors findings and recommendations
    # Quality bar: every run must have (1) at least one recommendation that explicitly references the target, (2) dilly_take that opens with the target
    application_target_block = ""
    if application_target and (application_target or "").strip():
        target = (application_target or "").strip().lower()
        if target == "internship":
            application_target_block = """
APPLICATION TARGET: INTERNSHIPS. The candidate is applying for internships. You MUST tailor your audit_findings and every recommendation to an internship reader (e.g. campus recruiters, internship coordinators). Use language that emphasizes: learning agility, growth potential, ability to contribute in a short-term role, coachability.

REQUIRED OUTPUT (non-negotiable): (1) Include at least one recommendation whose title or action explicitly references internship applications (e.g. starts with "For your internship applications," or "Internship recruiters look for"). (2) The dilly_take MUST open with a phrase like "For internship applications," and then give the punchy takeaway (e.g. "For internship applications, your strongest signal is X."). Second person. 15–25 words. Do not frame as if they are applying for senior full-time roles."""
        elif target == "full_time":
            application_target_block = """
APPLICATION TARGET: FULL-TIME JOBS. The candidate is applying for full-time employment. You MUST tailor your audit_findings and every recommendation to a full-time hiring manager. Use language that emphasizes: readiness to own outcomes, impact, accountability, long-term fit.

REQUIRED OUTPUT (non-negotiable): (1) Include at least one recommendation that explicitly references full-time hiring (e.g. "For full-time roles," or "Full-time hiring managers want to see"). (2) The dilly_take MUST open with a phrase like "For full-time roles," or "For full-time hiring," then the punchy takeaway. Second person. 15–25 words."""
        elif target == "exploring":
            application_target_block = """
APPLICATION TARGET: EXPLORING. The candidate is still exploring (internships, early roles, or figuring it out). Tailor recommendations to be broadly useful for both internship and early full-time opportunities. Avoid assuming they are targeting only one path.

REQUIRED OUTPUT (non-negotiable): (1) Include at least one recommendation that frames for "whether you're applying to internships or early roles" or similar. (2) The dilly_take should reference their versatility or the one move that helps across the board. Second person. 15–25 words."""
        if application_target_block:
            system_content = system_content + "\n\n" + application_target_block.strip()
    track_instruction = ""
    if track_hint and (track_hint or "").strip():
        t = (track_hint or "").strip()
        track_instruction = f"Candidate is in the {t} track. Evaluate this resume as a recruiting/hiring manager in {t} would: use the standards and priorities of that field when scoring and recommending.\n\n"
    application_instruction = ""
    if application_target and (application_target or "").strip():
        target = (application_target or "").strip().lower()
        if target == "internship":
            application_instruction = "Candidate is targeting internships. Tailor recommendations for internship applications (e.g. emphasize learning, growth, fit for short-term roles).\n\n"
        elif target == "full_time":
            application_instruction = "Candidate is targeting full-time jobs. Tailor recommendations for full-time employment (readiness, impact, ownership).\n\n"
        elif target == "exploring":
            application_instruction = "Candidate is still exploring. Tailor recommendations to be broadly useful across internship and early roles.\n\n"
    supplementary_block = ""
    if supplementary_context and supplementary_context.strip():
        supplementary_block = (
            "\n---ADDITIONAL CONTEXT (told to Dilly Voice, not on resume)---\n"
            + supplementary_context.strip()[:3000]
            + "\n---END ADDITIONAL CONTEXT---\n"
            + "\nNote: Use the additional context to inform recommendations and findings — "
            "if the student mentioned a skill or project not on their resume, you may reference "
            "it as 'as you mentioned to Dilly' in recommendations. Do not invent facts beyond what is written above."
        )
    user_content = USER_PROMPT_TEMPLATE.format(
        resume_text=resume_text[:28000],
        track_instruction=track_instruction,
        application_instruction=application_instruction,
        supplementary_block=supplementary_block,
    )
    out = get_chat_completion(system_content, user_content, temperature=0.2, max_tokens=8000)
    return out if out else "{}"


def _parse_llm_response(raw: str) -> dict:
    """Extract JSON from LLM response; tolerate surrounding markdown."""
    raw = raw.strip()
    # Strip markdown code block if present
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```\s*$", "", raw)
    return json.loads(raw)


def _normalize_for_substring(s: str) -> str:
    """Collapse whitespace to single space for substring matching."""
    return " ".join((s or "").split())


def _build_valid_evidence_quotes(parsed: dict, resume_text: str) -> dict | None:
    """Build evidence_quotes only for strings that actually appear in the resume (verbatim). Rejects paraphrases."""
    resume_norm = _normalize_for_substring(resume_text)
    evidence_quotes = {}
    for key, field in (("smart", "evidence_quote_smart"), ("grit", "evidence_quote_grit"), ("build", "evidence_quote_build")):
        q = (parsed.get(field) or "").strip()
        if not q or len(q) > 500:
            continue
        q_norm = _normalize_for_substring(q)
        if q_norm and q_norm in resume_norm:
            evidence_quotes[key] = q
    return evidence_quotes if evidence_quotes else None


def _to_auditor_result(parsed: dict, resume_text: str, fallback_major: str | None = None) -> AuditorResult:
    """Map parsed JSON to AuditorResult. Clamp scores and fill missing fields. fallback_major = parser major when LLM returns Unknown."""
    def clamp_score(v, default: float = 50.0) -> float:
        if v is None:
            return default
        try:
            return round(min(100.0, max(0.0, float(v))), 2)
        except (TypeError, ValueError):
            return default

    smart = clamp_score(parsed.get("smart_score"))
    grit = clamp_score(parsed.get("grit_score"))
    build = clamp_score(parsed.get("build_score"))
    final = clamp_score(parsed.get("final_score"))
    if final == 50.0 and (smart != 50 or grit != 50 or build != 50):
        from dilly_core.tracks import get_composite_weights
        track_hint = parsed.get("track") or "Humanities"
        w = get_composite_weights(track_hint)
        final = round(smart * w[0] + grit * w[1] + build * w[2], 2)

    findings: List[str] = list(parsed.get("audit_findings") or [])
    if not findings:
        findings = [
            parsed.get("evidence_smart") or "Smart: evidence from resume.",
            parsed.get("evidence_grit") or "Grit: evidence from resume.",
            parsed.get("evidence_build") or "Build: evidence from resume.",
        ]

    evidence_smart = [parsed.get("evidence_smart") or ""]
    evidence_grit = [parsed.get("evidence_grit") or ""]
    evidence_build = [parsed.get("evidence_build") or ""]

    recs_raw = parsed.get("recommendations") or []
    recommendations = []
    for r in recs_raw:
        if not isinstance(r, dict):
            continue
        title = r.get("title") or r.get("name") or r.get("label")
        action = r.get("action") or r.get("description") or r.get("detail") or r.get("text")
        if not title and not action:
            continue
        rec = {
            "type": (r.get("type") or "generic").strip().lower() if r.get("type") else "generic",
            "title": str(title or "Recommendation")[:120],
            "action": str(action or "")[:500],
        }
        if rec["type"] not in ("generic", "line_edit", "action"):
            rec["type"] = "generic"
        if rec["type"] == "line_edit":
            rec["current_line"] = (r.get("current_line") or "")[:400]
            rec["suggested_line"] = (r.get("suggested_line") or "")[:400]
            if r.get("diagnosis"):
                rec["diagnosis"] = str(r.get("diagnosis"))[:40]
        if rec["type"] == "action":
            if r.get("score_target"):
                rec["score_target"] = str(r.get("score_target"))[:20]
            # Pass through current_line when action cites a specific line (e.g. missing date/location)
            if r.get("current_line"):
                rec["current_line"] = (r.get("current_line") or "")[:400]
        if rec["type"] == "generic" and r.get("current_line"):
            rec["current_line"] = (r.get("current_line") or "")[:400]
        recommendations.append(rec)

    # Track: use LLM value; for track detection use parser major when LLM major is missing/Unknown (so Pre-Law inference works)
    major = parsed.get("major") or fallback_major or "Unknown"
    major_for_track = major if major and major != "Unknown" else (fallback_major or "Unknown")
    track = parsed.get("track") or get_track_from_major_and_text(major_for_track, resume_text)
    if track in ("Pre-Health", "Pre-Law"):
        track = get_track_from_major_and_text(major_for_track, resume_text)
    if track == "Tech" and get_default_track_for_major(major_for_track) == "Communications":
        track = "Communications"
    # Data Science / CS / Tech majors: don't let LLM assign Arts (e.g. from "visual design" in project text)
    major_default = get_default_track_for_major(major_for_track)
    if major_default == "Tech" and track == "Arts":
        track = "Tech"
    # Pre-Law inferred from signals (mock trial, legal internship, advocacy, policy memos): rule-based wins over LLM
    if get_track_from_major_and_text(major_for_track, resume_text) == "Pre-Law":
        track = "Pre-Law"

    # Display: normalize all evidence through the weaver so every resume gets the same sentence format (no dates/by present/location in Grit).
    es_raw = (evidence_smart[0] if evidence_smart and evidence_smart[0].strip() else None)
    eg_raw = (evidence_grit[0] if evidence_grit and evidence_grit[0].strip() else None)
    eb_raw = (evidence_build[0] if evidence_build and evidence_build[0].strip() else None)
    es = _weave_snippet_into_sentence("smart", "You showcased high academic standard through ", es_raw, track) if es_raw else None
    eg = _weave_snippet_into_sentence("grit", "You demonstrated leadership and impact through ", eg_raw, track) if eg_raw else None
    eb = _weave_snippet_into_sentence("build", f"You demonstrated {track} readiness through ", eb_raw, track) if eb_raw else None
    dilly_take = (parsed.get("dilly_take") or parsed.get("meridian_take") or "").strip() or None
    # Exact quotes from resume: only include if the text actually appears in the resume (no paraphrases)
    evidence_quotes = _build_valid_evidence_quotes(parsed, resume_text)
    return AuditorResult(
        candidate_name=parsed.get("candidate_name") or "Unknown",
        major=major,
        track=track,
        smart_score=smart,
        grit_score=grit,
        build_score=build,
        final_score=final,
        audit_findings=findings,
        evidence_smart=evidence_smart,
        evidence_grit=evidence_grit,
        evidence_build=evidence_build,
        evidence_smart_display=es,
        evidence_grit_display=eg,
        evidence_build_display=eb,
        evidence_quotes=evidence_quotes if evidence_quotes else None,
        recommendations=recommendations if recommendations else None,
        dilly_take=dilly_take,
    )


def _append_tech_tie_to_outcome_if_needed(result: AuditorResult, raw_text: str) -> AuditorResult:
    """
    When track is Tech, compute skills_without_outcome from resume text and append the
    "Tie skills to outcomes" recommendation if any. Keeps Tech rule-based rec in sync
    with the LLM path (TECH_SCORING_EXTRACTION_AND_RECOMMENDATIONS.md).
    """
    if result.track != "Tech" or not (raw_text or "").strip():
        return result
    major = (result.major or "").strip() or "Unknown"
    keywords = get_tech_keywords_for_major(major)
    _, skills_without_outcome = get_tech_outcome_tied_signals(raw_text, tech_keywords=keywords)
    if not skills_without_outcome:
        return result
    skills_str = ", ".join(skills_without_outcome[:5])
    if len(skills_without_outcome) > 5:
        skills_str += ", …"
    tie_rec = {
        "type": "action",
        "title": "Tie skills to outcomes",
        "action": f"Tie {skills_str} to an outcome: add a project or role bullet that uses this skill and includes a measurable result (e.g. %, $, time saved, users impacted).",
        "score_target": "build",
    }
    merged = list(result.recommendations or []) + [tie_rec]
    return AuditorResult(
        candidate_name=result.candidate_name,
        major=result.major,
        track=result.track,
        smart_score=result.smart_score,
        grit_score=result.grit_score,
        build_score=result.build_score,
        final_score=result.final_score,
        audit_findings=result.audit_findings,
        evidence_smart=result.evidence_smart,
        evidence_grit=result.evidence_grit,
        evidence_build=getattr(result, "evidence_build", []) or [],
        evidence_smart_display=getattr(result, "evidence_smart_display", None),
        evidence_grit_display=getattr(result, "evidence_grit_display", None),
        evidence_build_display=getattr(result, "evidence_build_display", None),
        evidence_quotes=getattr(result, "evidence_quotes", None),
        recommendations=merged,
        dilly_take=getattr(result, "dilly_take", None),
    )


def run_audit_llm(
    raw_text: str,
    *,
    candidate_name: str | None = None,
    major: str | None = None,
    gpa: float | None = None,
    fallback_to_rules: bool = True,
    filename: str | None = None,
    application_target: str | None = None,
    application_target_label: str | None = None,
    supplementary_context: str | None = None,
) -> AuditorResult:
    """
    Run Dilly audit using an LLM. MTS enforced via prompt; only evidence from resume.
    If fallback_to_rules is True and LLM fails or returns invalid JSON, uses rule-based auditor.
    When result.candidate_name is Unknown and filename is provided, uses name_from_filename.
    application_target: internship, full_time, or exploring to tailor recommendations.
    application_target_label: free-text company/role target (e.g. "Goldman Sachs, Summer Analyst")
      — injected into supplementary context so the LLM can personalize recommendations further.
    supplementary_context: optional block of extra facts the student told Dilly Voice that
    aren't on their resume (beyond_resume + experience_expansion). Injected after resume text.
    """
    try:
        # Pre-detect track so we can ask the LLM to evaluate as that field's recruiter
        track_hint = get_track_from_major_and_text(major or "Unknown", raw_text)
        few_shot_block = ""
        if os.environ.get("DILLY_FEW_SHOT") or os.environ.get("MERIDIAN_FEW_SHOT", "1").strip().lower() in ("1", "true", "yes"):
            examples = _load_few_shot_examples(
                max_examples=int(os.environ.get("DILLY_FEW_SHOT_N") or os.environ.get("MERIDIAN_FEW_SHOT_N", "3")),
                max_chars_per_excerpt=int(os.environ.get("DILLY_EXCERPT_CHARS") or os.environ.get("MERIDIAN_EXCERPT_CHARS", "2400")),
            )
            few_shot_block = _build_few_shot_block(examples)
        # Merge application_target_label into supplementary context when provided
        merged_supplementary = supplementary_context
        if application_target_label and application_target_label.strip():
            label_block = f"SPECIFIC APPLICATION TARGET: The student is specifically targeting \"{application_target_label.strip()}\". Tailor your recommendations, line edits, and dilly_take to be as specific as possible for this exact role/company/program."
            merged_supplementary = (label_block + "\n\n" + (supplementary_context or "")).strip() or None
        content = _call_llm(
            raw_text,
            few_shot_block=few_shot_block or None,
            track_hint=track_hint,
            application_target=application_target,
            supplementary_context=merged_supplementary or None,
        )
        parsed = _parse_llm_response(content)
        result = _to_auditor_result(parsed, raw_text, fallback_major=major or None)
        result = _append_tech_tie_to_outcome_if_needed(result, raw_text)
        if candidate_name:
            result = AuditorResult(
                candidate_name=candidate_name,
                major=result.major,
                track=result.track,
                smart_score=result.smart_score,
                grit_score=result.grit_score,
                build_score=result.build_score,
                final_score=result.final_score,
                audit_findings=result.audit_findings,
                evidence_smart=result.evidence_smart,
                evidence_grit=result.evidence_grit,
                evidence_build=getattr(result, "evidence_build", []) or [],
                evidence_smart_display=getattr(result, "evidence_smart_display", None),
                evidence_grit_display=getattr(result, "evidence_grit_display", None),
                evidence_build_display=getattr(result, "evidence_build_display", None),
                evidence_quotes=getattr(result, "evidence_quotes", None),
                recommendations=result.recommendations,
                dilly_take=getattr(result, "dilly_take", None),
            )
        # Never leave Unknown when we have a filename (scale-ready)
        if (result.candidate_name or "").strip().lower() == "unknown" and filename:
            result = AuditorResult(
                candidate_name=name_from_filename(filename),
                major=result.major,
                track=result.track,
                smart_score=result.smart_score,
                grit_score=result.grit_score,
                build_score=result.build_score,
                final_score=result.final_score,
                audit_findings=result.audit_findings,
                evidence_smart=result.evidence_smart,
                evidence_grit=result.evidence_grit,
                evidence_build=getattr(result, "evidence_build", []) or [],
                evidence_smart_display=getattr(result, "evidence_smart_display", None),
                evidence_grit_display=getattr(result, "evidence_grit_display", None),
                evidence_build_display=getattr(result, "evidence_build_display", None),
                evidence_quotes=getattr(result, "evidence_quotes", None),
                recommendations=result.recommendations,
                dilly_take=getattr(result, "dilly_take", None),
            )
        return result
    except Exception as e:
        if fallback_to_rules and run_rule_audit is not None:
            return run_rule_audit(raw_text, candidate_name=candidate_name or "Unknown", major=major or "Unknown", gpa=gpa, filename=filename)
        raise RuntimeError(f"LLM audit failed: {e}") from e
