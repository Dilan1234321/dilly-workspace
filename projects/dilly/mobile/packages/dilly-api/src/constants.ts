/**
 * @dilly/api - Shared constants
 *
 * Cohort system, brand colors, and automation risk classification.
 * Used by desktop, mobile, and dashboard.
 */

import type { AutomationRisk, RiskProfile } from "./types";

// ─── Brand Colors ───────────────────────────────────────────────────────────

export const colors = {
  blue: "#2B3A8E",
  blueLight: "#3B4CC0",
  blueDark: "#1E2D6E",
  ready: "#34C759",
  almost: "#FF9F0A",
  gap: "#FF453A",
  info: "#0A84FF",
} as const;

// ─── 43-Cohort System ───────────────────────────────────────────────────────

export const ALL_COHORTS = [
  // Tech & Engineering
  "Software Engineering & CS",
  "Data Science & Analytics",
  "Cybersecurity & IT",
  // Engineering
  "Mechanical & Aerospace Engineering",
  "Electrical & Computer Engineering",
  "Civil & Environmental Engineering",
  "Chemical & Biomedical Engineering",
  "Industrial & Systems Engineering",
  // Business
  "Finance & Accounting",
  "Marketing & Advertising",
  "Consulting & Strategy",
  "Management & Operations",
  "Economics & Public Policy",
  "Entrepreneurship & Innovation",
  // Health & Life Sciences
  "Healthcare & Clinical",
  "Life Sciences & Research",
  "Nursing & Patient Care",
  "Dental & Oral Health",
  "Pharmacy & Pharmaceutical Science",
  "Veterinary & Animal Science",
  // Physical & Mathematical Sciences
  "Physical Sciences & Math",
  // Social Sciences & Humanities
  "Social Sciences & Nonprofit",
  "Media & Communications",
  "Design & Creative",
  "Performing Arts & Film",
  // Law & Government
  "Legal & Compliance",
  "Criminal Justice & Public Safety",
  "Public Administration & Government",
  // People & Education
  "Human Resources & People",
  "Education & Teaching",
  "Religious Studies & Ministry",
  // Operations & Trades
  "Supply Chain & Logistics",
  "Real Estate & Construction",
  "Culinary Arts & Food Service",
  "Hospitality & Events",
  // Specialized
  "Agriculture & Food Science",
  "Architecture & Urban Planning",
  "Aviation & Transportation",
  "Fashion & Apparel",
  "Foreign Languages & Linguistics",
  "Journalism & Broadcasting",
  "Library & Information Science",
  "Environmental & Sustainability",
] as const;

export type CohortName = (typeof ALL_COHORTS)[number] | "General";

export const COHORT_COLORS: Record<string, string> = {
  "Software Engineering & CS": "#2B3A8E",
  "Data Science & Analytics": "#2B3A8E",
  "Cybersecurity & IT": "#2B3A8E",
  "Mechanical & Aerospace Engineering": "#2B3A8E",
  "Electrical & Computer Engineering": "#2B3A8E",
  "Civil & Environmental Engineering": "#34C759",
  "Chemical & Biomedical Engineering": "#5E5CE6",
  "Industrial & Systems Engineering": "#FF9F0A",
  "Finance & Accounting": "#2B3A8E",
  "Marketing & Advertising": "#FF6B8A",
  "Consulting & Strategy": "#2B3A8E",
  "Management & Operations": "#34C759",
  "Economics & Public Policy": "#5E5CE6",
  "Entrepreneurship & Innovation": "#FF9F0A",
  "Healthcare & Clinical": "#FF453A",
  "Life Sciences & Research": "#34C759",
  "Nursing & Patient Care": "#FF453A",
  "Dental & Oral Health": "#5E5CE6",
  "Pharmacy & Pharmaceutical Science": "#5E5CE6",
  "Veterinary & Animal Science": "#34C759",
  "Physical Sciences & Math": "#5E5CE6",
  "Social Sciences & Nonprofit": "#FF9F0A",
  "Media & Communications": "#FF6B8A",
  "Design & Creative": "#FF6B8A",
  "Performing Arts & Film": "#FF6B8A",
  "Legal & Compliance": "#5E5CE6",
  "Criminal Justice & Public Safety": "#FF453A",
  "Public Administration & Government": "#5E5CE6",
  "Human Resources & People": "#34C759",
  "Education & Teaching": "#34C759",
  "Religious Studies & Ministry": "#FF9F0A",
  "Supply Chain & Logistics": "#FF9F0A",
  "Real Estate & Construction": "#FF9F0A",
  "Culinary Arts & Food Service": "#FF9F0A",
  "Hospitality & Events": "#FF9F0A",
  "Agriculture & Food Science": "#34C759",
  "Architecture & Urban Planning": "#2B3A8E",
  "Aviation & Transportation": "#2B3A8E",
  "Fashion & Apparel": "#FF6B8A",
  "Foreign Languages & Linguistics": "#5E5CE6",
  "Journalism & Broadcasting": "#FF6B8A",
  "Library & Information Science": "#5E5CE6",
  "Environmental & Sustainability": "#34C759",
  General: "#2B3A8E",
};

