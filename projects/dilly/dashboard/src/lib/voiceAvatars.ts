/**
 * Predefined avatar options for Dilly. Numbered avatars first (backward compat), then doge, dragon, owl, plus two new avatars.
 * No custom uploads allowed. (avatar-10 was removed as duplicate of avatar-09; gator removed)
 */
const AVATAR_NUMS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31"];
const CHARACTER_AVATARS = ["doge", "dragon", "owl", "avatar-new1", "avatar-new2"];
export const VOICE_AVATAR_OPTIONS = [
  ...AVATAR_NUMS.map((num) => `/voice-avatars/avatar-${num}.png`),
  ...CHARACTER_AVATARS.map((name) => `/default-avatars/${name}.png`),
];

/** Default Dilly avatar index for new users (avatar-02 = man glyph). */
export const DEFAULT_VOICE_AVATAR_INDEX = 1;

/** Default Dilly avatar when none selected. Only for Voice avatar, NOT user profile photo. */
export const DEFAULT_VOICE_AVATAR_URL = VOICE_AVATAR_OPTIONS[DEFAULT_VOICE_AVATAR_INDEX] ?? "/voice-avatars/avatar-02.png";

export function getVoiceAvatarUrl(index: number | null): string | null {
  if (index == null || index < 0 || index >= VOICE_AVATAR_OPTIONS.length) return DEFAULT_VOICE_AVATAR_URL;
  return VOICE_AVATAR_OPTIONS[index];
}
