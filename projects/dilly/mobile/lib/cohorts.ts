export const MAJOR_TO_COHORT: Record<string, string> = {
  'Computer Science': 'Tech',
  'Computer Information Systems': 'Tech',
  'Software Engineering': 'Tech',
  'Cybersecurity': 'Tech',
  'Information Technology': 'Tech',
  'Data Science': 'Tech',
  'Finance': 'Business',
  'Accounting': 'Business',
  'Economics': 'Business',
  'Business Administration': 'Business',
  'International Business': 'Business',
  'Management': 'Business',
  'Marketing': 'Business',
  'Advertising and Public Relations': 'Business',
  'Biology': 'Science',
  'Chemistry': 'Science',
  'Biochemistry': 'Science',
  'Physics': 'Science',
  'Environmental Science': 'Science',
  'Marine Science': 'Science',
  'Forensic Science': 'Science',
  'Mathematics': 'Quantitative',
  'Statistics': 'Quantitative',
  'Nursing': 'Health',
  'Health Sciences': 'Health',
  'Exercise Science': 'Health',
  'Kinesiology': 'Health',
  'Allied Health': 'Health',
  'Public Health': 'Health',
  'Psychology': 'Social Science',
  'Sociology': 'Social Science',
  'Political Science': 'Social Science',
  'Criminal Justice': 'Social Science',
  'Government and World Affairs': 'Social Science',
  'Social Work': 'Social Science',
  'History': 'Social Science',
  'Philosophy': 'Social Science',
  'English': 'Humanities',
  'Journalism': 'Humanities',
  'Communication': 'Humanities',
  'Liberal Arts': 'Humanities',
  'Education': 'Humanities',
  'Theatre Arts': 'Humanities',
  'Music': 'Humanities',
  'Digital Arts and Design': 'Humanities',
  'Sport Management': 'Sport',
};

export const PRE_PROF_TO_COHORT: Record<string, string> = {
  'Pre-Med': 'Pre-Health',
  'Pre-Dental': 'Pre-Health',
  'Pre-Pharmacy': 'Pre-Health',
  'Pre-Veterinary': 'Pre-Health',
  'Pre-Physical Therapy': 'Pre-Health',
  'Pre-Occupational Therapy': 'Pre-Health',
  'Pre-Physician Assistant': 'Pre-Health',
  'Pre-Law': 'Pre-Law',
};

export function detectCohort(majors: string[], preProfessional: string | null): string {
  if (preProfessional && preProfessional !== 'None / Not applicable') {
    const override = PRE_PROF_TO_COHORT[preProfessional];
    if (override) return override;
  }
  for (const major of majors) {
    const cohort = MAJOR_TO_COHORT[major];
    if (cohort) return cohort;
  }
  return 'General';
}

export function needsIndustryTarget(cohort: string, majors: string[]): boolean {
  if (cohort === 'Quantitative') return true;
  if (majors.includes('Data Science') && cohort === 'Tech') return true;
  return false;
}

export const COHORT_COPY: Record<string, { label: string; description: string; emphasis: string }> = {
  Tech: { label: 'Tech cohort', description: 'Scored against Google, Meta, and Amazon criteria.', emphasis: 'Build score carries the most weight.' },
  Business: { label: 'Business cohort', description: 'Scored against Goldman Sachs, Deloitte, and JP Morgan criteria.', emphasis: 'Grit score carries the most weight.' },
  Science: { label: 'Science cohort', description: 'Scored against NIH, top biotech, and research lab criteria.', emphasis: 'Smart score carries the most weight.' },
  Quantitative: { label: 'Quantitative cohort', description: 'Scored against top quant and analytical employer criteria.', emphasis: "You'll choose your target industry next." },
  Health: { label: 'Health & Movement cohort', description: 'Scored against top hospital and healthcare employer criteria.', emphasis: 'Grit score carries the most weight.' },
  'Social Science': { label: 'Social Science cohort', description: 'Scored against top consulting, government, and nonprofit criteria.', emphasis: 'Grit score carries the most weight.' },
  Humanities: { label: 'Humanities & Communication cohort', description: 'Scored against top media, publishing, and education employer criteria.', emphasis: 'Build portfolio carries the most weight.' },
  Sport: { label: 'Sport & Recreation cohort', description: 'Scored against ESPN, top sports agencies, and league criteria.', emphasis: 'Grit score carries the most weight.' },
  'Pre-Health': { label: 'Pre-Health track', description: 'Scored against Mayo Clinic, top med school, and clinical program criteria.', emphasis: 'Smart score carries the most weight.' },
  'Pre-Law': { label: 'Pre-Law track', description: 'Scored against Skadden, top law school, and legal employer criteria.', emphasis: 'Smart score carries the most weight.' },
  General: { label: 'General cohort', description: 'Scored against top employer criteria across industries.', emphasis: 'All three dimensions are equally weighted.' },
};