export function getCohortColor(cohort: string): string {
  return COHORT_COLORS[cohort] ?? "#2B3A8E";
}

// ─── Major → Cohort Mapping ─────────────────────────────────────────────────

export const MAJOR_TO_COHORT: Record<string, string> = {
  "Computer Science": "Software Engineering & CS",
  "Computer Information Systems": "Software Engineering & CS",
  "Software Engineering": "Software Engineering & CS",
  Cybersecurity: "Cybersecurity & IT",
  "Information Technology": "Cybersecurity & IT",
  "Data Science": "Data Science & Analytics",
  Finance: "Finance & Accounting",
  Accounting: "Finance & Accounting",
  Economics: "Economics & Public Policy",
  "Business Administration": "Management & Operations",
  "International Business": "Management & Operations",
  Management: "Management & Operations",
  Marketing: "Marketing & Advertising",
  "Advertising and Public Relations": "Marketing & Advertising",
  Biology: "Life Sciences & Research",
  Chemistry: "Life Sciences & Research",
  Biochemistry: "Life Sciences & Research",
  Physics: "Physical Sciences & Math",
  "Environmental Science": "Environmental & Sustainability",
  "Marine Science": "Life Sciences & Research",
  "Forensic Science": "Life Sciences & Research",
  Mathematics: "Physical Sciences & Math",
  Statistics: "Physical Sciences & Math",
  Nursing: "Nursing & Patient Care",
  "Health Sciences": "Healthcare & Clinical",
  "Exercise Science": "Healthcare & Clinical",
  Kinesiology: "Healthcare & Clinical",
  "Allied Health": "Healthcare & Clinical",
  "Public Health": "Healthcare & Clinical",
  Psychology: "Social Sciences & Nonprofit",
  Sociology: "Social Sciences & Nonprofit",
  "Political Science": "Public Administration & Government",
  "Criminal Justice": "Criminal Justice & Public Safety",
  "Government and World Affairs": "Public Administration & Government",
  "Social Work": "Social Sciences & Nonprofit",
  History: "Social Sciences & Nonprofit",
  Philosophy: "Social Sciences & Nonprofit",
  English: "Media & Communications",
  Journalism: "Journalism & Broadcasting",
  Communication: "Media & Communications",
  "Liberal Arts": "Social Sciences & Nonprofit",
  Education: "Education & Teaching",
  "Theatre Arts": "Performing Arts & Film",
  Music: "Performing Arts & Film",
  "Digital Arts and Design": "Design & Creative",
  "Sport Management": "Management & Operations",
};

export const PRE_PROF_TO_COHORT: Record<string, string> = {
  "Pre-Med": "Healthcare & Clinical",
  "Pre-Dental": "Dental & Oral Health",
  "Pre-Pharmacy": "Pharmacy & Pharmaceutical Science",
  "Pre-Veterinary": "Veterinary & Animal Science",
  "Pre-Physical Therapy": "Healthcare & Clinical",
  "Pre-Occupational Therapy": "Healthcare & Clinical",
  "Pre-Physician Assistant": "Healthcare & Clinical",
  "Pre-Law": "Legal & Compliance",
};

export function detectCohort(
  majors: string[],
  preProf: string | null,
): string {
  if (preProf && preProf !== "None / Not applicable") {
    const c = PRE_PROF_TO_COHORT[preProf];
    if (c) return c;
  }
  for (const m of majors) {
    const c = MAJOR_TO_COHORT[m];
    if (c) return c;
  }
  return "General";
}

// ─── Onboarding Constants ───────────────────────────────────────────────────

export const APPROVED_MAJORS = [
  "Accounting", "Advertising and Public Relations", "Allied Health", "Biochemistry",
  "Biology", "Business Administration", "Chemistry", "Communication",
  "Computer Information Systems", "Computer Science", "Criminal Justice", "Cybersecurity",
  "Data Science", "Digital Arts and Design", "Economics", "Education", "English",
  "Environmental Science", "Exercise Science", "Finance", "Forensic Science",
  "Government and World Affairs", "Health Sciences", "History", "Information Technology",
  "International Business", "Journalism", "Kinesiology", "Liberal Arts", "Management",
  "Marine Science", "Marketing", "Mathematics", "Music", "Nursing", "Philosophy",
  "Physics", "Political Science", "Psychology", "Public Health", "Social Work",
  "Sociology", "Software Engineering", "Sport Management", "Statistics", "Theatre Arts",
] as const;

