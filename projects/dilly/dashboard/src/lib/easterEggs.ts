/**
 * Easter eggs: hidden delights for engaged users.
 * Check on audit complete, avatar tap, etc.
 */

import type { AuditV2 } from "@/types/dilly";

const SEEN_KEY = "dilly_easter_eggs_seen";

function hasSeen(id: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    return seen.includes(id);
  } catch {
    return false;
  }
}

function markSeen(id: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    if (!seen.includes(id)) {
      seen.push(id);
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    }
  } catch {
    /* ignore */
  }
}

export type EasterEggResult = {
  id: string;
  message: string;
  confetti?: boolean;
  sound?: "celebration" | "badge";
};

/** Check easter eggs after audit completes. */
export function checkAuditEasterEggs(audit: AuditV2): EasterEggResult | null {
  // Century Club: final score 100
  if (audit.final_score >= 99.5) {
    if (!hasSeen("century_club")) {
      markSeen("century_club");
      return { id: "century_club", message: "Century Club! 🏆 You hit 100. Legendary.", confetti: true, sound: "celebration" };
    }
  }

  // Triple threat: all dims Top 25%
  const pct = audit.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
  const dims = ["smart", "grit", "build"] as const;
  const allTop25 = dims.every((k) => Math.max(1, 100 - (pct[k] ?? 50)) <= 25);
  if (allTop25) {
    if (!hasSeen("triple_threat")) {
      markSeen("triple_threat");
      return { id: "triple_threat", message: "Triple threat! Top 25% in Smart, Grit, and Build. 🔥", confetti: true, sound: "celebration" };
    }
  }

  // One-pager perfection: exactly 1 page
  const pageCount = audit.page_count ?? 0;
  if (pageCount === 1) {
    if (!hasSeen("one_pager")) {
      markSeen("one_pager");
      return { id: "one_pager", message: "One-pager perfection. Recruiters love it. ✨", sound: "badge" };
    }
  }

  return null;
}

/** Check easter egg on avatar tap (7 times). */
export function checkAvatarTapEasterEgg(tapCount: number): EasterEggResult | null {
  if (tapCount === 7) {
    if (!hasSeen("avatar_tap_7")) {
      markSeen("avatar_tap_7");
      return { id: "avatar_tap_7", message: "You found me! 🦉 Seven taps. You're persistent.", sound: "badge" };
    }
  }
  return null;
}

/** Check midnight visit (first visit of the day at 00:xx). */
export function checkMidnightEasterEgg(): EasterEggResult | null {
  const now = new Date();
  if (now.getHours() !== 0) return null;
  const key = `night_owl_${now.toDateString()}`;
  if (!hasSeen(key)) {
    markSeen(key);
    return { id: "night_owl", message: "Night owl! 🌙 Burning the midnight oil. Your future self thanks you.", sound: "badge" };
  }
  return null;
}
