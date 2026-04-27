/**
 * Per-user_path overrides for the profile STRENGTH_CATEGORIES grid.
 *
 * The backend memory_extraction only writes to a fixed set of
 * ~25 canonical categories. Rather than balloon that list with
 * path-specific buckets (which would sprawl extraction logic), we
 * do a PRESENTATION-LAYER remap: the facts still live under the
 * canonical categories, but the LABEL + ICON + COLOR shown in the
 * profile grid adapts to the user's path.
 *
 * Example: a veteran's 'life_context' tile reads "Service & Mission"
 * with a military-style icon. An ex_founder's 'project_detail' tile
 * reads "Company You Built" with a rocket icon. Same underlying
 * facts - the surface just reflects who the user is.
 *
 * Empty override for a path means use the default. Unknown paths
 * fall through to the default. Callers merge this into the base
 * STRENGTH_CATEGORIES config at render time.
 *
 * Zero LLM cost. Pure static map.
 */

export interface CategoryOverride {
  label?: string;
  icon?: string;
  color?: string;
}

export type PathOverrides = Record<string, CategoryOverride>;

const PATH_CATEGORY_OVERRIDES: Record<string, PathOverrides> = {
  // No job-hunting energy. They're navigating growth + protection.
  i_have_a_job: {
    achievement:          { label: 'Wins At Work' },
    target_company:       { label: 'Lateral Targets' },
    goal:                 { label: 'Next Rung' },
    weakness:             { label: 'Growth Edges' },
    challenge:            { label: 'At-Work Friction' },
  },

  // Widen-before-narrow posture. Language of experiments not targets.
  exploring: {
    target_company:       { label: 'Worth Exploring' },
    project_detail:       { label: 'Experiments' },
    goal:                 { label: 'Curiosities' },
  },

  student: {
    project_detail:       { label: 'Coursework & Projects' },
    target_company:       { label: 'Companies On Your List' },
    goal:                 { label: 'What You\'re Aiming At' },
  },

  // Visa + timing surface up front. These aren't hidden.
  international_grad: {
    availability:         { label: 'Timing & Status',      icon: 'time' },
    life_context:         { label: 'Home Country Context', icon: 'globe' },
    target_company:       { label: 'Sponsoring Employers' },
  },

  // Proof-of-work > paper credentials.
  dropout: {
    achievement:          { label: 'Proof Of Work' },
    project_detail:       { label: 'Things You\'ve Shipped' },
    skill_unlisted:       { label: 'Self-Taught Skills' },
    weakness:             { label: 'Gaps You\'re Closing' },
  },

  // Calm, grounded. Depth over hustle.
  senior_reset: {
    strength:             { label: 'Depth',            icon: 'library' },
    achievement:          { label: 'Career Highlights' },
    life_context:         { label: 'Where You Are Now' },
    challenge:            { label: 'What\'s Heavy Right Now' },
    goal:                 { label: 'Next Arc' },
  },

  career_switch: {
    skill_unlisted:       { label: 'Transferable Skills' },
    achievement:          { label: 'Old-Field Wins' },
    goal:                 { label: 'Bridge Role' },
    motivation:           { label: 'Why The Switch' },
  },

  // Name the unwritten rules. No insider shorthand.
  first_gen_college: {
    achievement:          { label: 'Your Firsts',         icon: 'ribbon' },
    motivation:           { label: 'Why You Chose This' },
    life_context:         { label: 'Where You\'re From' },
    challenge:            { label: 'The Rules No One Explained' },
  },

  // Don't over-validate. Name it once, move.
  parent_returning: {
    life_context:         { label: 'Return Arc',         icon: 'home' },
    achievement:          { label: 'What Stayed Sharp' },
    skill_unlisted:       { label: 'Skills The Gap Didn\'t Touch' },
    challenge:            { label: 'What\'s Rebuilding' },
  },

  veteran: {
    achievement:          { label: 'Service Record',     icon: 'shield' },
    life_context:         { label: 'Service & Mission',  icon: 'medal' },
    skill_unlisted:       { label: 'Translated Skills' },
    strength:             { label: 'Leadership Reps' },
  },

  trades_to_white_collar: {
    achievement:          { label: 'Jobs You\'ve Run' },
    skill_unlisted:       { label: 'Skills That Transfer' },
    project_detail:       { label: 'Projects You Managed' },
  },

  // Direct, practical, respect their time. No moralizing.
  formerly_incarcerated: {
    achievement:          { label: 'What You\'ve Built' },
    skill_unlisted:       { label: 'Skills You Have Now' },
    goal:                 { label: 'Next Rung' },
    life_context:         { label: 'Where You Are Now' },
  },

  neurodivergent: {
    strength:             { label: 'Pattern Recognition' },
    company_culture_pref: { label: 'Work Rhythm That Fits',  icon: 'pulse' },
    weakness:             { label: 'What Drains You' },
    personality:          { label: 'How You Think' },
  },

  disabled_professional: {
    company_culture_pref: { label: 'Access Fit',             icon: 'accessibility' },
    achievement:          { label: 'What You\'ve Delivered' },
    challenge:            { label: 'What Workplaces Get Wrong' },
  },

  lgbtq: {
    company_culture_pref: { label: 'Culture Fit',            icon: 'heart-circle' },
    target_company:       { label: 'Inclusive Employers' },
  },

  rural_remote_only: {
    preference:           { label: 'How You Want To Work',   icon: 'map' },
    target_company:       { label: 'Remote-First Employers' },
    life_context:         { label: 'Where You\'re Based' },
  },

  refugee: {
    life_context:         { label: 'Home Country Experience', icon: 'earth' },
    achievement:          { label: 'Career Before Here' },
    skill_unlisted:       { label: 'Skills That Traveled' },
    challenge:            { label: 'Credentialing & Recognition' },
  },

  ex_founder: {
    project_detail:       { label: 'Company You Built',      icon: 'rocket' },
    achievement:          { label: 'Traction & Wins' },
    skill_unlisted:       { label: 'Founder-Scale Skills' },
    goal:                 { label: 'Post-Founder Arc' },
  },
};


/** Return the override map for the given user_path. Empty object if
 *  no overrides defined for that path (callers should fall through
 *  to the default STRENGTH_CATEGORIES config). */
export function overridesForPath(path: string | null | undefined): PathOverrides {
  if (!path || typeof path !== 'string') return {};
  return PATH_CATEGORY_OVERRIDES[path.trim().toLowerCase()] || {};
}


/** Merge path overrides into the base STRENGTH_CATEGORIES config.
 *  The caller passes its own base map; we return a new object with
 *  the path-specific label / icon / color fields overlaid.
 *  Preserves category ORDER from the base config. Categories the
 *  path doesn't override pass through untouched. */
export function applyPathOverrides<T extends { label: string; icon: string; color: string }>(
  base: Record<string, T>,
  path: string | null | undefined,
): Record<string, T> {
  const overrides = overridesForPath(path);
  if (Object.keys(overrides).length === 0) return base;
  const out: Record<string, T> = {};
  for (const key of Object.keys(base)) {
    const o = overrides[key];
    if (!o) { out[key] = base[key]; continue; }
    out[key] = {
      ...base[key],
      ...(o.label ? { label: o.label } : {}),
      ...(o.icon  ? { icon:  o.icon  } : {}),
      ...(o.color ? { color: o.color } : {}),
    };
  }
  return out;
}
