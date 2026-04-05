/**
 * Voice-related utilities: storage keys, intro state, greeting text.
 */

import type { AuditV2, AppProfile } from "@/types/dilly";

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

// ── Smart follow-up suggestions ─────────────────────────────────────────────

export interface BuildFollowUpSuggestionsInput {
  isFreshAudit: boolean;
  displayAudit: AuditV2 | null;
  prevAuditScores: { smart: number; grit: number; build: number } | null;
  appProfile: AppProfile | null;
  effectiveTrack: string | null;
}

/**
 * Pure function: compute context-aware follow-up suggestions from audit/deadlines.
 * Extracted from VoiceTab so it can be tested independently.
 */
export function buildFollowUpSuggestions({
  isFreshAudit,
  displayAudit,
  prevAuditScores,
  appProfile,
  effectiveTrack,
}: BuildFollowUpSuggestionsInput): string[] {
  const LOW = 40; // matches LOW_SCORE_THRESHOLD from dillyUtils
  const s: string[] = [];
  if (isFreshAudit && displayAudit?.scores) {
    s.push("How do I interpret my new audit scores?");
  }
  if (displayAudit?.scores) {
    const dims = [
      { k: "smart", v: displayAudit.scores.smart, label: "Smart" },
      { k: "grit", v: displayAudit.scores.grit, label: "Grit" },
      { k: "build", v: displayAudit.scores.build, label: "Build" },
    ] as const;
    const lowest = dims.reduce((a, b) => (b.v < a.v ? b : a));
    if (lowest.v < LOW) {
      s.push(`Why is my ${lowest.label} score low and what's the fastest way to improve it?`);
    }
    s.push(
      `My ${lowest.label} score is ${Math.round(lowest.v)}. What exactly should I do to raise it?`,
    );
  }
  const justMissedForChip = appProfile?.deadlines?.find(
    (d) =>
      !d.completedAt &&
      (() => {
        try {
          const daysSincePassed = (Date.now() - new Date(d.date).getTime()) / 86400000;
          return daysSincePassed > 0 && daysSincePassed <= 1;
        } catch {
          return false;
        }
      })(),
  );
  if (justMissedForChip) {
    s.push(`I missed my deadline for "${justMissedForChip.label}". What should I do now?`);
  } else {
    const soonestDeadline = appProfile?.deadlines?.find(
      (d) =>
        !d.completedAt &&
        (() => {
          try {
            const days = (new Date(d.date).getTime() - Date.now()) / 86400000;
            return days >= 0 && days < 14;
          } catch {
            return false;
          }
        })(),
    );
    if (soonestDeadline) {
      s.push(`I have "${soonestDeadline.label}" coming up. What should I do right now?`);
    } else {
      s.push("What should I do this week to stand out to recruiters?");
    }
  }
  const topFinding = displayAudit?.audit_findings?.[0];
  if (topFinding && topFinding.length < 100) {
    s.push(`How do I fix: "${topFinding.slice(0, 60)}..."?`);
  } else {
    if (effectiveTrack) s.push(`What do ${effectiveTrack} recruiters actually look for?`);
  }
  s.push("How can I rewrite my weakest bullet to sound more impactful?");
  if (prevAuditScores && displayAudit?.scores) {
    const deltaGrit = displayAudit.scores.grit - prevAuditScores.grit;
    const dir = deltaGrit >= 0 ? "up" : "down";
    s.push(`My Grit score went ${dir} since my last audit. Why?`);
  }
  return s.slice(0, 5);
}
