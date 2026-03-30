/**
 * Onboarding constants — majors, cohort mappings, interests, industry targets.
 * Mirrors mobile/constants/majors.ts and mobile/app/onboarding/profile.tsx.
 */

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
];

export const PRE_PROF_OPTIONS = [
  "Pre-Med", "Pre-Dental", "Pre-Pharmacy", "Pre-Veterinary",
  "Pre-Physical Therapy", "Pre-Occupational Therapy", "Pre-Physician Assistant",
  "Pre-Law", "None / Not applicable",
];

export const TARGET_OPTIONS = [
  { key: "internship_summer", label: "Internship \u00b7 Summer 2026", apiValue: "internship" },
  { key: "internship_fall", label: "Internship \u00b7 Fall 2026", apiValue: "internship" },
  { key: "full_time", label: "Full-time job", apiValue: "full_time" },
  { key: "exploring", label: "Just exploring", apiValue: "exploring" },
];

export const MAJOR_TO_COHORT: Record<string, string> = {
  "Computer Science": "Tech", "Computer Information Systems": "Tech",
  "Software Engineering": "Tech", Cybersecurity: "Tech",
  "Information Technology": "Tech", "Data Science": "Tech",
  Finance: "Business", Accounting: "Business", Economics: "Business",
  "Business Administration": "Business", "International Business": "Business",
  Management: "Business", Marketing: "Business", "Advertising and Public Relations": "Business",
  Biology: "Science", Chemistry: "Science", Biochemistry: "Science",
  Physics: "Science", "Environmental Science": "Science",
  "Marine Science": "Science", "Forensic Science": "Science",
  Mathematics: "Quantitative", Statistics: "Quantitative",
  Nursing: "Health", "Health Sciences": "Health", "Exercise Science": "Health",
  Kinesiology: "Health", "Allied Health": "Health", "Public Health": "Health",
  Psychology: "Social Science", Sociology: "Social Science",
  "Political Science": "Social Science", "Criminal Justice": "Social Science",
  "Government and World Affairs": "Social Science", "Social Work": "Social Science",
  History: "Social Science", Philosophy: "Social Science",
  English: "Humanities", Journalism: "Humanities", Communication: "Humanities",
  "Liberal Arts": "Humanities", Education: "Humanities",
  "Theatre Arts": "Humanities", Music: "Humanities", "Digital Arts and Design": "Humanities",
  "Sport Management": "Sport",
};

export const PRE_PROF_TO_COHORT: Record<string, string> = {
  "Pre-Med": "Pre-Health", "Pre-Dental": "Pre-Health", "Pre-Pharmacy": "Pre-Health",
  "Pre-Veterinary": "Pre-Health", "Pre-Physical Therapy": "Pre-Health",
  "Pre-Occupational Therapy": "Pre-Health", "Pre-Physician Assistant": "Pre-Health",
  "Pre-Law": "Pre-Law",
};

export const COHORT_COPY: Record<string, { label: string; description: string; emphasis: string }> = {
  Tech: { label: "Tech cohort", description: "Dilly scores you against Google, Meta, and Amazon criteria.", emphasis: "Your Build score carries the most weight." },
  Business: { label: "Business cohort", description: "Dilly scores you against Goldman Sachs, Deloitte, and JP Morgan criteria.", emphasis: "Your Grit score carries the most weight." },
  Science: { label: "Science cohort", description: "Dilly scores you against NIH, top biotech, and research lab criteria.", emphasis: "Your Smart score carries the most weight." },
  Quantitative: { label: "Quantitative cohort", description: "Dilly scores you against top quant and analytical employer criteria.", emphasis: "You\u2019ll choose your target industry next." },
  Health: { label: "Health & Movement cohort", description: "Dilly scores you against top hospital and healthcare employer criteria.", emphasis: "Your Grit score carries the most weight." },
  "Social Science": { label: "Social Science cohort", description: "Dilly scores you against top consulting, government, and nonprofit criteria.", emphasis: "Your Grit score carries the most weight." },
  Humanities: { label: "Humanities & Communication cohort", description: "Dilly scores you against top media, publishing, and education criteria.", emphasis: "Your Build portfolio carries the most weight." },
  Sport: { label: "Sport & Recreation cohort", description: "Dilly scores you against ESPN, top sports agencies, and league criteria.", emphasis: "Your Grit score carries the most weight." },
  "Pre-Health": { label: "Pre-Health track", description: "Dilly scores you against Mayo Clinic, top med school, and clinical criteria.", emphasis: "Your Smart score carries the most weight." },
  "Pre-Law": { label: "Pre-Law track", description: "Dilly scores you against Skadden, top law school, and legal employer criteria.", emphasis: "Your Smart score carries the most weight." },
  General: { label: "General cohort", description: "Dilly scores you against top employer criteria across industries.", emphasis: "All three dimensions are equally weighted." },
};

export const INTERESTS_LIST = [
  "Software Engineering & CS", "Data Science & Analytics", "Cybersecurity & IT",
  "Electrical & Computer Engineering", "Mechanical & Aerospace Engineering",
  "Civil & Environmental Engineering", "Chemical & Biomedical Engineering",
  "Finance & Accounting", "Consulting & Strategy", "Marketing & Advertising",
  "Management & Operations", "Entrepreneurship & Innovation", "Economics & Public Policy",
  "Healthcare & Clinical", "Biotech & Pharmaceutical", "Life Sciences & Research",
  "Physical Sciences & Math", "Law & Government", "Media & Communications",
  "Design & Creative Arts", "Education & Human Development", "Social Sciences & Nonprofit",
];

export const INDUSTRY_TARGET_OPTIONS_QUANT = [
  { key: "finance_quant", label: "Finance & Quant Trading" },
  { key: "tech_data", label: "Tech & Data Science" },
  { key: "actuarial", label: "Actuarial & Insurance" },
  { key: "research", label: "Research & Academia" },
  { key: "not_sure", label: "Not sure yet" },
];

export const INDUSTRY_TARGET_OPTIONS_DATA = [
  { key: "tech", label: "Tech companies" },
  { key: "finance_quant", label: "Finance & Quant" },
  { key: "healthcare_bio", label: "Healthcare & Biotech" },
  { key: "not_sure", label: "Not sure yet" },
];

export function detectCohort(majors: string[], preProf: string | null): string {
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

export function needsIndustryTarget(cohort: string, majors: string[]): boolean {
  return cohort === "Quantitative" || majors.includes("Data Science");
}
