export type StudentProfile = {
  name: string;
  /** Unweighted GPA on 4.0 scale */
  gpaUnweighted: number;
  /** Weighted GPA — often 5.0 cap; optional if your school doesn’t report */
  gpaWeighted?: number;
  /** SAT 400–1600 */
  sat?: number;
  /** ACT 1–36 */
  act?: number;
  /** Selected AP exams (ids from catalog) */
  apCourseIds: string[];
  /**
   * Other advanced work not captured above (IB, dual enrollment, extra AP not listed, etc.).
   * Adds to rigor with AP selections.
   */
  advancedCourses: number;
  /** Quick signal; narrative fields refine this */
  extracurricularStrength: 1 | 2 | 3 | 4 | 5;
  extracurricularsDescription: string;
  workExperienceDescription: string;
  honorsAndAwardsDescription: string;
  /** Anything else: summer programs, circumstances, hooks */
  additionalInfo: string;
  intendedMajor: string;
  homeState?: string;
};

export const DEFAULT_PROFILE: StudentProfile = {
  name: "",
  gpaUnweighted: 3.5,
  advancedCourses: 0,
  apCourseIds: [],
  extracurricularStrength: 3,
  extracurricularsDescription: "",
  workExperienceDescription: "",
  honorsAndAwardsDescription: "",
  additionalInfo: "",
  intendedMajor: "Computer Science",
};
