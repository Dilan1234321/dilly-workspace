import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSupportedLang } from "@/lib/i18n";
import { LANG_COOKIE } from "@/lib/lang-server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body?.lang === "string" ? body.lang.toLowerCase() : "";
  if (!isSupportedLang(code)) {
    return NextResponse.json({ error: "unsupported" }, { status: 400 });
  }
  const store = await cookies();
  store.set(LANG_COOKIE, code, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
  return NextResponse.json({ ok: true, lang: code });
}
