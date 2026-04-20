// Server-only helpers for resolving the active language.
// Source of truth: `skilllab_lang` cookie. Falls back to English.

import { cookies, headers } from "next/headers";
import { DEFAULT_LANG, isSupportedLang, LangCode, normalizeLang } from "./i18n";

export const LANG_COOKIE = "skilllab_lang";

/** Active language for this request, usable in any server component. */
export async function getLang(): Promise<LangCode> {
  const store = await cookies();
  const fromCookie = store.get(LANG_COOKIE)?.value;
  if (isSupportedLang(fromCookie)) return fromCookie;

  // Soft default from browser Accept-Language, but only for supported codes.
  const h = await headers();
  const accept = h.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.split(";")[0].trim().toLowerCase().split("-")[0];
    if (isSupportedLang(code)) return code;
  }
  return DEFAULT_LANG;
}

/** Typed wrapper around URL `?lang=` for pages that want override support. */
export function langFromSearchParams(raw: unknown): LangCode | null {
  if (typeof raw !== "string") return null;
  const code = normalizeLang(raw);
  return code;
}
