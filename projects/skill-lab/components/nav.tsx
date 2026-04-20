import Link from "next/link";
import type { SessionUser } from "@/lib/types";
import type { LangCode } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { LanguagePicker } from "./language-picker";

export function Nav({ session, lang }: { session: SessionUser | null; lang: LangCode }) {
  return (
    <header className="border-b border-[color:var(--color-border)]">
      <div className="container-app flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--color-accent)]" />
          Skill Lab
          <span className="text-xs text-[color:var(--color-muted)]">by Dilly</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-[color:var(--color-muted)] hover:text-white">
            {t(lang, "nav.browse")}
          </Link>
          <Link href="/library" className="text-[color:var(--color-muted)] hover:text-white">
            {t(lang, "nav.library")}
          </Link>
          <LanguagePicker current={lang} label={t(lang, "nav.language")} />
          {session ? (
            <>
              <span className="chip">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {session.email.split("@")[0]}
              </span>
              <form action="/api/sign-out" method="post">
                <button type="submit" className="btn btn-ghost" aria-label={t(lang, "nav.sign_out")}>
                  {t(lang, "nav.sign_out")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="btn btn-ghost">{t(lang, "nav.sign_in")}</Link>
              <Link href="/sign-up" className="btn btn-primary">{t(lang, "nav.create_account")}</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
