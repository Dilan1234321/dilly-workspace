/**
 * Unified 43-Cohort System — Desktop Mirror
 *
 * This file MUST match mobile/lib/cohorts.ts exactly.
 * Every cohort is both a scoring cohort AND a resume template cohort.
 * Scoring weights live in api/cohort_scoring_weights.py (single source of truth).
 */

// ── All 43 cohorts ──────────────────────────────────────────────────────────

export const ALL_COHORTS = [
  // Tech & Engineering (1-5)
  'Software Engineering & CS',
  'Data Science & Analytics',
  'Cybersecurity & IT',
  // Engineering (6-10)
  'Mechanical & Aerospace Engineering',
  'Electrical & Computer Engineering',
  'Civil & Environmental Engineering',
  'Chemical & Biomedical Engineering',
  'Industrial & Systems Engineering',
  // Business (11-16)
  'Finance & Accounting',
  'Marketing & Advertising',
  'Consulting & Strategy',
  'Management & Operations',
  'Economics & Public Policy',
  'Entrepreneurship & Innovation',
  // Health & Life Sciences (17-22)
  'Healthcare & Clinical',
  'Life Sciences & Research',
  'Nursing & Patient Care',
  'Dental & Oral Health',
  'Pharmacy & Pharmaceutical Science',
  'Veterinary & Animal Science',
  // Physical & Mathematical Sciences (23)
  'Physical Sciences & Math',
  // Social Sciences & Humanities (24-27)
  'Social Sciences & Nonprofit',
  'Media & Communications',
  'Design & Creative',
  'Performing Arts & Film',
  // Law & Government (28-30)
  'Legal & Compliance',
  'Criminal Justice & Public Safety',
  'Public Administration & Government',
  // People & Education (31-33)
  'Human Resources & People',
  'Education & Teaching',
  'Religious Studies & Ministry',
  // Operations & Trades (34-37)
  'Supply Chain & Logistics',
  'Real Estate & Construction',
  'Culinary Arts & Food Service',
  'Hospitality & Events',
  // Specialized (38-43)
  'Agriculture & Food Science',
  'Architecture & Urban Planning',
  'Aviation & Transportation',
  'Fashion & Apparel',
  'Foreign Languages & Linguistics',
  'Journalism & Broadcasting',
  'Library & Information Science',
  'Environmental & Sustainability',
];

// ── Cohort colors ───────────────────────────────────────────────────────────

export const COHORT_COLORS: Record<string, string> = {
  // Tech & Engineering
  'Software Engineering & CS':          '#2B3A8E',
  'Data Science & Analytics':           '#2B3A8E',
  'Cybersecurity & IT':                 '#2B3A8E',
  'Mechanical & Aerospace Engineering': '#2B3A8E',
  'Electrical & Computer Engineering':  '#2B3A8E',
  'Civil & Environmental Engineering':  '#34C759',
  'Chemical & Biomedical Engineering':  '#5E5CE6',
  'Industrial & Systems Engineering':   '#FF9F0A',
  // Business
  'Finance & Accounting':               '#2B3A8E',
  'Marketing & Advertising':            '#FF6B8A',
  'Consulting & Strategy':              '#2B3A8E',
  'Management & Operations':            '#34C759',
  'Economics & Public Policy':          '#5E5CE6',
  'Entrepreneurship & Innovation':      '#FF9F0A',
  // Health & Life Sciences
  'Healthcare & Clinical':              '#FF453A',
  'Life Sciences & Research':           '#34C759',
  'Nursing & Patient Care':             '#FF453A',
  'Dental & Oral Health':               '#5E5CE6',
  'Pharmacy & Pharmaceutical Science':  '#5E5CE6',
  'Veterinary & Animal Science':        '#34C759',
  // Sciences
  'Physical Sciences & Math':           '#5E5CE6',
  // Social Sciences & Humanities
  'Social Sciences & Nonprofit':        '#FF9F0A',
  'Media & Communications':             '#FF6B8A',
  'Design & Creative':                  '#FF6B8A',
  'Performing Arts & Film':             '#FF6B8A',
  // Law & Government
  'Legal & Compliance':                 '#5E5CE6',
  'Criminal Justice & Public Safety':   '#FF453A',
  'Public Administration & Government': '#5E5CE6',
  // People & Education
  'Human Resources & People':           '#34C759',
  'Education & Teaching':               '#34C759',
  'Religious Studies & Ministry':       '#FF9F0A',
  // Operations & Trades
  'Supply Chain & Logistics':           '#FF9F0A',
  'Real Estate & Construction':         '#FF9F0A',
  'Culinary Arts & Food Service':       '#FF9F0A',
  'Hospitality & Events':               '#FF9F0A',
  // Specialized
  'Agriculture & Food Science':         '#34C759',
  'Architecture & Urban Planning':      '#2B3A8E',
  'Aviation & Transportation':          '#2B3A8E',
  'Fashion & Apparel':                  '#FF6B8A',
  'Foreign Languages & Linguistics':    '#5E5CE6',
  'Journalism & Broadcasting':          '#FF6B8A',
  'Library & Information Science':      '#5E5CE6',
  'Environmental & Sustainability':     '#34C759',
  General:                              '#2B3A8E',
};

export function getCohortColor(cohort: string): string {
  return COHORT_COLORS[cohort] ?? '#2B3A8E';
}

/**
 * Derives a user's pre-selected interests from their profile.
 * Merges manually saved interests with cohort_scores (major/minor/interest level cohorts).
 * This ensures academic cohorts are always pre-populated without requiring manual setup.
 */
export function getProfileInterests(profile: any): string[] {
  const saved: string[] = profile?.interests ?? [];
  const fromCohorts: string[] = Object.values(profile?.cohort_scores ?? {})
    .map((c: any) => c?.cohort)
    .filter((name: any): name is string => typeof name === 'string' && ALL_COHORTS.includes(name));
  return Array.from(new Set([...saved, ...fromCohorts]));
}
