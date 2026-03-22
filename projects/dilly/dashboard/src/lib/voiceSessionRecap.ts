/** Client-side recap of the last Voice session — shown on Career Center. */

export type VoiceSessionRecap = {
  bullets: string[];
  ts: number;
  exchangeCount: number;
};

const STORAGE_KEY = "dilly_voice_session_recap_v1";

function truncateLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Build a short recap from recent user turns (no server call). */
export function computeVoiceSessionRecap(
  messages: ReadonlyArray<{ role: string; content: string }>,
): VoiceSessionRecap | null {
  if (messages.length < 4) return null;
  const users = messages.filter((m) => m.role === "user" && (m.content || "").trim().length > 2);
  if (users.length < 2) return null;
  const lastUsers = users.slice(-3);
  const bullets = lastUsers.map((u) => truncateLine(u.content, 76));
  const exchangeCount = Math.max(1, Math.floor(messages.filter((m) => m.role === "assistant").length));
  return { bullets, ts: Date.now(), exchangeCount };
}

export function persistVoiceSessionRecap(recap: VoiceSessionRecap): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(recap));
  } catch {
    /* ignore */
  }
}

export function readVoiceSessionRecap(): VoiceSessionRecap | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as VoiceSessionRecap;
    if (!p || !Array.isArray(p.bullets) || p.bullets.length === 0) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearVoiceSessionRecap(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
