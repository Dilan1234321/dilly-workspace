/**
 * System prompt builder for the Dilly AI coach.
 * Ported from api/routers/ai.py _build_rich_system_prompt().
 */

import type { RichContext } from "./context";

export function buildSystemPrompt(
  mode: "coaching" | "practice",
  ctx: RichContext | null,
  narrative?: string,
): string {
  if (mode === "practice") return buildPracticePrompt(ctx);
  if (ctx) return buildRichPrompt(ctx, narrative);
  return "You are Dilly, an AI career coach for college students. Give specific, actionable coaching. Be direct and honest. No generic advice. Keep replies to 2-4 short paragraphs.";
}

function buildPracticePrompt(ctx: RichContext | null): string {
  const company = ctx?.reference_company || "a top company";
  const name = ctx?.name || "the student";
  const cohort = ctx?.cohort || "General";
  return `You are a tough but fair interviewer at ${company}. You are interviewing ${name} for an internship or full-time role in ${cohort}. Conduct a realistic interview simulation. Ask ONE question at a time. After each student answer, give 1-2 sentences of direct feedback, then ask your next question. Start by briefly introducing yourself and asking your first question. Be direct, professional, and challenging.`;
}

function buildRichPrompt(r: RichContext, narrative?: string): string {
  const score = r.current_score;
  const bar = r.cohort_bar;
  const gap = r.gap;

  let scoreBlock: string;
  if (score !== null) {
    const lines = [
      `CURRENT SCORE: ${Math.round(score)}/100`,
      `Dimensions: Smart ${Math.round(r.smart)}, Grit ${Math.round(r.grit)}, Build ${Math.round(r.build)}`,
      `Cohort bar (${r.reference_company}): ${Math.round(bar)}/100`,
    ];
    if (r.cleared_bar) lines.push("ABOVE the bar. Recruiter ready.");
    else if (gap !== null)
      lines.push(`BELOW the bar by ${Math.round(gap)} points. ${r.weakest_dimension} is the weakest dimension.`);
    if (r.strongest_dimension) lines.push(`Strongest dimension: ${r.strongest_dimension}`);
    if (r.score_delta !== null)
      lines.push(`Score changed by ${r.score_delta > 0 ? "+" : ""}${Math.round(r.score_delta)} since last audit.`);
    if (r.days_since_audit !== null) lines.push(`Last audited ${r.days_since_audit} days ago.`);
    if (r.dilly_take) lines.push(`Last audit insight: ${r.dilly_take}`);
    scoreBlock = lines.join("\n");
  } else {
    scoreBlock = "NO SCORE YET. Student has not run their first audit.";
  }

  const ac = r.app_counts;
  let appsBlock: string;
  if (r.total_applications > 0) {
    const lines = [
      `APPLICATION PIPELINE: ${r.total_applications} total`,
      `Saved: ${ac.saved} | Applied: ${ac.applied} | Interviewing: ${ac.interviewing} | Offers: ${ac.offer} | Rejected: ${ac.rejected}`,
    ];
    if (r.interviewing_at.length) lines.push(`Currently interviewing at: ${r.interviewing_at.join(", ")}`);
    if (r.silent_apps.length)
      lines.push(`WARNING: No response from ${r.silent_apps.slice(0, 3).join(", ")} in 2+ weeks.`);
    appsBlock = lines.join("\n");
  } else {
    appsBlock = "APPLICATION PIPELINE: Empty. Student hasn't started tracking applications.";
  }

  let deadlineBlock: string;
  if (r.upcoming_deadlines.length) {
    const dlLines = r.upcoming_deadlines.slice(0, 5).map((dl) => {
      const urgency = dl.days_until === 0 ? "TODAY" : dl.days_until === 1 ? "TOMORROW" : `in ${dl.days_until} days`;
      return `  - ${dl.label} (${urgency}, ${dl.date})`;
    });
    deadlineBlock = "UPCOMING DEADLINES:\n" + dlLines.join("\n");
  } else {
    deadlineBlock = "UPCOMING DEADLINES: None scheduled.";
  }

  const targetParts: string[] = [];
  if (r.career_goal) targetParts.push(`Career goal: ${r.career_goal}`);
  if (r.industry_target) targetParts.push(`Industry target: ${r.industry_target}`);
  if (r.target_companies.length) targetParts.push(`Target companies: ${r.target_companies.slice(0, 5).join(", ")}`);
  const targetBlock = targetParts.length ? "CAREER TARGETS:\n" + targetParts.map((p) => `  - ${p}`).join("\n") : "";

  let historyBlock = "";
  if (r.audit_history.length > 1) {
    const hLines = r.audit_history.slice(0, 5).map((h) => `  - ${h.date || "?"}: ${h.score ?? "?"}/100`);
    historyBlock = "SCORE HISTORY:\n" + hLines.join("\n");
  }

  const resumeBlock = r.resume_snippet
    ? `FULL RESUME TEXT (reference specific bullets and sections, never ask what is on their resume):\n${r.resume_snippet.slice(0, 5000)}`
    : "";

  const memoryBlock = narrative ? `WHAT YOU KNOW FROM PAST CONVERSATIONS:\n${narrative}` : "";

  // ── Academic profile block ──────────────────────────────────
  const academicParts: string[] = [];
  if (r.transcript_gpa) academicParts.push(`GPA: ${r.transcript_gpa}`);
  if (r.graduation_year) academicParts.push(`Graduation year: ${r.graduation_year}`);
  if (r.preProfessional) {
    const label = typeof r.preProfessional === "string" ? r.preProfessional : "Yes";
    academicParts.push(`Pre-professional track: ${label}`);
  }
  if (r.target_school) academicParts.push(`Target graduate/professional school: ${r.target_school}`);
  if (r.transcript_courses?.length)
    academicParts.push(`Key courses: ${r.transcript_courses.slice(0, 10).join(", ")}`);
  if (r.transcript_honors?.length)
    academicParts.push(`Honors/Awards: ${r.transcript_honors.slice(0, 10).join(", ")}`);
  const academicBlock = academicParts.length
    ? "ACADEMIC PROFILE:\n" + academicParts.map((p) => `  - ${p}`).join("\n")
    : "";

  // ── Beyond resume block ─────────────────────────────────────
  const brLines: string[] = [];
  if (r.beyond_resume?.length) {
    const byType: Record<string, string[]> = {};
    for (const item of r.beyond_resume) {
      const t = (item.type || "other").toLowerCase();
      const text = (item.text || "").trim().slice(0, 120);
      if (text) {
        if (!byType[t]) byType[t] = [];
        byType[t].push(text);
      }
    }
    const typeLabels: [string, string][] = [
      ["skill", "Skills"],
      ["project", "Projects"],
      ["experience", "Experiences"],
      ["person", "People mentioned"],
      ["company", "Companies"],
      ["other", "Other"],
    ];
    for (const [tName, label] of typeLabels) {
      if (byType[tName]?.length) brLines.push(`  - ${label}: ${byType[tName].slice(0, 15).join(", ")}`);
    }
  }
  if (r.experience_expansion?.length) {
    for (const entry of r.experience_expansion.slice(0, 6)) {
      const role = (entry.role_label || "").trim();
      const org = (entry.organization || "").trim();
      const labelExp = org ? `${role} at ${org}` : role;
      if (!labelExp) continue;
      const sub: string[] = [];
      if (entry.skills?.length) sub.push("skills: " + entry.skills.slice(0, 10).join(", "));
      if (entry.tools_used?.length) sub.push("tools: " + entry.tools_used.slice(0, 10).join(", "));
      if (sub.length) brLines.push(`  - ${labelExp}: ${sub.join("; ")}`);
    }
  }
  const beyondBlock = brLines.length
    ? "BEYOND THE RESUME (captured skills, tools, projects from conversations):\n" + brLines.join("\n")
    : "";

  // ── Preferences block ───────────────────────────────────────
  const prefParts: string[] = [];
  if (r.job_locations?.length) prefParts.push(`Preferred work locations: ${r.job_locations.slice(0, 8).join(", ")}`);
  if (r.job_location_scope) prefParts.push(`Location scope: ${r.job_location_scope}`);
  if (r.voice_biggest_concern) prefParts.push(`Biggest concern: ${r.voice_biggest_concern.slice(0, 200)}`);
  const prefBlock = prefParts.length
    ? "PREFERENCES:\n" + prefParts.map((p) => `  - ${p}`).join("\n")
    : "";

  // ── Achievements block ──────────────────────────────────────
  const achievementsBlock =
    r.achievements?.length
      ? `UNLOCKED ACHIEVEMENTS: ${r.achievements.slice(0, 15).join(", ")}. Celebrate these when relevant.`
      : "";

  // ── Cohort expertise block ──────────────────────────────────
  const COHORT_EXPERTISE: Record<string, string> = {
    "Software Engineering & CS":
      "You know algorithmic complexity, data structures, system design (CAP theorem, microservices), core languages (Python, Java, Go, TypeScript, C++), modern frameworks, DevOps, and FAANG hiring bars.",
    "Data Science & Analytics":
      "You know the full DS stack (pandas, scikit-learn, PyTorch, SQL), ML fundamentals, deep learning architectures, cloud ML platforms, and data engineering tools.",
    "Finance & Accounting":
      "You know financial modeling (DCF, LBO, comps), valuation, corporate finance, accounting standards (GAAP/IFRS), and recruiting paths (IB, PE, AM, corp finance).",
    "Consulting & Strategy":
      "You know case interview frameworks, market sizing, profitability cases, MBB vs Big 4 vs boutique, and consulting career ladders.",
    "Management & Operations":
      "You know operations management, supply chain, project management frameworks, and general management recruiting.",
    "Life Sciences & Research":
      "You know wet lab techniques (PCR, Western blot, CRISPR), computational biology tools, research hierarchy, and career tracks (PhD, industry R&D, regulatory).",
    "Healthcare & Clinical":
      "You know pre-med paths (MCAT, clinical hours, research), healthcare administration, public health careers, and medical school admissions.",
    "Law & Government":
      "You know pre-law paths (LSAT, personal statement, public interest vs biglaw), government careers, policy analysis, and law school admissions.",
    "Media & Communications":
      "You know journalism, PR, digital marketing, social media strategy, content creation, and media industry recruiting.",
    "Education":
      "You know teaching certifications, EdTech careers, curriculum design, and education policy paths.",
    "Design & Creative Arts":
      "You know UX/UI design tools (Figma, Sketch), portfolio requirements, design thinking, and creative industry recruiting.",
  };
  const trackToRich: Record<string, string> = {
    Tech: "Software Engineering & CS",
    Finance: "Finance & Accounting",
    Consulting: "Consulting & Strategy",
    Business: "Management & Operations",
    Science: "Life Sciences & Research",
    "Pre-Health": "Healthcare & Clinical",
    "Pre-Law": "Law & Government",
    Communications: "Media & Communications",
    Education: "Education",
    Arts: "Design & Creative Arts",
  };
  const richCohort = trackToRich[r.cohort] || "";
  const expertiseText = richCohort ? COHORT_EXPERTISE[richCohort] : "";
  const cohortExpertiseBlock = expertiseText
    ? `FIELD EXPERTISE:\nYou have deep expertise in ${richCohort}. ${expertiseText}`
    : "";

  return `You are Dilly, an AI career coach embedded in a career acceleration app for college students. You are not just a chatbot. You are the student's personal career strategist who can see their entire dashboard.

You have tools available to take actions on behalf of the student. When the student asks you to do something (add a deadline, track an application, run an audit, etc.), USE YOUR TOOLS to do it. Don't just tell them how, actually do it for them.

STUDENT: ${r.name}
${r.pronouns ? `Pronouns: ${r.pronouns}` : ""}
School: ${r.school}
Major: ${r.major}${r.minor ? `, Minor: ${r.minor}` : ""}
Cohort: ${r.cohort}
${r.graduation_year ? `Graduation: ${r.graduation_year}` : ""}
${r.tagline ? `Tagline: ${r.tagline}` : ""}

${scoreBlock}

${appsBlock}

${deadlineBlock}

${targetBlock}

${historyBlock}

${resumeBlock}

${memoryBlock}

${academicBlock}

${beyondBlock}

${prefBlock}

${achievementsBlock}

${cohortExpertiseBlock}

APP FEATURES YOU CAN REFERENCE:
- Resume Editor: Edit resume sections with live bullet scoring (0-100 per bullet).
- New Audit: Upload a PDF or re-audit from the editor. Shows before/after comparison.
- Internship Tracker: Pipeline view (Saved > Applied > Interviewing > Offer > Rejected).
- Calendar: Month view with deadlines, interviews, career fairs.
- Score Detail: Full breakdown of Smart/Grit/Build with evidence.
- Leaderboard: Cohort ranking with movement indicators.
- Jobs: Matched job listings by skill alignment.

YOUR PERSONALITY AND RULES:
- Never use em-dashes. Use commas or periods instead.
- No emoji icons or special symbols (no unicode emoji characters). Plain text only.
- Never start with filler like "Great question!" or "That's a good point."
- Never start your response with the student's name.
- Never use bullet points unless listing 3+ specific items.
- Never ask more than one question at a time.
- Keep responses to 2-4 short paragraphs. No walls of text.
- Talk like a real person, not a corporate chatbot.
- When they ask you to DO something, use your tools to actually do it.

CRITICAL: You already know everything about this student from the context provided. Never ask the student for information you already have -- their name, major, school, track, career goals, scores, applications, GPA, courses, job preferences, or any other profile data. If you need clarification on something specific, reference what you already know first.`.trim();
}
