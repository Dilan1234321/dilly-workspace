import Link from "next/link";
import Image from "next/image";
import type { SessionUser } from "@/lib/types";
import type { LangCode } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { LanguagePicker } from "./language-picker";

export function Nav({ session, lang }: { session: SessionUser | null; lang: LangCode }) {
  return (
    <header className="glass sticky top-0 z-50">
      <div className="container-app flex h-16 items-center justify-between">
        <Link href="/" className="group flex items-center gap-3">
          <span className="relative block h-7 w-16 shrink-0">
            <Image
              src="/dilly-logo.png"
              alt="dilly"
              fill
              priority
              className="object-contain invert brightness-[1.08]"
              sizes="64px"
            />
          </span>
          <span className="editorial text-[0.95rem] text-[color:var(--color-text)]/80 group-hover:text-white">
            Skill Lab
          </span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="px-2 py-1 text-[color:var(--color-muted)] hover:text-white">
            {t(lang, "nav.browse")}
          </Link>
          <Link href="/library" className="px-2 py-1 text-[color:var(--color-muted)] hover:text-white">
            {t(lang, "nav.library")}
          </Link>
          <span className="mx-1 hidden h-5 w-px bg-[color:var(--color-border)] sm:inline-block" />
          <LanguagePicker current={lang} label={t(lang, "nav.language")} />
          {session ? (
            <>
              <span className="chip ml-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-mint)]" />
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
              <Link href="/sign-in" className="btn btn-ghost ml-1">{t(lang, "nav.sign_in")}</Link>
              <Link href="/sign-up" className="btn btn-primary">{t(lang, "nav.create_account")}</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
