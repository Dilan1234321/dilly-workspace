/**
 * Estimates how much the Build score would change if the student added a given
 * certification to their resume. Mirrors dilly_core/tracks.py Build formulas:
 * each track scores Build from keyword density; we count keywords in cert name + description.
 * Kept in sync with tracks.py for accurate "est. if you add this cert" in the UI.
 */

import type { CertificationEntry } from "./certificationsHub";
import type { TrackKey } from "./trackDefinitions";

// Keyword lists and points per hit from dilly_core/tracks.py (Build formulas only).
// We only count keywords in the cert text; we do not apply signal-based bonuses (e.g. leadership_density).
const PRE_HEALTH_KW = ["clinical", "shadowing", "emt", "patient", "hospital", "scribing", "volunteer", "medical", "surgery", "direct patient"];
const PRE_HEALTH_PTS = 12;

const PRE_LAW_KW = ["debate", "legal", "advocacy", "court", "internship", "writing", "justice", "political", "international", "moot court", "mock trial", "paralegal"];
const PRE_LAW_PTS = 12;

const TECH_KW = ["python", "sql", "javascript", "aws", "docker", "excel", "tableau", "react", "git", "machine learning", "pandas", "seaborn", "java", "typescript"];
// "r " in Python is to avoid matching "react"; in JS we check for " r " or word boundary
const TECH_PTS = 8;

const SCIENCE_KW = ["research", "laboratory", "lab", "publication", "sequencing", "bench", "wet-lab", "wet lab", "microscopy", "data analysis", "pi ", "principal investigator", "grants", "funding"];
const SCIENCE_PTS = 6;
const SCIENCE_RESEARCH_BONUS = 25; // if "research" in text

const BUSINESS_KW = ["excel", "tableau", "financial", "revenue", "budget", "analysis", "internship", "consulting", "sales", "marketing", "management", "leadership"];
const BUSINESS_PTS = 6;

const FINANCE_KW = [
  "excel", "tableau", "cfa", "cpa", "financial", "audit", "tax", "advisory", "valuation", "modeling",
  "investment", "banking", "asset management", "private equity", "hedge fund", "analyst", "internship",
  "revenue", "budget", "forecast", "due diligence", "transaction", "deal", "compliance", "gaap", "sec",
];
const FINANCE_PTS = 6;

const CONSULTING_KW = [
  "consulting", "strategy", "case", "client", "analysis", "recommendation", "mckinsey", "bcg", "bain",
  "deloitte", "ey ", "kpmg", "accenture", "internship", "framework", "stakeholder", "synthesis",
  "revenue", "growth", "efficiency", "impact", "leadership", "team", "presentation",
];
const CONSULTING_PTS = 6;

const COMM_KW = ["writing", "content", "social media", "pr ", "public relations", "campaign", "media", "communication", "audience", "brand", "press", "journalism"];
const COMM_PTS = 7;

const ED_KW = ["teaching", "tutor", "curriculum", "lesson", "student", "classroom", "education", "certification", "certified", "mentor", "instruction"];
const ED_PTS = 8;

const ARTS_KW = ["portfolio", "exhibition", "performance", "production", "design", "film", "animation", "theatre", "theater", "music", "dance", "studio", "art", "graphic", "media", "curated", "exhibited", "composed", "directed", "edited", "reel", "showcase"];
const ARTS_PTS = 6;

const HUMANITIES_KW = ["writing", "published", "publication", "research", "analysis", "essay", "thesis", "journal", "edit", "translation", "language", "philosophy", "sociology", "literature", "tutor", "teaching", "presentation", "conference"];
const HUMANITIES_PTS = 6;

function countHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits += 1;
  }
  return hits;
}

/** Tech track also scores "r" (R programming); tracks.py uses "r " to avoid matching "react". */
function techHits(text: string): number {
  const lower = text.toLowerCase();
  let hits = countHits(lower, TECH_KW);
  if (/\br\b/.test(lower) || lower.includes(" r ") || lower.includes(" r,") || lower.includes("(r)")) {
    hits += 1;
  }
  return hits;
}

/**
 * Raw Build points that would be contributed by this cert's text alone for the given track.
 * Does not cap at 100; caller adds to current Build and caps.
 */
function rawBuildDeltaForTrack(cert: CertificationEntry, track: TrackKey | string): number {
  const text = `${cert.name} ${cert.description}`.toLowerCase();

  switch (track) {
    case "Pre-Health":
      return countHits(text, PRE_HEALTH_KW) * PRE_HEALTH_PTS;
    case "Pre-Law":
      return countHits(text, PRE_LAW_KW) * PRE_LAW_PTS;
    case "Tech":
      return techHits(text) * TECH_PTS;
    case "Science": {
      const kwPts = countHits(text, SCIENCE_KW) * SCIENCE_PTS;
      const researchBonus = text.includes("research") ? SCIENCE_RESEARCH_BONUS : 0;
      return kwPts + researchBonus;
    }
    case "Business":
      return countHits(text, BUSINESS_KW) * BUSINESS_PTS;
    case "Finance":
      return countHits(text, FINANCE_KW) * FINANCE_PTS;
    case "Consulting":
      return countHits(text, CONSULTING_KW) * CONSULTING_PTS;
    case "Communications":
      return countHits(text, COMM_KW) * COMM_PTS;
    case "Education":
      return countHits(text, ED_KW) * ED_PTS;
    case "Arts":
      return countHits(text, ARTS_KW) * ARTS_PTS;
    case "Humanities":
      return countHits(text, HUMANITIES_KW) * HUMANITIES_PTS;
    default:
      // Fallback: Humanities-style
      return countHits(text, HUMANITIES_KW) * HUMANITIES_PTS;
  }
}

/**
 * Estimated Build score increase (0–100 scale) if the student adds this certification
 * to their resume. Capped so currentBuild + delta does not exceed 100.
 * Track-relevant certs get at least +1 so we don't show "no change" for recommended certs.
 */
export function estimateBuildDeltaForCert(
  cert: CertificationEntry,
  track: TrackKey | string | null | undefined,
  currentBuild: number
): number {
  const t = (track?.trim() || "Humanities") as TrackKey;
  const raw = rawBuildDeltaForTrack(cert, t);
  // Raw points from one line of cert text are typically a small contribution; cap delta at 20 so we don't overstate.
  let delta = Math.min(20, Math.round(raw));
  const isRelevant = !cert.tracks.length || cert.tracks.includes(t);
  if (isRelevant && delta < 1) delta = 1;
  return Math.min(100 - currentBuild, delta);
}
