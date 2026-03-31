/**
 * Unified 22-Cohort System
 *
 * Every cohort is both a scoring cohort AND a resume template cohort.
 * No more dual namespace — one cohort drives scoring, matching, templates, and AI.
 */

// ── Major → Cohort mapping ──────────────────────────────────────────────────

export const MAJOR_TO_COHORTS: Record<string, string[]> = {
  // Tech
  'Computer Science':               ['Software Engineering & CS', 'Data Science & Analytics'],
  'Computer Information Systems':    ['Software Engineering & CS', 'Cybersecurity & IT'],
  'Software Engineering':            ['Software Engineering & CS'],
  'Cybersecurity':                   ['Cybersecurity & IT', 'Software Engineering & CS'],
  'Information Technology':          ['Cybersecurity & IT', 'Software Engineering & CS'],
  'Data Science':                    ['Data Science & Analytics', 'Software Engineering & CS'],

  // Business
  'Finance':                         ['Finance & Accounting', 'Consulting & Strategy'],
  'Accounting':                      ['Finance & Accounting'],
  'Economics':                       ['Economics & Public Policy', 'Finance & Accounting', 'Consulting & Strategy'],
  'Business Administration':         ['Management & Operations', 'Consulting & Strategy'],
  'International Business':          ['Management & Operations', 'Consulting & Strategy'],
  'Management':                      ['Management & Operations', 'Human Resources & People'],
  'Marketing':                       ['Marketing & Advertising'],
  'Advertising and Public Relations': ['Marketing & Advertising', 'Media & Communications'],

  // Science
  'Biology':                         ['Life Sciences & Research', 'Healthcare & Clinical'],
  'Chemistry':                       ['Life Sciences & Research', 'Physical Sciences & Math'],
  'Biochemistry':                    ['Life Sciences & Research'],
  'Physics':                         ['Physical Sciences & Math'],
  'Environmental Science':           ['Environmental & Sustainability', 'Life Sciences & Research'],
  'Marine Science':                  ['Life Sciences & Research', 'Environmental & Sustainability'],
  'Forensic Science':                ['Life Sciences & Research', 'Legal & Compliance'],

  // Quantitative
  'Mathematics':                     ['Physical Sciences & Math', 'Data Science & Analytics'],
  'Statistics':                      ['Data Science & Analytics', 'Physical Sciences & Math'],

  // Health
  'Nursing':                         ['Healthcare & Clinical'],
  'Health Sciences':                 ['Healthcare & Clinical'],
  'Exercise Science':                ['Healthcare & Clinical'],
  'Kinesiology':                     ['Healthcare & Clinical'],
  'Allied Health':                   ['Healthcare & Clinical'],
  'Public Health':                   ['Healthcare & Clinical', 'Social Sciences & Nonprofit'],

  // Social Science
  'Psychology':                      ['Social Sciences & Nonprofit', 'Human Resources & People'],
  'Sociology':                       ['Social Sciences & Nonprofit'],
  'Political Science':               ['Social Sciences & Nonprofit', 'Economics & Public Policy', 'Legal & Compliance'],
  'Criminal Justice':                ['Legal & Compliance', 'Social Sciences & Nonprofit'],
  'Government and World Affairs':    ['Economics & Public Policy', 'Social Sciences & Nonprofit'],
  'Social Work':                     ['Social Sciences & Nonprofit'],
  'History':                         ['Social Sciences & Nonprofit', 'Education & Teaching'],
  'Philosophy':                      ['Legal & Compliance', 'Social Sciences & Nonprofit'],

  // Humanities
  'English':                         ['Media & Communications', 'Education & Teaching'],
  'Journalism':                      ['Media & Communications'],
  'Communication':                   ['Media & Communications', 'Marketing & Advertising'],
  'Liberal Arts':                    ['Social Sciences & Nonprofit', 'Education & Teaching'],
  'Education':                       ['Education & Teaching'],
  'Theatre Arts':                    ['Design & Creative', 'Media & Communications'],
  'Music':                           ['Design & Creative'],
  'Digital Arts and Design':         ['Design & Creative', 'Marketing & Advertising'],

  // Sport
  'Sport Management':                ['Hospitality & Events', 'Marketing & Advertising'],

  // Engineering
  'Mechanical Engineering':          ['Mechanical & Aerospace Engineering'],
  'Aerospace Engineering':           ['Mechanical & Aerospace Engineering'],
  'Electrical Engineering':          ['Electrical & Computer Engineering'],
  'Computer Engineering':            ['Electrical & Computer Engineering', 'Software Engineering & CS'],
  'Civil Engineering':               ['Civil & Environmental Engineering'],
  'Chemical Engineering':            ['Chemical & Biomedical Engineering'],
  'Biomedical Engineering':          ['Chemical & Biomedical Engineering', 'Healthcare & Clinical'],
  'Industrial Engineering':          ['Industrial & Systems Engineering', 'Management & Operations'],
  'Systems Engineering':             ['Industrial & Systems Engineering'],
  'Environmental Engineering':       ['Civil & Environmental Engineering', 'Environmental & Sustainability'],
  'Materials Science':               ['Chemical & Biomedical Engineering', 'Mechanical & Aerospace Engineering'],
  'Nuclear Engineering':             ['Physical Sciences & Math', 'Mechanical & Aerospace Engineering'],
};

