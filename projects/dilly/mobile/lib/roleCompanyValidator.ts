/**
 * roleCompanyValidator. client-side only gibberish guard for the
 * role/company inputs on mode-switch.tsx (and anywhere else we let
 * a user type a free-text role or company name).
 *
 * Runs 100% on-device. No network calls, no LLM, no server hit.
 * Spammable with zero cost. Scales to any number of users for free.
 *
 * This won't catch adversarial inputs like 'asdf manager' — a user
 * determined to put garbage in will find a way. It's designed to
 * stop the common accidental garbage ('oeitoighjswogiwsogpih',
 * ')*#&%()*%', 'aaaaaa') without forcing any server traffic.
 *
 * Returns { ok: true } on pass, { ok: false, reason: string } on
 * fail. Reason is copy the caller can show inline under the field.
 */

export type ValidationResult = { ok: true } | { ok: false; reason: string };

// Char set allowed in real role/company names: letters (any
// language, via \p{L}), digits, spaces, and typical punctuation.
// Rejects symbol-only strings like ')*#&%'.
const ALLOWED_CHARS = /^[\p{L}\p{N}\s&.,'()\-/+]+$/u;

// Small set of common English fragments found in real job titles
// and company names. If the input contains any of these (substring
// match, case-insensitive), it's almost certainly real.
const KNOWN_FRAGMENTS = [
  // Role fragments
  'engineer', 'manager', 'developer', 'analyst', 'designer', 'director',
  'consultant', 'accountant', 'lawyer', 'nurse', 'teacher', 'doctor',
  'marketer', 'writer', 'editor', 'scientist', 'researcher', 'banker',
  'trader', 'investor', 'executive', 'specialist', 'coordinator',
  'assistant', 'associate', 'lead', 'senior', 'junior', 'principal',
  'staff', 'intern', 'architect', 'producer', 'operator', 'planner',
  'technician', 'strategist', 'chief', 'head', 'officer', 'president',
  'founder', 'partner', 'owner', 'advisor', 'agent', 'broker', 'dealer',
  'sales', 'marketing', 'product', 'design', 'data', 'software',
  'hardware', 'finance', 'operations', 'human', 'business', 'legal',
  'creative', 'content', 'digital', 'technical', 'technology',
  // Company suffixes / common tokens
  'inc', 'llc', 'corp', 'corporation', 'company', 'co.', 'ltd',
  'group', 'partners', 'holdings', 'bank', 'capital', 'ventures',
  'labs', 'studios', 'media', 'systems', 'solutions', 'services',
  'industries', 'enterprises', 'international', 'global', 'national',
  'technologies', 'telecom', 'health', 'financial', 'securities',
  'insurance', 'realty', 'university', 'college', 'school', 'hospital',
  'clinic', 'foundation', 'institute', 'association', 'society',
];

const VOWELS = /[aeiouy]/i;

function hasVowel(s: string): boolean {
  return VOWELS.test(s);
}

function longestConsonantRun(s: string): number {
  const m = s.toLowerCase().match(/[bcdfghjklmnpqrstvwxyz]+/g);
  if (!m) return 0;
  return Math.max(...m.map(x => x.length));
}

function longestRepeat(s: string): number {
  const m = s.match(/(.)\1+/g);
  if (!m) return 0;
  return Math.max(...m.map(x => x.length));
}

function containsKnownFragment(s: string): boolean {
  const lc = s.toLowerCase();
  return KNOWN_FRAGMENTS.some(f => lc.includes(f));
}

/**
 * Shared baseline check: length + char set + basic sanity.
 * Used by both role and company validators.
 */
function baseline(value: string, kind: 'role' | 'company'): ValidationResult {
  const v = value.trim();
  if (v.length < 2) {
    return { ok: false, reason: `${kind === 'role' ? 'Role' : 'Company'} is too short.` };
  }
  if (v.length > 80) {
    return { ok: false, reason: `Keep the ${kind} under 80 characters.` };
  }
  if (!ALLOWED_CHARS.test(v)) {
    return { ok: false, reason: `That ${kind} has characters that don't belong in a real name.` };
  }
  if (!hasVowel(v)) {
    return { ok: false, reason: `That ${kind} doesn't look right. Did you mistype?` };
  }
  if (longestRepeat(v) > 3) {
    return { ok: false, reason: `That ${kind} has too many repeated characters.` };
  }
  if (longestConsonantRun(v) > 5) {
    return { ok: false, reason: `That ${kind} doesn't look right. Did you mistype?` };
  }
  // All-numeric rejection. A role or company that's just digits is
  // almost never legitimate.
  if (/^\d+$/.test(v)) {
    return { ok: false, reason: `${kind === 'role' ? 'Role' : 'Company'} can't be just numbers.` };
  }
  return { ok: true };
}

/**
 * Validate a role title. In addition to the baseline checks, we
 * require 1-6 space-separated tokens (single letter 'A' rejected,
 * wall-of-text rejected) AND a recognizable fragment in the 3-7
 * word range where a random scramble is unlikely to land.
 */
export function validateRole(value: string): ValidationResult {
  const base = baseline(value, 'role');
  if (!base.ok) return base;
  const v = value.trim();
  const words = v.split(/\s+/).filter(Boolean);
  if (words.length > 6) {
    return { ok: false, reason: 'Keep the role to a few words.' };
  }
  // If it's a short input (1-2 words) AND has no recognizable
  // fragment, flag it. Longer inputs get more benefit of the doubt
  // since real multi-word roles can span niche terminology.
  if (words.length <= 2 && !containsKnownFragment(v)) {
    return { ok: false, reason: "That doesn't look like a real role. Try the full title." };
  }
  return { ok: true };
}

/**
 * Validate a company name. Baseline checks + a looser word-count
 * rule. Companies like 'Inc' are one-token and legitimate; most
 * spam looks like random letter scrambles and the consonant-run /
 * repeat checks catch those.
 */
export function validateCompany(value: string): ValidationResult {
  const base = baseline(value, 'company');
  if (!base.ok) return base;
  const v = value.trim();
  const words = v.split(/\s+/).filter(Boolean);
  if (words.length > 5) {
    return { ok: false, reason: 'Keep the company name to a few words.' };
  }
  // For SINGLE-word companies (e.g. 'Stripe', 'Google'), require
  // either a known fragment OR a length >= 3 with at least one
  // vowel-consonant alternation that looks pronounceable. If the
  // single word passes consonant-run + repeat + allowed-chars, it's
  // almost certainly fine. We don't gate single-word companies on
  // fragment match since most real startups are single made-up words.
  if (words.length === 1 && v.length < 3) {
    return { ok: false, reason: 'That company name is too short.' };
  }
  return { ok: true };
}
