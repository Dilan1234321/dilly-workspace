/**
 * Dilly dashboard utilities: score colors, badge/snapshot SVG, punchy findings, storage keys.
 */

import type { AuditV2, DimensionKey, Rec } from "@/types/dilly";
import { ACHIEVEMENT_DEFINITIONS } from "@/lib/achievements";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const SCHOOL_STORAGE_KEY = "dilly_school";
export const SCHOOL_NAME_KEY = "dilly_school_name";
export const AUTH_TOKEN_KEY = "dilly_auth_token";
/** Short-lived cache for /auth/me so returning from Jobs/ATS/Settings shows app immediately; revalidated in background. */
export const AUTH_USER_CACHE_KEY = "dilly_auth_user";
export const AUTH_USER_CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
export const PROFILE_CACHE_KEY_BASE = "dilly_profile_cache";

/** Recruiter UI: localStorage key for recruiter API key (X-Recruiter-API-Key). */
export const RECRUITER_API_KEY_STORAGE = "dilly_recruiter_api_key";

export const DILLY_STORAGE_KEY_BASE = "dilly_last_audit";

/** Client cache for latest ATS readiness score (0–100) so Score tab shows last scan even before /ats-score/history refetches. */
export const DILLY_LAST_ATS_SCORE_KEY = "dilly_last_ats_score";

export type LastAtsScoreCache = { score: number; ts: number; audit_id?: string | null };

export function readLastAtsScoreCache(): LastAtsScoreCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DILLY_LAST_ATS_SCORE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as LastAtsScoreCache;
    if (typeof o?.score !== "number" || Number.isNaN(o.score)) return null;
    return {
      score: Math.round(Math.max(0, Math.min(100, o.score))),
      ts: typeof o.ts === "number" ? o.ts : 0,
      audit_id: o.audit_id ?? null,
    };
  } catch {
    return null;
  }
}

export function writeLastAtsScoreCache(entry: LastAtsScoreCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      DILLY_LAST_ATS_SCORE_KEY,
      JSON.stringify({
        score: Math.round(Math.max(0, Math.min(100, entry.score))),
        ts: entry.ts,
        audit_id: entry.audit_id ?? null,
      }),
    );
  } catch {
    /* ignore */
  }
}
export const ONBOARDING_STEP_KEY = "dilly_onboarding_step";
export const VOICE_MESSAGES_KEY = "dilly_voice_messages";
export const VOICE_CONVOS_KEY = "dilly_voice_convos";
export const PENDING_VOICE_KEY = "dilly_pending_voice_prompt";

/** Set to "1" before navigating to `/` so the main app opens the Dilly overlay (e.g. from a standalone shell). Consumed once on home. */
export const DILLY_OPEN_OVERLAY_KEY = "dilly_open_overlay";

/** User message auto-send when opening Voice from /score gap CTA (`/voice?context=score_gap&…`). Consumed on home with overlay. */
export const DILLY_SCORE_GAP_VOICE_PROMPT_KEY = "dilly_score_gap_voice_prompt";

/** Set to "1" after a new audit so `/leaderboard` refetches with `?refresh=true` once. */
export const DILLY_LEADERBOARD_REFRESH_KEY = "dilly_leaderboard_refresh";

/** Auto-send when opening Voice from leaderboard move-up CTA (`/voice?context=leaderboard&…`). Consumed on home with overlay. */
export const DILLY_LEADERBOARD_VOICE_PROMPT_KEY = "dilly_leaderboard_voice_prompt";

/** From Jobs page close-gap CTA (`/voice?context=job_gap&…`). Consumed on home with overlay. */
export const DILLY_JOB_GAP_VOICE_PROMPT_KEY = "dilly_job_gap_voice_prompt";

/** From Jobs page when every listed role is applied (`/voice?context=expand_job_search`). */
export const DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY = "dilly_expand_job_search_voice_prompt";

/** User message to auto-send when overlay opens from `/career-playbook` (consumed once; not cleared by login scrub). */
export const DILLY_PLAYBOOK_VOICE_PROMPT_KEY = "dilly_playbook_voice_prompt";

/** Set to audit id before navigating home so Voice opens with audit-report context (consumed with overlay). */
export const VOICE_FROM_AUDIT_ID_KEY = "dilly_voice_from_audit_id";

/**
 * JSON handoff for certification resume help: { cert_id, name?, provider?, source?: "cert_landing" }.
 * Set before `/voice?context=cert&id=…`; consumed when the home overlay opens.
 */
export const VOICE_FROM_CERT_HANDOFF_KEY = "dilly_voice_cert_handoff";

/** Full `AuditV2` JSON: set before `router.push`/`replace` to `/audit/[id]` so the report page paints without a loading skeleton. Consumed once when ids match. */
export const DILLY_AUDIT_REPORT_HANDOFF_KEY = "dilly_audit_report_handoff";

export function stashAuditForReportHandoff(audit: AuditV2 | null | undefined): void {
  if (typeof window === "undefined" || !audit?.scores) return;
  const id = String(audit.id || "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(DILLY_AUDIT_REPORT_HANDOFF_KEY, JSON.stringify(audit));
  } catch {
    /* ignore */
  }
}

