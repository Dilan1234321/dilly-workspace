/**
 * Voice-related utilities: storage keys, intro state, greeting text.
 */

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
