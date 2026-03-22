/**
 * Curated resume tips and quick answers for Career Center.
 * Users get scannable answers without opening Dilly.
 */

export type QuickTip = {
  question: string;
  answer: string;
};

export const QUICK_TIPS: QuickTip[] = [
  {
    question: "When should I add my GPA?",
    answer: "Add GPA if it's 3.5+ or above your school's average. Omit if below 3.0 unless required. Include major GPA if stronger than overall.",
  },
  {
    question: "How should I format dates?",
    answer: "Use Month YYYY (e.g. Jan 2024 to Present). Be consistent across all entries. Avoid 'Present' for roles you've left. Use the actual end date.",
  },
  {
    question: "What do recruiters look at first?",
    answer: "Name, school, and the first 2-3 bullets of your most recent role. They scan for keywords, dates, and quantifiable impact. Lead with your strongest signal.",
  },
  {
    question: "How long should my resume be?",
    answer: "One page for early-career (0-5 years). Two pages only if you have 10+ years or extensive publications/projects. Every line should earn its place.",
  },
  {
    question: "Should I include a summary or objective?",
    answer: "Optional. Use a 1-2 line summary only if you're changing careers or have a clear narrative. Otherwise, let your experience speak first.",
  },
  {
    question: "How do I quantify impact without numbers?",
    answer: "Use scope: team size, audience reach, project duration. Use before/after: 'streamlined process,' 'reduced errors.' Use scale: 'organization-wide,' 'cross-functional.'",
  },
  {
    question: "What order should my sections go in?",
    answer: "Education first for students/recent grads. Experience first for 2+ years in the workforce. Put your strongest section near the top.",
  },
  {
    question: "When to use bullets vs paragraphs?",
    answer: "Bullets for experience and projects (easier to scan). Short paragraphs only for summaries or unique context. 2 to 4 bullets per role is typical.",
  },
];