/** Returns stashed audit if id matches `expectedAuditId`; clears key on success or on unreadable data. */
export function consumeAuditReportHandoff(expectedAuditId: string): AuditV2 | null {
  const want = String(expectedAuditId || "").trim();
  if (typeof window === "undefined" || !want) return null;
  try {
    const raw = sessionStorage.getItem(DILLY_AUDIT_REPORT_HANDOFF_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as AuditV2;
    const id = String(a?.id || "").trim();
    if (id !== want || !a?.scores) {
      try {
        sessionStorage.removeItem(DILLY_AUDIT_REPORT_HANDOFF_KEY);
      } catch {
        /* ignore */
      }
      return null;
    }
    sessionStorage.removeItem(DILLY_AUDIT_REPORT_HANDOFF_KEY);
    return a;
  } catch {
    try {
      sessionStorage.removeItem(DILLY_AUDIT_REPORT_HANDOFF_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** sessionStorage key for scroll position on `/audit/[id]` (restore when returning from Voice, etc.). */
export function auditScrollStorageKey(auditId: string): string {
  return `dilly_audit_scroll_${auditId}`;
}

/** sessionStorage key for last Career Center path. Used when Back is clicked on child pages (ATS, Jobs, etc.) so we return to the user's last tab instead of new audit. */
export const LAST_CAREER_CENTER_PATH_KEY = "dilly_last_career_center_path";

/** Get the path to return to Career Center (user's last tab). Falls back to "/?tab=center" so Back from child pages returns to Career Center, not new audit. Never returns /audit (deprecated). */
export function getCareerCenterReturnPath(): string {
  if (typeof window === "undefined") return "/?tab=center";
  try {
    const stored = sessionStorage.getItem(LAST_CAREER_CENTER_PATH_KEY);
    if (stored && stored.startsWith("/") && !stored.includes("//") && stored !== "/audit") return stored;
  } catch {}
  return "/?tab=center";
}

/** Store the current Career Center path so Back buttons on child pages return here. Call from main page when tab changes; skip when on upload (new audit) flow. */
export function setCareerCenterReturnPath(path: string): void {
  if (typeof window === "undefined") return;
  try {
    if (path && path.startsWith("/") && !path.includes("//")) {
      sessionStorage.setItem(LAST_CAREER_CENTER_PATH_KEY, path);
    }
  } catch {}
}

/** Safe UUID for environments where crypto.randomUUID may be missing (e.g. non-HTTPS, older browsers). */
export function safeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}

/**
 * Synchronous copy via hidden textarea + execCommand.
 * Use when async Clipboard API fails (e.g. user activation expired after await) — still not guaranteed on all iOS versions.
 */
export function copyTextSync(text: string): boolean {
  if (typeof document === "undefined" || !text) return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Fetch with AbortSignal timeout so a slow or hung API cannot block the UI indefinitely. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/** One row from GET /audit/history — enough to paint the home score card before full detail loads. */
export type AuditHistorySummaryRow = {
  id?: string;
  ts: number;
  scores: { smart: number; grit: number; build: number };
  final_score: number;
  detected_track: string;
  candidate_name?: string;
  major?: string;
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  dilly_take?: string;
  strongest_signal_sentence?: string;
};

/** Build a minimal AuditV2 from history summary so the dashboard never spins on “Loading your previous audit…” while GET /audit/history/{id} is slow or stuck. */
export function minimalAuditFromHistorySummary(row: AuditHistorySummaryRow): AuditV2 {
  const scores =
    row.scores && typeof row.scores === "object"
      ? {
          smart: Number(row.scores.smart) || 0,
          grit: Number(row.scores.grit) || 0,
          build: Number(row.scores.build) || 0,
        }
      : { smart: 0, grit: 0, build: 0 };
  const finalCoerced = Number(row.final_score);
  const final =
    row.final_score != null && !Number.isNaN(finalCoerced) && finalCoerced > 0
      ? finalCoerced
      : (scores.smart + scores.grit + scores.build) / 3;
  const pp = row.peer_percentiles;
  return {
    id: row.id?.trim(),
    candidate_name: (row.candidate_name ?? "").trim(),
    detected_track: (row.detected_track ?? "").trim(),
    major: (row.major ?? "").trim(),
    scores,
    final_score: final,
    audit_findings: [],
    evidence: {},
    recommendations: [],
    raw_logs: [],
    dilly_take: row.dilly_take ?? null,
    strongest_signal_sentence: row.strongest_signal_sentence ?? null,
    peer_percentiles: pp
      ? {
          smart: Number(pp.smart ?? 50) || 50,
          grit: Number(pp.grit ?? 50) || 50,
          build: Number(pp.build ?? 50) || 50,
        }
      : null,
  };
}

export const LOW_SCORE_THRESHOLD = 50;

export const DIMENSIONS: { key: DimensionKey; label: string }[] = [
  { key: "smart", label: "Smart" },
  { key: "grit", label: "Grit" },
  { key: "build", label: "Build" },
];

export const GOALS_ALL = [
  { key: "internship", label: "I Want an Internship" },
  { key: "gain_experience", label: "I Want to Gain Experience" },
  { key: "meet_like_minded", label: "I Want to Meet Like-Minded People" },
  { key: "get_involved_university", label: "I Want to Get Involved With My University" },
  { key: "figure_out", label: "I Want to Figure Out What I Actually Want" },
];

export function auditStorageKey(email?: string | null): string {
  return email ? `${DILLY_STORAGE_KEY_BASE}_${email}` : DILLY_STORAGE_KEY_BASE;
}

export function voiceStorageKey(kind: string, email?: string | null): string {
  return email ? `dilly_voice_${kind}_${email}` : `dilly_voice_${kind}`;
}

const VOICE_INTRO_SEEN_KIND = "intro_seen_v1";

/** True if user should not see the long first-time Dilly AI intro (flag set or any saved chat has messages). */
export function hasCompletedDillyVoiceIntro(email?: string | null): boolean {
  if (!email) return true;
  try {
    if (typeof localStorage === "undefined") return true;
    if (localStorage.getItem(voiceStorageKey(VOICE_INTRO_SEEN_KIND, email)) === "1") return true;
    const convosKey = voiceStorageKey("convos", email);
    const stored = localStorage.getItem(convosKey);
    if (!stored) return false;
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return false;
    return parsed.some(
      (c) =>
        c &&
        typeof c === "object" &&
        Array.isArray((c as { messages?: unknown }).messages) &&
        (c as { messages: unknown[] }).messages.length > 0
    );
  } catch {
    return true;
  }
}

export function markDillyVoiceIntroSeen(email?: string | null): void {
  if (!email) return;
  try {
    localStorage.setItem(voiceStorageKey(VOICE_INTRO_SEEN_KIND, email), "1");
  } catch {
    /* ignore */
  }
}

/** Empty-state copy for Voice tab / overlay: long intro once per account, then "Hey {name}, …". */
export function getDillyVoiceEmptyGreeting(
  email: string | null | undefined,
  profileFirstName: string | null | undefined
): string {
  const name = profileFirstName?.trim() || "";
  const short = name ? `Hey ${name}, what's on your mind?` : "Hey! What's on your mind?";
  if (typeof window === "undefined") return short;
  if (!hasCompletedDillyVoiceIntro(email)) {
    return "Hey! I'm Dilly, your career coach. I'm built to talk to you about YOU! You can talk to me like I was born and raised in your resume, because I kind of was. What's on your mind?";
  }
  return short;
}

/** localStorage key for cached profile photo (data URL). Survives refresh and sign-in. */
export function profilePhotoCacheKey(email?: string | null): string {
  return email ? `dilly_profile_photo_${email}` : "dilly_profile_photo";
}

export function scoreColor(score: number): { color: string; bg: string; label: string } {
  if (score >= 70) return { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "Strong" };
  if (score >= 50) return { color: "#eab308", bg: "rgba(234,179,8,0.10)", label: "Average" };
  return { color: "#ef4444", bg: "rgba(239,68,68,0.10)", label: "Needs work" };
}

export type ShareCardOptions = {
  customTagline?: string | null;
  selectedAchievements?: string[];
};

/** Options for share-card SVG (matches the in-app share card: one metric, achievements). */
export type ShareCardSvgOptions = ShareCardOptions & {
  /** Which metric to show: smart | grit | build | mts | ats */
  shareCardMetric: "smart" | "grit" | "build" | "mts" | "ats";
  /** For metric "ats": current ATS score (0–100). Omit if no ATS run yet. */
  atsScore?: number | null;
  /** For metric "ats": peer percentile (0–100). Top % = 100 - atsPeerPercentile. */
  atsPeerPercentile?: number | null;
  /** Ring/accent color (default #1e293b). */
  primaryColor?: string;
};

export function generateBadgeSvg(
  audit: AuditV2,
  dimension: "smart" | "grit" | "build" = "grit",
  options?: ShareCardOptions
): string {
  const scores = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const percs = audit.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
  const track = (audit.detected_track ?? "").trim() || "Humanities";
  const score = scores[dimension] ?? 0;
  const pct = percs[dimension] ?? 50;
  const topPct = Math.max(1, 100 - pct);
  const color = topPct <= 25 ? "#22c55e" : topPct <= 50 ? "#eab308" : "#94a3b8";
  const tagline = (options?.customTagline ?? "").trim();
  const achievements = options?.selectedAchievements ?? [];
  const achSlots = achievements.slice(0, 3);
  const badgeH = tagline || achSlots.length ? 160 : 120;
  const cohortBadgeLine = audit.peer_fallback_all ? "All tracks (Dilly)" : `${track} Track`;
  const achSvg =
    achSlots.length > 0
      ? achSlots
          .map((id, i) => {
            const def = ACHIEVEMENT_DEFINITIONS[id as keyof typeof ACHIEVEMENT_DEFINITIONS];
            const emoji = def?.emoji ?? "?";
            const x = 24 + i * 52;
            return `<g transform="translate(${x},${tagline ? 130 : 100})"><circle r="18" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1"/><text x="0" y="6" font-size="14" text-anchor="middle" fill="${color}">${emoji}</text></g>`;
          })
          .join("")
      : "";
  const taglineSvg = tagline
    ? `<text x="24" y="100" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" font-style="italic">${tagline.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${badgeH}" viewBox="0 0 320 ${badgeH}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>
  <rect width="320" height="${badgeH}" rx="16" fill="url(#bg)"/>
  <rect x="1" y="1" width="318" height="${badgeH - 2}" rx="15" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
  <text x="24" y="36" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" font-weight="600" letter-spacing="1.2">DILLY VERIFIED</text>
  <text x="24" y="62" font-family="system-ui,sans-serif" font-size="20" fill="#e2e8f0" font-weight="700">Top ${topPct}% ${dimension.charAt(0).toUpperCase() + dimension.slice(1)}</text>
  <text x="24" y="84" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">${cohortBadgeLine}</text>
  <text x="24" y="104" font-family="system-ui,sans-serif" font-size="10" fill="#475569">Score: ${Math.round(score)} · trydilly.com</text>
  ${taglineSvg}
  ${achSvg}
  <circle cx="274" cy="60" r="28" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="1.5"/>
  <text x="274" y="65" font-family="system-ui,sans-serif" font-size="18" fill="${color}" font-weight="700" text-anchor="middle">${Math.round(score)}</text>
</svg>`;
}

/**
 * Share card as SVG — matches the in-app share card (light background, one metric circle, achievements).
 * Use for "Download Snapshot" so the file matches what the user sees and shares.
 */
export function generateShareCardSvg(audit: AuditV2, options: ShareCardSvgOptions): string {
  const scores = audit.scores ?? {};
  const percs = audit.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
  const track = (audit.detected_track ?? "").trim() || "your track";
  const shareMetric = options.shareCardMetric;
  const isDimension = shareMetric === "smart" || shareMetric === "grit" || shareMetric === "build";
  const k = isDimension ? shareMetric : "grit";
  const percentile = percs[k] ?? 50;
  const topPct = Math.max(1, Math.min(100, 100 - percentile));
  const dimensionScore = Math.round(scores[k] ?? 0);
  const mtsScore = audit.final_score != null ? Math.round(audit.final_score) : null;
  const atsScore = options.atsScore != null ? Math.round(options.atsScore) : null;
  const atsTopPct = options.atsPeerPercentile != null ? Math.max(1, 100 - options.atsPeerPercentile) : null;
  const achSlots = (options.selectedAchievements ?? []).slice(0, 3);
  const primary = options.primaryColor ?? "#1e293b";

  const circleLabel =
    shareMetric === "mts"
      ? (mtsScore != null ? String(mtsScore) : "—")
      : shareMetric === "ats"
        ? (atsScore != null ? String(atsScore) : "—")
        : (audit.peer_percentiles ? `${topPct}%` : String(dimensionScore));
  const subLabel =
    shareMetric === "mts"
      ? "Final · Overall"
      : shareMetric === "ats"
        ? atsTopPct != null ? `ATS · Top ${atsTopPct}% vs peers` : "Dilly ATS score"
        : audit.peer_fallback_all
          ? `${k.charAt(0).toUpperCase() + k.slice(1)} · vs all Dilly peers`
          : `${k.charAt(0).toUpperCase() + k.slice(1)} in ${track}`;
  const topLabel = shareMetric === "mts" ? "Final" : shareMetric === "ats" ? "ATS" : "Top";

  const size = 56;
  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  const strokeDash =
    shareMetric === "mts"
      ? (Math.min(100, Math.max(0, mtsScore ?? 0)) / 100) * circumference
      : shareMetric === "ats"
        ? (Math.min(100, Math.max(0, atsScore ?? 0)) / 100) * circumference
        : ((100 - topPct) / 100) * circumference;
  const showRing =
    (isDimension && audit.peer_percentiles) ||
    (shareMetric === "mts" && mtsScore != null) ||
    (shareMetric === "ats" && atsScore != null);

  const cardW = 400;
  const row1H = 100;
  const stickerRowH = achSlots.length > 0 ? 52 : 0;
  const padding = 20;
  const cardH = row1H + stickerRowH + padding * 2;
  const circleX = cardW - padding - size / 2 - 20;
  const circleY = 44;

  const achSvg =
    achSlots.length > 0
      ? achSlots
          .map((id, i) => {
            const def = ACHIEVEMENT_DEFINITIONS[id as keyof typeof ACHIEVEMENT_DEFINITIONS];
            const emoji = def?.emoji ?? "?";
            const x = 24 + i * 52;
            const y = row1H + padding + 16;
            return `<g transform="translate(${x},${y})"><circle r="14" fill="${primary}" fill-opacity="0.12" stroke="${primary}" stroke-width="1"/><text x="0" y="5" font-size="14" text-anchor="middle" dominant-baseline="central" fill="${primary}">${emoji}</text></g>`;
          })
          .join("")
      : "";

  const ringSvg = showRing
    ? `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${primary}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${strokeDash} ${circumference}" transform="rotate(-90 0 0)"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" overflow="hidden">
  <rect width="${cardW}" height="${cardH}" rx="16" fill="#ffffff"/>
  <text x="24" y="32" font-family="Times New Roman, Times, serif" font-size="24" font-weight="700" fill="#0f172a">Dilly</text>
  <text x="24" y="52" font-family="Times New Roman, Times, serif" font-size="13" fill="#475569">Resume scored like a senior hiring manager.</text>
  <text x="24" y="68" font-family="Times New Roman, Times, serif" font-size="12" fill="#64748b">Your career center. Open 24/7.</text>
  <g transform="translate(${circleX},${circleY})">
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="4"/>
    ${ringSvg}
    <text x="0" y="0" font-family="Times New Roman, Times, serif" font-size="${circleLabel.length > 3 ? 14 : 16}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#0f172a">${circleLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
  </g>
  <text x="${circleX}" y="${circleY - r - 8}" font-family="system-ui,sans-serif" font-size="9" font-weight="600" fill="#64748b" text-anchor="middle" letter-spacing="0.05em">${topLabel}</text>
  <text x="${circleX}" y="${circleY + r + 14}" font-family="system-ui,sans-serif" font-size="9" fill="#475569" text-anchor="middle">${subLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
  ${achSvg}
</svg>`;
}

export function toPunchyFindings(audit: AuditV2): string[] {
  const take = (audit.dilly_take ?? "").trim();
  const percs = audit.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
  const findings = audit.audit_findings ?? [];
  const lines: string[] = [];
  const maxLen = 28;

  const PUNCHY_MAP: [RegExp, string][] = [
    [/academic|gpa|honors|dean'?s list|top \d+%/i, "GPA & honors speak volumes"],
    [/leadership|led|exec|president|director/i, "Leadership stands out"],
    [/technical|projects|built|code|data/i, "Technical build is strong"],
    [/quantifiable|metrics|impact|results/i, "Add metrics. Impact pops"],
    [/clinical|shadowing|patient/i, "Clinical experience shines"],
    [/research|published|lab/i, "Research experience proven"],
  ];

  function extractPunchy(text: string): string | null {
    const rest = text.replace(/^(Smart|Grit|Build):\s*/i, "").trim().toLowerCase();
    for (const [re, phrase] of PUNCHY_MAP) {
      if (re.test(rest)) return phrase;
    }
    const words = rest.split(/\s+/).slice(0, 4).join(" ");
    return words.length <= maxLen && words.length > 5 ? words : null;
  }

  if (take && take.length <= 40) lines.push(take);
  if (lines.length >= 2) return lines.slice(0, 2);

  const dims = (["smart", "grit", "build"] as const)
    .map((d) => ({ d, p: percs[d] ?? 50 }))
    .filter((x) => x.p > 50);
  if (dims.length > 0) {
    const best = dims.sort((a, b) => b.p - a.p)[0];
    const topPct = Math.max(1, 100 - best.p);
    const label = best.d.charAt(0).toUpperCase() + best.d.slice(1);
    lines.push(`Top ${topPct}% ${label}`);
  }
  if (lines.length >= 2) return lines.slice(0, 2);

  for (const f of findings) {
    if (lines.length >= 2) break;
    const punchy = extractPunchy(f ?? "");
    if (punchy && punchy.length <= maxLen && !lines.includes(punchy)) lines.push(punchy);
  }
  return lines.slice(0, 2);
}

/**
 * Full score summary SVG for "Download Snapshot".
 * Differs from the in-app share card:
 * - Share card: one metric (Smart/Grit/Build), one % circle, achievements — for quick social share (e.g. Send to friends).
 * - Snapshot: name, final score (MTS), all 3 dimensions, key findings, achievements — for applications or saving a full record.
 */
export function generateSnapshotSvg(audit: AuditV2, options?: ShareCardOptions): string {
  const scores = audit.scores ?? {};
  const fs = audit.final_score ?? 0;
  const track = (audit.detected_track ?? "").trim() || "Humanities";
  const name = (audit.candidate_name ?? "").trim() || "Student";
  const customTagline = (options?.customTagline ?? "").trim();
  const achSlots = (options?.selectedAchievements ?? []).slice(0, 3);
  const punchyLines = toPunchyFindings(audit);
  const displayLines = punchyLines.length > 0 ? punchyLines : ["Dilly Truth Standard · Your resume, scored."];
  const s = scores.smart ?? 0;
  const g = scores.grit ?? 0;
  const b = scores.build ?? 0;
  const fsc = fs >= 70 ? "#22c55e" : fs >= 50 ? "#eab308" : "#ef4444";
  let extraH = 0;
  if (customTagline) extraH += 24;
  if (achSlots.length) extraH += 40;
  const findingsBaseY = 302 + (customTagline ? 24 : 0);
  const findingsSvg = displayLines
    .map((line, i) => {
      const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<text x="24" y="${findingsBaseY + i * 22}" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#e2e8f0">• ${escaped}</text>`;
    })
    .join("");
  const achSvg =
    achSlots.length > 0
      ? achSlots
          .map((id, i) => {
            const def = ACHIEVEMENT_DEFINITIONS[id as keyof typeof ACHIEVEMENT_DEFINITIONS];
            const emoji = def?.emoji ?? "?";
            const x = 80 + i * 80;
            const y = 352 + displayLines.length * 22 + (customTagline ? 24 : 0) + 20;
            return `<g transform="translate(${x},${y})"><circle r="14" fill="${fsc}" fill-opacity="0.15" stroke="${fsc}" stroke-width="1"/><text x="0" y="5" font-size="12" text-anchor="middle" fill="${fsc}">${emoji}</text></g>`;
          })
          .join("")
      : "";
  const taglineSvg = customTagline
    ? `<text x="24" y="120" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" font-style="italic">${customTagline.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`
    : "";
  const footerY = 352 + displayLines.length * 22 + extraH;
  const h = footerY + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${h}" viewBox="0 0 400 ${h}" overflow="hidden">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>
  <rect width="400" height="${h}" rx="20" fill="url(#bg)"/>
  <text x="24" y="36" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.5">DILLY SNAPSHOT</text>
  <text x="24" y="52" font-family="system-ui,sans-serif" font-size="9" fill="#64748b" opacity="0.9">Full score summary · All 3 dimensions + key findings</text>
  <text x="24" y="78" font-family="system-ui,sans-serif" font-size="22" fill="#e2e8f0" font-weight="700">${(name ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
  <text x="24" y="98" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">${(track ?? "").replace(/&/g, "&amp;")} Track</text>
  <circle cx="340" cy="88" r="32" fill="${fsc}" fill-opacity="0.12" stroke="${fsc}" stroke-width="2"/>
  <text x="340" y="93" font-family="system-ui,sans-serif" font-size="22" fill="${fsc}" font-weight="700" text-anchor="middle">${Math.round(fs)}</text>
  <text x="340" y="106" font-family="system-ui,sans-serif" font-size="8" fill="${fsc}" text-anchor="middle" opacity="0.7">MTS</text>
  ${taglineSvg}
  <line x1="24" y1="${122 + (customTagline ? 24 : 0)}" x2="376" y2="${122 + (customTagline ? 24 : 0)}" stroke="#334155" stroke-width="0.5"/>
  <text x="24" y="${152 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.2">DIMENSIONS</text>
  <rect x="24" y="${167 + (customTagline ? 24 : 0)}" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="79" y="${192 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Smart</text>
  <text x="79" y="${217 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="24" fill="${s >= 70 ? "#22c55e" : s >= 50 ? "#eab308" : "#ef4444"}" font-weight="700" text-anchor="middle">${Math.round(s)}</text>
  <rect x="145" y="${167 + (customTagline ? 24 : 0)}" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="200" y="${192 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Grit</text>
  <text x="200" y="${217 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="24" fill="${g >= 70 ? "#22c55e" : g >= 50 ? "#eab308" : "#ef4444"}" font-weight="700" text-anchor="middle">${Math.round(g)}</text>
  <rect x="266" y="${167 + (customTagline ? 24 : 0)}" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="321" y="${192 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Build</text>
  <text x="321" y="${217 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="24" fill="${b >= 70 ? "#22c55e" : b >= 50 ? "#eab308" : "#ef4444"}" font-weight="700" text-anchor="middle">${Math.round(b)}</text>
  <text x="24" y="${272 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.2">KEY FINDINGS</text>
  ${findingsSvg}
  ${achSvg}
  <text x="200" y="${footerY + 20}" font-family="system-ui,sans-serif" font-size="9" fill="#475569" text-anchor="middle">trydilly.com · Share Your Score</text>
</svg>`;
}

export function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function svgToPngFile(svg: string, filename: string): Promise<File> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) throw new Error("Invalid SVG");
  const w = parseInt(svgEl.getAttribute("width") || "320", 10);
  const h = parseInt(svgEl.getAttribute("height") || "120", 10);
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  const img = new Image();
  const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = () => reject(new Error("Failed to load SVG"));
    img.src = dataUrl;
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create PNG"));
        return;
      }
      resolve(new File([blob], filename.replace(/\.svg$/i, ".png"), { type: "image/png" }));
    }, "image/png", 1);
  });
}

export function findingForDimension(audit: AuditV2, dimKey: DimensionKey): string | null {
  const prefix = (DIMENSIONS.find((d) => d.key === dimKey)?.label ?? dimKey) + ": ";
  const finding = audit.audit_findings?.find((f) => f.startsWith(prefix));
  if (!finding) return null;
  return finding.slice(prefix.length).trim() || null;
}

export function topPercentileHeadline(audit: AuditV2 | null | undefined): string | null {
  if (!audit?.peer_percentiles) return null;
  const pct = audit.peer_percentiles;
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  let best: { key: DimensionKey; topPct: number } = { key: "smart", topPct: Math.max(1, 100 - (pct.smart ?? 50)) };
  for (const k of keys) {
    const topPct = Math.max(1, 100 - (pct[k] ?? 50));
    if (topPct < best.topPct) best = { key: k, topPct };
  }
  const label = DIMENSIONS.find((d) => d.key === best.key)?.label ?? best.key;
  // peer_fallback_all: backend compared vs all audited resumes (track cohort too small).
  if (audit.peer_fallback_all) {
    return `Top ${best.topPct}% ${label} among Dilly students`;
  }
  const track = (audit.detected_track || "").trim() || "your track";
  return `Top ${best.topPct}% ${label} in ${track}`;
}

/**
 * Returns dimensions below Top 25% (by peer percentile). Source of truth is percentile: if a dimension
 * is in this list, the user is below Top 25% for it.
 *
 * `pointsToTop25` blends score headroom (vs ~70) with peer-rank distance so we never show "~0 pts"
 * while still below Top 25% (high raw score but weak vs peers). UI should still treat this as an
 * estimate, not a guarantee.
 */
export function gapToNextLevel(audit: AuditV2 | null | undefined): { key: DimensionKey; label: string; topPct: number; pointsToTop25?: number }[] {
  if (!audit?.peer_percentiles) return [];
  const pct = audit.peer_percentiles;
  const scores = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const result: { key: DimensionKey; label: string; topPct: number; pointsToTop25?: number }[] = [];
  for (const k of ["smart", "grit", "build"] as DimensionKey[]) {
    const percentile = pct[k] ?? 50;
    const topPct = Math.max(1, 100 - percentile);
    if (topPct > 25) {
      const label = DIMENSIONS.find((d) => d.key === k)?.label ?? k;
      const score = scores[k] ?? 0;
      const scoreGap = Math.ceil(70 - score);
      // Peer-rank gap: rough points-equivalent so copy stays consistent when score is already "high"
      const rankGap = Math.ceil((topPct - 25) / 2.5);
      const pointsToTop25 = Math.max(1, scoreGap, rankGap);
      result.push({ key: k, label, topPct, pointsToTop25 });
    }
  }
  return result.sort((a, b) => a.topPct - b.topPct);
}

/**
 * Progress bar fill (0–100) toward Top 25% **by peer rank** (Top X% now → goal Top 25%).
 * Do not use raw score / 70 here — that contradicts "Top X% now" when score is high but rank is not.
 */
export function progressPercentTowardTop25Rank(topPct: number): number {
  const t = Math.max(1, topPct);
  if (t <= 25) return 100;
  return Math.min(100, Math.round((25 / t) * 100));
}

/** "Your strongest signal to recruiters right now is [X]." From API or derived from scores + evidence. */
export function getStrongestSignalSentence(audit: AuditV2 | null | undefined): string | null {
  if (!audit?.scores) return null;
  const precomputed = (audit as AuditV2 & { strongest_signal_sentence?: string | null }).strongest_signal_sentence;
  if (precomputed && precomputed.trim()) return precomputed.trim();
  const scores = audit.scores;
  const evidence = audit.evidence ?? {};
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  const strongest = keys.reduce(
    (acc, k) => (scores[k] > acc.score ? { key: k, score: scores[k] } : acc),
    { key: keys[0], score: scores[keys[0]] }
  );
  const dimLabel = strongest.key.charAt(0).toUpperCase() + strongest.key.slice(1);
  const ev = (evidence[strongest.key] ?? "").trim().replace(/\.+$/, "");
  if (!ev) return null;
  return `Your strongest signal to recruiters right now is ${dimLabel}: ${ev}.`;
}

export function oneLineSummary(audit: AuditV2 | null | undefined): string {
  if (!audit) return "";
  const take = audit.dilly_take;
  if (take && take.trim()) return take.trim();
  const { scores, audit_findings, recommendations, detected_track } = audit;
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  const low = keys.reduce(
    (acc, k) => (scores[k] < acc.score ? { key: k, score: scores[k] } : acc),
    { key: keys[0], score: scores[keys[0]] }
  );
  const high = keys.reduce(
    (acc, k) => (scores[k] > acc.score ? { key: k, score: scores[k] } : acc),
    { key: keys[0], score: scores[keys[0]] }
  );
  const dimLabel = DIMENSIONS.find((d) => d.key === low.key)?.label ?? low.key;
  const rec = recommendations?.find((r) => (r.score_target ?? "").toLowerCase() === low.key) || recommendations?.[0];
  const action = rec?.title || (rec?.action?.slice(0, 60) + (rec?.action && rec.action.length > 60 ? "…" : "")) || "";
  const track = (detected_track || "").trim() || "your field";
  const allStrong = keys.every((k) => scores[k] >= 65);
  const oneWeak = low.score < 55 && high.score >= 60;

  if (allStrong) {
    return action
      ? `Strong across Smart, Grit, and Build for ${track}. Next: ${action}.`
      : `Solid profile for ${track}. Small tweaks in the recommendations will sharpen the story.`;
  }
  if (oneWeak && action) {
    const templates = [
      `Your ${dimLabel} is the lever. ${action} and recruiters will see the difference.`,
      `Strong ${DIMENSIONS.find((d) => d.key === high.key)?.label ?? high.key}; one move for ${dimLabel}: ${action}.`,
      `For ${track}, lift ${dimLabel}: ${action}.`,
    ];
    const idx = keys.indexOf(low.key) % templates.length;
    return templates[idx];
  }
  if (action) {
    return `What would move the needle: ${action}.`;
  }
  return `See your recommendations. They're tailored to what ${track} recruiters look for.`;
}

/** Heuristic: projected scores if user completes top 3 recommendations. */
export function computeScoreTrajectory(audit: AuditV2 | null | undefined): { smart: number; grit: number; build: number; final: number } | null {
  if (!audit?.scores || !audit.recommendations?.length) return null;
  const s = audit.scores;
  const base = { smart: s.smart ?? 0, grit: s.grit ?? 0, build: s.build ?? 0 };
  const deltas = { smart: 0, grit: 0, build: 0 };
  const recs = audit.recommendations.slice(0, 3);
  for (const r of recs) {
    const type = (r.type || "generic") as string;
    const target = ((r.score_target || "").toLowerCase().replace(/\s+/g, "_") || "build") as "smart" | "grit" | "build";
    const key = target === "smart" || target === "grit" || target === "build" ? target : "build";
    if (type === "line_edit") deltas[key] += 3;
    else if (type === "action") deltas[key] += 2;
    else deltas[key] += 4;
  }
  const smart = Math.min(100, Math.round(base.smart + deltas.smart));
  const grit = Math.min(100, Math.round(base.grit + deltas.grit));
  const build = Math.min(100, Math.round(base.build + deltas.build));
  const final = Math.round((smart + grit + build) / 3);
  return { smart, grit, build, final };
}

export type TopActionItem = {
  title: string;
  detail?: string;
  type: "line_edit" | "action" | "strategic" | "red_flag";
  recIndex?: number;
  currentLine?: string;
  suggestedLine?: string;
  copyable?: boolean;
};

/** Prioritized "Do these 3 next" from audit. Red flags first, then line_edits, then actions, then strategic. */
export function getTopThreeActions(audit: AuditV2 | null | undefined): TopActionItem[] {
  if (!audit) return [];
  const items: TopActionItem[] = [];
  const recs = audit.recommendations ?? [];
  const redFlags = audit.red_flags ?? [];
  const scores = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  const weakest = keys.reduce((acc, k) => (scores[k] < acc.score ? { key: k, score: scores[k] } : acc), { key: keys[0], score: scores[keys[0]] });

  // 1. Red flags first (max 2)
  for (let i = 0; i < Math.min(2, redFlags.length) && items.length < 3; i++) {
    const rf = redFlags[i];
    const msg = typeof rf === "string" ? rf : (rf?.message ?? "");
    if (msg) items.push({ title: msg, type: "red_flag" });
  }

  // 2. Line edits (high impact)
  const lineEdits = recs
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (r.type || "generic") === "line_edit" && (r.title || r.action));
  for (const { r, i } of lineEdits) {
    if (items.length >= 3) break;
    const title = (r.title || r.action || "").trim();
    if (title) {
      items.push({
        title,
        type: "line_edit",
        recIndex: i,
        currentLine: r.current_line ?? undefined,
        suggestedLine: r.suggested_line ?? undefined,
        copyable: !!r.suggested_line,
      });
    }
  }

  // 3. Action recs (tied to weakest dimension when possible)
  const actionRecs = recs
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (r.type || "generic") === "action" && (r.title || r.action));
  for (const { r, i } of actionRecs) {
    if (items.length >= 3) break;
    const title = (r.title || r.action || "").trim();
    if (title) items.push({ title, type: "action", recIndex: i });
  }

  // 4. Strategic / generic to fill to 3
  const usedIndices = new Set(items.map((it) => it.recIndex).filter((x): x is number => x !== undefined));
  const rest = recs
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => !usedIndices.has(i) && (r.title || r.action));
  for (const { r, i } of rest) {
    if (items.length >= 3) break;
    if (items.some((it) => it.recIndex === i)) continue;
    const title = (r.title || r.action || "").trim();
    if (title) items.push({ title, type: "strategic", recIndex: i });
  }

  return items.slice(0, 3);
}

/** Natural, conversational suggestion label + prompt from a recommendation/red-flag title. Never verbose or botty. */
export function toNaturalSuggestion(
  title: string,
  type: TopActionItem["type"],
  suggestedLine?: string
): { label: string; prompt: string } {
  const t = (title || "").toLowerCase().trim();
  const promptBase = suggestedLine ? `Help me fix this. Suggested: ${suggestedLine}` : `Help me fix this: ${title}`;

  // One page — simple, powerful
  if (t.includes("over one page") || t.includes("one page") && (t.includes("trim") || t.includes("tighten") || t.includes("early-career"))) {
    return { label: "How can I help get your resume to one page?", prompt: "Help me get my resume to one page. What should I trim or tighten?" };
  }
  // References upon request
  if (t.includes("references") && (t.includes("upon request") || t.includes("available"))) {
    return { label: "How can I help remove outdated references?", prompt: promptBase };
  }
  // Generic objective
  if (t.includes("objective") || t.includes("reads like filler")) {
    return { label: "How can I help sharpen my objective?", prompt: promptBase };
  }
  // Add dates
  if (t.includes("add") && (t.includes("date") || t.includes("graduation") || t.includes("start/end"))) {
    return { label: "How can I help add dates to my resume?", prompt: promptBase };
  }
  // Resume too thin
  if (t.includes("too thin") || t.includes("incomplete")) {
    return { label: "How can I help strengthen my resume?", prompt: promptBase };
  }
  // Duplicate bullets
  if (t.includes("duplicate") || t.includes("same") && t.includes("bullet")) {
    return { label: "How can I help fix duplicate bullets?", prompt: promptBase };
  }
  // All caps
  if (t.includes("all caps") || t.includes("hard to read")) {
    return { label: "How can I help improve readability?", prompt: promptBase };
  }
  // No email
  if (t.includes("email") || t.includes("contact")) {
    return { label: "How can I add my contact info?", prompt: promptBase };
  }
  // ATS
  if (t.startsWith("ats:") || t.includes("ats")) {
    return { label: "How can I fix ATS issues?", prompt: promptBase };
  }
  // Line edit: often about bullets, metrics, wording — keep it short
  if (type === "line_edit") {
    if (t.includes("metric") || t.includes("number")) {
      return { label: "How can I add numbers to this bullet?", prompt: promptBase };
    }
    if (t.includes("bullet") || t.includes("rewrite")) {
      return { label: "How can I help with this bullet?", prompt: promptBase };
    }
    return { label: "How can I help with this?", prompt: promptBase };
  }
  // Red flag fallback: extract key action or use generic
  if (type === "red_flag") {
    return { label: "How can I help with this?", prompt: promptBase };
  }
  // Action / strategic: keep it simple
  return { label: "How can I help with this?", prompt: promptBase };
}

/** One actionable nudge from top recommendation or weakest dimension. Natural, conversational — never verbose. */
export function getProactiveNudge(audit: AuditV2 | null | undefined): string | null {
  if (!audit) return null;
  const topThree = getTopThreeActions(audit);
  if (topThree.length > 0) {
    const first = topThree[0];
    const { label } = toNaturalSuggestion(first.title, first.type, first.suggestedLine);
    return label;
  }
  const recs = audit.recommendations ?? [];
  const top = recs.find((r) => (r.type || "generic") === "line_edit") ?? recs[0];
  if (top?.title) {
    const { label } = toNaturalSuggestion(top.title, (top.type as TopActionItem["type"]) || "strategic");
    return label;
  }
  const scores = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  const weakest = keys.reduce((acc, k) => (scores[k] < acc.score ? { key: k, score: scores[k] } : acc), { key: keys[0], score: scores[keys[0]] });
  const label = DIMENSIONS.find((d) => d.key === weakest.key)?.label ?? weakest.key;
  if (weakest.score < 50) return `Boost your ${label} score. Check your recommendations for specific steps.`;
  return "Review your recommendations and pick one to tackle this week.";
}

/** Milestone nudge when scores improved since last audit. */
export function getMilestoneNudge(
  current: { scores?: { smart: number; grit: number; build: number } } | null | undefined,
  prev: { scores?: { smart: number; grit: number; build: number } } | null | undefined
): string | null {
  if (!current?.scores || !prev?.scores) return null;
  const cs = current.scores;
  const ps = prev.scores;
  const gains: { key: DimensionKey; delta: number }[] = [];
  for (const k of ["smart", "grit", "build"] as DimensionKey[]) {
    const d = (cs[k] ?? 0) - (ps[k] ?? 0);
    if (d > 0) gains.push({ key: k, delta: d });
  }
  if (gains.length === 0) return null;
  const best = gains.sort((a, b) => b.delta - a.delta)[0];
  const label = DIMENSIONS.find((d) => d.key === best.key)?.label ?? best.key;
  return `${label} up ${Math.round(best.delta)} points since last run.`;
}

/** Which score milestones (50, 70, 85) were crossed from prev to current. */
export function scoresCrossedMilestones(
  current: { scores?: { smart: number; grit: number; build: number } } | null | undefined,
  prev: { scores?: { smart: number; grit: number; build: number } } | null | undefined
): number[] {
  const curScores = current?.scores;
  const prevScores = prev?.scores;
  if (!curScores || !prevScores) return [];
  const milestones = [50, 70, 85];
  const crossed: number[] = [];
  for (const m of milestones) {
    const anyCrossed = (["smart", "grit", "build"] as const).some((k) => {
      const c = curScores[k] ?? 0;
      const p = prevScores[k] ?? 0;
      return p < m && c >= m;
    });
    if (anyCrossed) crossed.push(m);
  }
  return crossed;
}
