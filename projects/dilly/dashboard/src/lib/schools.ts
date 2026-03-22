/**
 * School-specific config for Dilly. Each school gets its own UI theme and copy
 * so the app feels like "their" campus. Add new schools here when scaling.
 */

export type SchoolId = "utampa" | string;

export type SchoolTheme = {
  /** Primary brand color (buttons, key accents) */
  primary: string;
  /** Secondary accent (highlights, badges) */
  secondary: string;
  /** Optional dark background tint for header/footer */
  backgroundTint?: string;
  /** Text color on primary (e.g. white on red). Fallback: #0f172a */
  primaryContrast?: string;
};

/** Dilly base theme: logo-aligned, taupe/beige on dark grey */
export const DILLY_BASE_THEME: SchoolTheme = {
  primary: "#c9a882",
  secondary: "#b3a79d",
  backgroundTint: "#2a2a2a",
  primaryContrast: "#0f172a",
};

export type SchoolConfig = {
  id: SchoolId;
  name: string;
  shortName: string;
  /** Email domains that map to this school (lowercase, no @) */
  domains: string[];
  theme: SchoolTheme;
  /** Tagline under hero, school-specific */
  tagline: string;
  /** City for job location filtering (e.g. "Tampa") */
  city?: string;
  /** State for job location filtering (e.g. "FL") */
  state?: string;
};

/** Supported schools. Only UT for now; add more when scaling. */
export const SCHOOLS: SchoolConfig[] = [
  {
    id: "utampa",
    name: "University of Tampa",
    shortName: "UT",
    domains: ["spartans.ut.edu"],
    city: "Tampa",
    state: "FL",
    theme: {
      primary: "#C8102E",   // UT Red
      secondary: "#FFCD00", // UT Golden Yellow
      backgroundTint: "#0f172a",
      primaryContrast: "#ffffff",
    },
    tagline: "Your last check before you apply. Run Dilly before every Handshake submission.",
  },
];

const DOMAIN_TO_SCHOOL = new Map<string, SchoolConfig>();
for (const school of SCHOOLS) {
  for (const d of school.domains) {
    DOMAIN_TO_SCHOOL.set(d.toLowerCase(), school);
  }
}

/**
 * Parse an email and return the school config if the domain is supported.
 * Expects .edu or known university domains. Returns null if not supported.
 */
export function getSchoolFromEmail(email: string): SchoolConfig | null {
  const trimmed = (email || "").trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  const domain = trimmed.split("@")[1]?.toLowerCase() || "";
  return DOMAIN_TO_SCHOOL.get(domain) ?? null;
}

/**
 * Check if the email looks like a valid .edu (or known school) email.
 */
export function isValidEduEmail(email: string): boolean {
  const trimmed = (email || "").trim().toLowerCase();
  if (!trimmed) return false;
  const domain = trimmed.split("@")[1]?.toLowerCase() || "";
  return domain.endsWith(".edu") || DOMAIN_TO_SCHOOL.has(domain);
}

export function getSchoolById(id: SchoolId): SchoolConfig | null {
  return SCHOOLS.find((s) => s.id === id) ?? null;
}