// ── Pre-professional → Cohort override ──────────────────────────────────────

export const PRE_PROF_TO_COHORTS: Record<string, string[]> = {
  'Pre-Med':                    ['Healthcare & Clinical', 'Life Sciences & Research'],
  'Pre-Dental':                 ['Healthcare & Clinical'],
  'Pre-Pharmacy':               ['Healthcare & Clinical', 'Life Sciences & Research'],
  'Pre-Veterinary':             ['Healthcare & Clinical', 'Life Sciences & Research'],
  'Pre-Physical Therapy':       ['Healthcare & Clinical'],
  'Pre-Occupational Therapy':   ['Healthcare & Clinical'],
  'Pre-Physician Assistant':    ['Healthcare & Clinical'],
  'Pre-Law':                    ['Legal & Compliance', 'Economics & Public Policy'],
};

// ── Detect cohorts from user data ───────────────────────────────────────────

export function detectCohorts(
  majors: string[],
  minors: string[],
  preProfessional: string | null,
): string[] {
  const cohorts = new Set<string>();

  // Pre-professional overrides add cohorts (highest priority)
  if (preProfessional && preProfessional !== 'None / Not applicable') {
    const override = PRE_PROF_TO_COHORTS[preProfessional];
    if (override) override.forEach(c => cohorts.add(c));
  }

  // Majors add their cohorts
  for (const major of majors) {
    const mapped = MAJOR_TO_COHORTS[major];
    if (mapped) mapped.forEach(c => cohorts.add(c));
  }

  // Minors add their cohorts (lower priority, still included)
  for (const minor of minors) {
    const mapped = MAJOR_TO_COHORTS[minor];
    if (mapped) mapped.forEach(c => cohorts.add(c));
  }

  // Fallback
  if (cohorts.size === 0) cohorts.add('Management & Operations');

  return Array.from(cohorts);
}

// ── Cohort metadata ─────────────────────────────────────────────────────────

