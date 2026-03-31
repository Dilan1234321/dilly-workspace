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

  // Engineering
  'Mechanical Engineering':          ['Mechanical & Aerospace Engineering'],
  'Aerospace Engineering':           ['Mechanical & Aerospace Engineering'],
  'Aeronautical Engineering':        ['Mechanical & Aerospace Engineering'],
  'Mechanical and Aerospace Engineering': ['Mechanical & Aerospace Engineering'],
  'Electrical Engineering':          ['Electrical & Computer Engineering'],
  'Computer Engineering':            ['Electrical & Computer Engineering', 'Software Engineering & CS'],
  'Electrical and Computer Engineering': ['Electrical & Computer Engineering'],
  'Civil Engineering':               ['Civil & Environmental Engineering'],
  'Structural Engineering':          ['Civil & Environmental Engineering'],
  'Construction Engineering':        ['Civil & Environmental Engineering'],
  'Environmental Engineering':       ['Civil & Environmental Engineering', 'Environmental & Sustainability'],
  'Chemical Engineering':            ['Chemical & Biomedical Engineering'],
  'Biomedical Engineering':          ['Chemical & Biomedical Engineering', 'Healthcare & Clinical'],
  'Bioengineering':                  ['Chemical & Biomedical Engineering'],
  'Biomolecular Engineering':        ['Chemical & Biomedical Engineering'],
  'Materials Science':               ['Chemical & Biomedical Engineering', 'Mechanical & Aerospace Engineering'],
  'Industrial Engineering':          ['Industrial & Systems Engineering', 'Management & Operations'],
  'Systems Engineering':             ['Industrial & Systems Engineering'],
  'Operations Research':             ['Industrial & Systems Engineering'],
  'Nuclear Engineering':             ['Physical Sciences & Math', 'Mechanical & Aerospace Engineering'],

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
  'Forensic Science':                ['Criminal Justice & Public Safety', 'Life Sciences & Research'],

  // Quantitative
  'Mathematics':                     ['Physical Sciences & Math', 'Data Science & Analytics'],
  'Statistics':                      ['Data Science & Analytics', 'Physical Sciences & Math'],

  // Health
  'Nursing':                         ['Nursing & Patient Care'],
  'Health Sciences':                 ['Nursing & Patient Care', 'Healthcare & Clinical'],
  'Exercise Science':                ['Healthcare & Clinical'],
  'Kinesiology':                     ['Healthcare & Clinical'],
  'Allied Health':                   ['Healthcare & Clinical'],
  'Public Health':                   ['Healthcare & Clinical', 'Social Sciences & Nonprofit'],

  // Social Science
  'Psychology':                      ['Social Sciences & Nonprofit', 'Human Resources & People'],
  'Sociology':                       ['Social Sciences & Nonprofit'],
  'Political Science':               ['Social Sciences & Nonprofit', 'Economics & Public Policy', 'Legal & Compliance'],
  'Criminal Justice':                ['Criminal Justice & Public Safety', 'Legal & Compliance'],
  'Government and World Affairs':    ['Economics & Public Policy', 'Social Sciences & Nonprofit'],
  'Social Work':                     ['Social Sciences & Nonprofit', 'Nursing & Patient Care'],
  'History':                         ['Social Sciences & Nonprofit', 'Education & Teaching'],
  'Philosophy':                      ['Legal & Compliance', 'Social Sciences & Nonprofit'],

  // Humanities
  'English':                         ['Media & Communications', 'Education & Teaching'],
  'Journalism':                      ['Journalism & Broadcasting', 'Media & Communications'],
  'Communication':                   ['Media & Communications', 'Marketing & Advertising'],
  'Liberal Arts':                    ['Social Sciences & Nonprofit', 'Education & Teaching'],
  'Education':                       ['Education & Teaching'],
  'Theatre Arts':                    ['Performing Arts & Film', 'Design & Creative'],
  'Music':                           ['Performing Arts & Film'],
  'Digital Arts and Design':         ['Design & Creative', 'Marketing & Advertising'],

  // Sport
  'Sport Management':                ['Hospitality & Events', 'Marketing & Advertising'],

  // Agriculture & Food
  'Agriculture':                     ['Agriculture & Food Science'],
  'Agribusiness':                    ['Agriculture & Food Science', 'Management & Operations'],
  'Agricultural Economics':          ['Agriculture & Food Science', 'Economics & Public Policy'],
  'Agronomy':                        ['Agriculture & Food Science'],
  'Animal Science':                  ['Veterinary & Animal Science', 'Agriculture & Food Science'],
  'Food Science':                    ['Agriculture & Food Science', 'Chemical & Biomedical Engineering'],
  'Horticulture':                    ['Agriculture & Food Science', 'Environmental & Sustainability'],
  'Natural Resources':               ['Environmental & Sustainability', 'Agriculture & Food Science'],
  'Forestry':                        ['Environmental & Sustainability'],
  'Wildlife Management':             ['Environmental & Sustainability', 'Life Sciences & Research'],

  // Architecture
  'Architecture':                    ['Architecture & Urban Planning'],
  'Landscape Architecture':          ['Architecture & Urban Planning', 'Environmental & Sustainability'],
  'Urban Planning':                  ['Architecture & Urban Planning', 'Public Administration & Government'],
  'Interior Architecture':           ['Architecture & Urban Planning', 'Design & Creative'],
  'Interior Design':                 ['Design & Creative', 'Architecture & Urban Planning'],

  // Performing Arts & Film
  'Dance':                           ['Performing Arts & Film'],
  'Music Performance':               ['Performing Arts & Film'],
  'Film':                            ['Performing Arts & Film', 'Media & Communications'],
  'Cinema':                          ['Performing Arts & Film', 'Media & Communications'],
  'Film Production':                 ['Performing Arts & Film'],
  'Acting':                          ['Performing Arts & Film'],
  'Musical Theatre':                 ['Performing Arts & Film'],
  'Music Composition':               ['Performing Arts & Film'],
  'Music Education':                 ['Performing Arts & Film', 'Education & Teaching'],
  'Photography':                     ['Design & Creative', 'Performing Arts & Film'],

  // Languages & Linguistics
  'Linguistics':                     ['Foreign Languages & Linguistics'],
  'French':                          ['Foreign Languages & Linguistics'],
  'Spanish':                         ['Foreign Languages & Linguistics'],
  'German':                          ['Foreign Languages & Linguistics'],
  'Chinese':                         ['Foreign Languages & Linguistics'],
  'Japanese':                        ['Foreign Languages & Linguistics'],
  'Arabic':                          ['Foreign Languages & Linguistics'],
  'Russian':                         ['Foreign Languages & Linguistics'],
  'Italian':                         ['Foreign Languages & Linguistics'],
  'Portuguese':                      ['Foreign Languages & Linguistics'],
  'Korean':                          ['Foreign Languages & Linguistics'],
  'American Sign Language':          ['Foreign Languages & Linguistics'],
  'Comparative Literature':          ['Foreign Languages & Linguistics', 'Media & Communications'],
  'Translation':                     ['Foreign Languages & Linguistics'],
  'Classics':                        ['Foreign Languages & Linguistics', 'Education & Teaching'],

  // Religious Studies
  'Religious Studies':               ['Religious Studies & Ministry', 'Social Sciences & Nonprofit'],
  'Theology':                        ['Religious Studies & Ministry'],
  'Divinity':                        ['Religious Studies & Ministry'],
  'Biblical Studies':                ['Religious Studies & Ministry'],
  'Ministry':                        ['Religious Studies & Ministry'],
  'Pastoral Studies':                ['Religious Studies & Ministry'],

  // Aviation
  'Aviation':                        ['Aviation & Transportation'],
  'Aviation Management':             ['Aviation & Transportation', 'Management & Operations'],
  'Aeronautics':                     ['Aviation & Transportation', 'Mechanical & Aerospace Engineering'],
  'Air Traffic Management':          ['Aviation & Transportation'],
  'Flight Science':                  ['Aviation & Transportation'],

  // Criminal Justice & Public Safety
  'Criminology':                     ['Criminal Justice & Public Safety', 'Social Sciences & Nonprofit'],
  'Fire Science':                    ['Criminal Justice & Public Safety'],
  'Homeland Security':               ['Criminal Justice & Public Safety', 'Public Administration & Government'],
  'Emergency Management':            ['Criminal Justice & Public Safety', 'Public Administration & Government'],
  'Corrections':                     ['Criminal Justice & Public Safety'],

  // Library & Information Science
  'Library Science':                 ['Library & Information Science'],
  'Information Science':             ['Library & Information Science', 'Cybersecurity & IT'],
  'Archival Studies':                ['Library & Information Science'],

  // Culinary
  'Culinary Arts':                   ['Culinary Arts & Food Service'],
  'Baking and Pastry':               ['Culinary Arts & Food Service'],
  'Food Service Management':         ['Culinary Arts & Food Service', 'Hospitality & Events'],
  'Restaurant Management':           ['Culinary Arts & Food Service', 'Hospitality & Events'],

  // Fashion
  'Fashion Design':                  ['Fashion & Apparel', 'Design & Creative'],
  'Fashion Merchandising':           ['Fashion & Apparel', 'Marketing & Advertising'],
  'Textile Design':                  ['Fashion & Apparel', 'Design & Creative'],
  'Apparel Design':                  ['Fashion & Apparel'],

  // Journalism
  'Broadcast Journalism':            ['Journalism & Broadcasting'],
  'Investigative Journalism':        ['Journalism & Broadcasting'],
  'Sports Journalism':               ['Journalism & Broadcasting', 'Hospitality & Events'],
  'Photojournalism':                 ['Journalism & Broadcasting', 'Design & Creative'],

  // Public Administration
  'Public Administration':           ['Public Administration & Government'],
  'Public Policy':                   ['Public Administration & Government', 'Economics & Public Policy'],
  'Government':                      ['Public Administration & Government', 'Economics & Public Policy'],
  'International Affairs':           ['Public Administration & Government', 'Economics & Public Policy'],
  'Diplomacy':                       ['Public Administration & Government', 'Foreign Languages & Linguistics'],
  'Nonprofit Management':            ['Public Administration & Government', 'Social Sciences & Nonprofit'],

  // Veterinary & Animal
  'Veterinary Science':              ['Veterinary & Animal Science'],
  'Veterinary Technology':           ['Veterinary & Animal Science'],
  'Equine Science':                  ['Veterinary & Animal Science', 'Agriculture & Food Science'],
  'Zoology':                         ['Veterinary & Animal Science', 'Life Sciences & Research'],

  // Pharmacy
  'Pharmacy':                        ['Pharmacy & Pharmaceutical Science'],
  'Pharmaceutical Science':          ['Pharmacy & Pharmaceutical Science', 'Chemical & Biomedical Engineering'],
  'Pharmacology':                    ['Pharmacy & Pharmaceutical Science', 'Life Sciences & Research'],

  // Nursing
  'Registered Nursing':              ['Nursing & Patient Care'],
  'Nursing Administration':          ['Nursing & Patient Care', 'Healthcare & Clinical'],
  'Nurse Practitioner':              ['Nursing & Patient Care'],

  // Dental
  'Dental Hygiene':                  ['Dental & Oral Health'],
  'Dental Science':                  ['Dental & Oral Health'],
  'Oral Biology':                    ['Dental & Oral Health', 'Life Sciences & Research'],

  // Additional mappings for existing majors that were too narrow
  'Anthropology':                    ['Social Sciences & Nonprofit'],
  'Geography':                       ['Social Sciences & Nonprofit', 'Environmental & Sustainability'],
  'Urban Studies':                   ['Public Administration & Government', 'Social Sciences & Nonprofit'],
  'International Relations':         ['Public Administration & Government', 'Economics & Public Policy'],
  'Graphic Design':                  ['Design & Creative', 'Marketing & Advertising'],
  'Art History':                     ['Design & Creative', 'Education & Teaching'],
  'Fine Arts':                       ['Design & Creative', 'Performing Arts & Film'],
  'Studio Art':                      ['Design & Creative'],
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
  'Agriculture & Food Science': {
    label: 'Agriculture & Food Science',
    description: 'Scored against Cargill, USDA, Bayer Crop Science criteria.',
    emphasis: 'Balanced Smart and Build (30/35 each).',
    color: '#34C759',
  },
  'Architecture & Urban Planning': {
    label: 'Architecture & Urban Planning',
    description: 'Scored against Gensler, SOM, AECOM criteria.',
    emphasis: 'Build carries the most weight (50%). Portfolio is critical.',
    color: '#2B3A8E',
  },
  'Performing Arts & Film': {
    label: 'Performing Arts & Film',
    description: 'Scored against Netflix, Disney, Broadway criteria.',
    emphasis: 'Build carries the most weight (60%). Reel/portfolio is everything.',
    color: '#FF6B8A',
  },
  'Foreign Languages & Linguistics': {
    label: 'Foreign Languages & Linguistics',
    description: 'Scored against State Dept, UN, international org criteria.',
    emphasis: 'Balanced across all three dimensions.',
    color: '#5E5CE6',
  },
  'Religious Studies & Ministry': {
    label: 'Religious Studies & Ministry',
    description: 'Scored against seminary and chaplaincy criteria.',
    emphasis: 'Grit carries the most weight (45%).',
    color: '#FF9F0A',
  },
  'Aviation & Transportation': {
    label: 'Aviation & Transportation',
    description: 'Scored against Delta, United, FAA criteria.',
    emphasis: 'Build carries the most weight (45%). Certifications critical.',
    color: '#2B3A8E',
  },
  'Criminal Justice & Public Safety': {
    label: 'Criminal Justice & Public Safety',
    description: 'Scored against FBI, DEA, law enforcement criteria.',
    emphasis: 'Grit carries the most weight (45%).',
    color: '#FF453A',
  },
  'Library & Information Science': {
    label: 'Library & Information Science',
    description: 'Scored against Library of Congress, academic library criteria.',
    emphasis: 'Balanced Smart and Build (35 each).',
    color: '#5E5CE6',
  },
  'Culinary Arts & Food Service': {
    label: 'Culinary Arts & Food Service',
    description: 'Scored against CIA, Michelin restaurant criteria.',
    emphasis: 'Build carries the most weight (50%). Kitchen experience critical.',
    color: '#FF9F0A',
  },
  'Fashion & Apparel': {
    label: 'Fashion & Apparel',
    description: 'Scored against LVMH, Nike, Vogue criteria.',
    emphasis: 'Build carries the most weight (60%). Portfolio is everything.',
    color: '#FF6B8A',
  },
  'Journalism & Broadcasting': {
    label: 'Journalism & Broadcasting',
    description: 'Scored against NYT, WSJ, CNN, NPR criteria.',
    emphasis: 'Build carries the most weight (45%). Published clips required.',
    color: '#FF6B8A',
  },
  'Public Administration & Government': {
    label: 'Public Administration & Government',
    description: 'Scored against federal agency, state government criteria.',
    emphasis: 'Grit carries the most weight (40%).',
    color: '#5E5CE6',
  },
  'Veterinary & Animal Science': {
    label: 'Veterinary & Animal Science',
    description: 'Scored against top vet school, USDA APHIS criteria.',
    emphasis: 'Smart carries the most weight (40%). GPA screens are real.',
    color: '#34C759',
  },
  'Pharmacy & Pharmaceutical Science': {
    label: 'Pharmacy & Pharmaceutical Science',
    description: 'Scored against CVS Health, Pfizer, FDA criteria.',
    emphasis: 'Smart carries the most weight (45%). PCAT prep matters.',
    color: '#5E5CE6',
  },
  'Nursing & Patient Care': {
    label: 'Nursing & Patient Care',
    description: 'Scored against Mayo Clinic, Cleveland Clinic criteria.',
    emphasis: 'Grit carries the most weight (40%). Clinical hours critical.',
    color: '#FF453A',
  },
  'Dental & Oral Health': {
    label: 'Dental & Oral Health',
    description: 'Scored against top dental school criteria.',
    emphasis: 'Smart carries the most weight (40%). DAT prep matters.',
    color: '#5E5CE6',
  },
};

// ── All cohort names (ordered) ──────────────────────────────────────────────

export const ALL_COHORTS = Object.keys(COHORT_META);

// ── Legacy compatibility ────────────────────────────────────────────────────

export function needsIndustryTarget(_cohort: string, _majors: string[]): boolean {
  return false; // No longer needed — industry target is handled by cohort selection
}