export const PRE_PROF_OPTIONS = [
  "Pre-Med", "Pre-Dental", "Pre-Pharmacy", "Pre-Veterinary",
  "Pre-Physical Therapy", "Pre-Occupational Therapy", "Pre-Physician Assistant",
  "Pre-Law", "None / Not applicable",
] as const;

export const INTERESTS_LIST = [
  "Software Engineering & CS", "Data Science & Analytics", "Cybersecurity & IT",
  "Electrical & Computer Engineering", "Mechanical & Aerospace Engineering",
  "Civil & Environmental Engineering", "Chemical & Biomedical Engineering",
  "Finance & Accounting", "Consulting & Strategy", "Marketing & Advertising",
  "Management & Operations", "Entrepreneurship & Innovation", "Economics & Public Policy",
  "Healthcare & Clinical", "Biotech & Pharmaceutical", "Life Sciences & Research",
  "Physical Sciences & Math", "Law & Government", "Media & Communications",
  "Design & Creative Arts", "Education & Human Development", "Social Sciences & Nonprofit",
] as const;

// ─── Automation Risk ────────────────────────────────────────────────────────

const HIGH_RISK: RegExp[] = [
  /data.?entr/i, /\bclerk\b/i, /transcri/i, /bookkeep/i,
  /accounts.?(payable|receivable)/i, /administrative.?assist/i,
  /office.?assist/i, /content.?moderat/i, /data.?tagger/i,
  /data.?labeler/i, /annotation/i, /qa.?tester/i, /manual.?test/i,
  /order.?process/i, /billing.?specialist/i, /invoice.?process/i,
];

const AMPLIFIED_RISK: RegExp[] = [
  /software.?(engineer|develop|architect)/i, /machine.?learn/i,
  /\bml\b.*(engineer|research)/i, /\bai\b.*(engineer|research|develop)/i,
  /data.?scien/i, /research.?scientist/i, /full.?stack/i,
  /\bbackend\b/i, /\bfrontend\b/i, /cloud.?(engineer|architect)/i,
  /\bdevops\b/i, /\bsre\b/i, /\bquant(itative)?\b/i,
  /security.?(engineer|architect|research)/i, /cybersecurity/i,
  /investment.?bank/i, /m&a\b/i, /mergers?.and.acquisitions/i,
  /venture.?capital/i, /private.?equity/i,
  /strategy.?consult/i, /management.?consult/i,
  /ux.?research/i, /ux.?design/i, /product.?(manager|lead|director)/i,
  /deep.?learn/i, /\bnlp\b/i, /computer.?vision/i,
  /hardware.?engineer/i, /embedded.?(system|engineer)/i,
  /robotics/i, /firmware/i, /platform.?engineer/i,
  /infrastructure.?engineer/i, /site.?reliability/i,
];

export function getAutomationRisk(jobTitle: string): RiskProfile {
  const t = jobTitle || "";

  if (HIGH_RISK.some((r) => r.test(t))) {
    return {
      level: "high",
      label: "High AI Risk",
      shortLabel: "AI Risk",
      reason:
        "This role involves rule-based tasks that AI is actively automating. Look for paths that build on top of AI rather than compete with it.",
      color: "#FF453A",
      bg: "rgba(255,69,58,0.08)",
      border: "rgba(255,69,58,0.2)",
    };
  }

  if (AMPLIFIED_RISK.some((r) => r.test(t))) {
    return {
      level: "amplified",
      label: "AI-Amplified",
      shortLabel: "AI+",
      reason:
        "This role gets dramatically better with AI tools. People in this track are building on top of AI, not being replaced by it.",
      color: "#34d399",
      bg: "rgba(52,211,153,0.08)",
      border: "rgba(52,211,153,0.2)",
    };
  }

  return {
    level: "evolving",
    label: "Evolving Role",
    shortLabel: "Evolving",
    reason:
      "AI is changing this role. The skills that make you valuable here in 2026 are different from 2024. Build toward judgment and AI-tool fluency to stay ahead.",
    color: "#FF9F0A",
    bg: "rgba(255,159,10,0.08)",
    border: "rgba(255,159,10,0.2)",
  };
}