export const COHORT_META: Record<string, {
  label: string;
  description: string;
  emphasis: string;
  color: string;
}> = {
  'Software Engineering & CS': {
    label: 'Software Engineering & CS',
    description: 'Scored against Google, Meta, and Amazon SWE criteria.',
    emphasis: 'Build score carries the most weight (55%).',
    color: '#2B3A8E',
  },
  'Data Science & Analytics': {
    label: 'Data Science & Analytics',
    description: 'Scored against Google, Meta, and top data team criteria.',
    emphasis: 'Build score carries the most weight (45%).',
    color: '#2B3A8E',
  },
  'Cybersecurity & IT': {
    label: 'Cybersecurity & IT',
    description: 'Scored against CrowdStrike, Palo Alto Networks criteria.',
    emphasis: 'Build score carries the most weight (50%).',
    color: '#2B3A8E',
  },
  'Finance & Accounting': {
    label: 'Finance & Accounting',
    description: 'Scored against Goldman Sachs, JP Morgan, Deloitte criteria.',
    emphasis: 'Grit carries the most weight (40%). GPA screens are real.',
    color: '#C9A84C',
  },
  'Marketing & Advertising': {
    label: 'Marketing & Advertising',
    description: 'Scored against WPP, Ogilvy, HubSpot criteria.',
    emphasis: 'Build score carries the most weight (50%).',
    color: '#FF6B8A',
  },
  'Consulting & Strategy': {
    label: 'Consulting & Strategy',
    description: 'Scored against McKinsey, BCG, Bain criteria.',
    emphasis: 'Grit carries the most weight (45%). Highest bar (85).',
    color: '#C9A84C',
  },
  'Management & Operations': {
    label: 'Management & Operations',
    description: 'Scored against Amazon Ops, top supply chain criteria.',
    emphasis: 'Grit carries the most weight (45%).',
    color: '#34C759',
  },
  'Economics & Public Policy': {
    label: 'Economics & Public Policy',
    description: 'Scored against Federal Reserve, Brookings, World Bank criteria.',
    emphasis: 'Smart carries the most weight (40%).',
    color: '#5E5CE6',
  },
  'Entrepreneurship & Innovation': {
    label: 'Entrepreneurship & Innovation',
    description: 'Scored against YC, Techstars, startup criteria.',
    emphasis: 'Build score carries the most weight (55%). GPA irrelevant.',
    color: '#FF9F0A',
  },
  'Healthcare & Clinical': {
    label: 'Healthcare & Clinical',
    description: 'Scored against Mayo Clinic, top hospital criteria.',
    emphasis: 'Grit carries the most weight (40%).',
    color: '#FF453A',
  },
  'Life Sciences & Research': {
    label: 'Life Sciences & Research',
    description: 'Scored against Pfizer, NIH, top biotech criteria.',
    emphasis: 'Smart carries the most weight (40%).',
    color: '#34C759',
  },
  'Physical Sciences & Math': {
    label: 'Physical Sciences & Math',
    description: 'Scored against national labs and research institution criteria.',
    emphasis: 'Smart carries the most weight (50%).',
    color: '#5E5CE6',
  },
  'Social Sciences & Nonprofit': {
    label: 'Social Sciences & Nonprofit',
    description: 'Scored against UNDP, top nonprofit criteria.',
    emphasis: 'Grit carries the most weight (45%).',
    color: '#FF9F0A',
  },
  'Media & Communications': {
    label: 'Media & Communications',
    description: 'Scored against NYT, CNN, top PR agency criteria.',
    emphasis: 'Build score carries the most weight (50%).',
    color: '#FF6B8A',
  },
  'Design & Creative': {
    label: 'Design & Creative',
    description: 'Scored against IDEO, top design agency criteria.',
    emphasis: 'Build score carries the most weight (65%). Portfolio is everything.',
    color: '#FF6B8A',
  },
  'Legal & Compliance': {
    label: 'Legal & Compliance',
    description: 'Scored against Skadden, top law school criteria.',
    emphasis: 'Smart carries the most weight (40%). GPA screens are real.',
    color: '#5E5CE6',
  },
  'Human Resources & People': {
    label: 'Human Resources & People',
    description: 'Scored against SHRM and top HR criteria.',
    emphasis: 'Grit carries the most weight (50%).',
    color: '#34C759',
  },
  'Supply Chain & Logistics': {
    label: 'Supply Chain & Logistics',
    description: 'Scored against Amazon, FedEx, top logistics criteria.',
    emphasis: 'Grit and Build share the weight (40% each).',
    color: '#FF9F0A',
  },
  'Education & Teaching': {
    label: 'Education & Teaching',
    description: 'Scored against TFA, top school district criteria.',
    emphasis: 'Grit carries the most weight (45%).',
    color: '#34C759',
  },
  'Real Estate & Construction': {
    label: 'Real Estate & Construction',
    description: 'Scored against CBRE, top developer criteria.',
    emphasis: 'Grit and Build share the weight (40% each).',
    color: '#FF9F0A',
  },
  'Environmental & Sustainability': {
    label: 'Environmental & Sustainability',
    description: 'Scored against EPA, top sustainability criteria.',
    emphasis: 'Balanced across all three dimensions.',
    color: '#34C759',
  },
  'Hospitality & Events': {
    label: 'Hospitality & Events',
    description: 'Scored against Marriott, top live events criteria.',
    emphasis: 'Grit carries the most weight (50%).',
    color: '#FF9F0A',
  },
  'Mechanical & Aerospace Engineering': {
    label: 'Mechanical & Aerospace Engineering',
    description: 'Scored against Boeing, SpaceX, Tesla criteria.',
    emphasis: 'Build carries the most weight (40%). FE exam and CAD matter.',
    color: '#2B3A8E',
  },
  'Electrical & Computer Engineering': {
    label: 'Electrical & Computer Engineering',
    description: 'Scored against Intel, NVIDIA, Qualcomm criteria.',
    emphasis: 'Build carries the most weight (45%). Hardware portfolio critical.',
    color: '#2B3A8E',
  },
  'Civil & Environmental Engineering': {
    label: 'Civil & Environmental Engineering',
    description: 'Scored against AECOM, Bechtel criteria.',
    emphasis: 'Build carries the most weight (40%). FE exam strongly expected.',
    color: '#34C759',
  },
  'Chemical & Biomedical Engineering': {
    label: 'Chemical & Biomedical Engineering',
    description: 'Scored against Pfizer, Medtronic, Dow criteria.',
    emphasis: 'Smart carries the most weight (40%). Research and lab skills critical.',
    color: '#5E5CE6',
  },
  'Industrial & Systems Engineering': {
    label: 'Industrial & Systems Engineering',
    description: 'Scored against Amazon Ops, GE, Toyota criteria.',
    emphasis: 'Build carries the most weight (40%). Process improvement proof.',
    color: '#FF9F0A',
  },
};

// ── All cohort names (ordered) ──────────────────────────────────────────────

export const ALL_COHORTS = Object.keys(COHORT_META);

// ── Legacy compatibility ────────────────────────────────────────────────────

export function needsIndustryTarget(_cohort: string, _majors: string[]): boolean {
  return false; // No longer needed — industry target is handled by cohort selection
}
