import Link from "next/link";
import Image from "next/image";
import type { SessionUser } from "@/lib/types";
import type { LangCode } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { LanguagePicker } from "./language-picker";
import { StreakChip, TimeInvestedChip } from "./live-nav-state";
import { CommandTrigger } from "./command-palette";

export function Nav({
  session,
  lang,
  streak,
}: {
  session: SessionUser | null;
  lang: LangCode;
  streak: number;
}) {
  return (
    <header className="glass sticky top-0 z-50">
      <div className="container-app flex h-20 items-center justify-between gap-3 sm:h-24">
        <Link href="/" className="group flex items-center gap-4">
          <span className="relative block h-12 w-28 shrink-0 sm:h-14 sm:w-32">
            <Image
              src="/dilly-logo.png"
              alt="dilly"
              fill
              priority
              className="object-contain"
              sizes="(min-width: 640px) 128px, 112px"
            />
          </span>
          <span className="editorial hidden text-[1.05rem] text-[color:var(--color-text)]/75 group-hover:text-[color:var(--color-accent)] sm:inline">
            Skill Lab
          </span>
        </Link>

        {/* Live state sits front and center — the thing that says "this is yours" */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <StreakChip streak={streak} />
          <TimeInvestedChip />
        </div>

        <nav className="flex items-center gap-1.5 text-sm sm:gap-2">
          <CommandTrigger label="Search" />
          <Link href="/today" className="hidden px-2 py-1 text-[color:var(--color-muted)] hover:text-[color:var(--color-accent)] md:inline">
            Today
          </Link>
          <Link href="/library" className="hidden px-2 py-1 text-[color:var(--color-muted)] hover:text-[color:var(--color-accent)] md:inline">
            {t(lang, "nav.library")}
          </Link>
          <span className="mx-1 hidden h-5 w-px bg-[color:var(--color-border)] md:inline-block" />
          <LanguagePicker current={lang} label={t(lang, "nav.language")} />
          {session ? (
            <>
              <span className="chip ml-1 hidden sm:inline-flex">
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
              <Link href="/sign-in" className="btn btn-ghost ml-1 hidden sm:inline-flex">
                {t(lang, "nav.sign_in")}
              </Link>
              <Link href="/sign-up" className="btn btn-primary">
                {t(lang, "nav.create_account")}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
