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
      <div className="container-app flex h-20 items-center gap-3 sm:h-24 sm:gap-5">
        {/* ── Logo: tight cluster so "Skill Lab" sits snug against the wordmark ── */}
        <Link href="/" className="group flex shrink-0 items-center gap-1.5">
          <span className="relative block h-12 w-24 sm:h-14 sm:w-28">
            <Image
              src="/dilly-logo.png"
              alt="dilly"
              fill
              priority
              className="object-contain"
              sizes="(min-width: 640px) 112px, 96px"
            />
          </span>
          <span className="editorial hidden text-[1rem] leading-none text-[color:var(--color-text)]/75 group-hover:text-[color:var(--color-accent)] sm:inline">
            Skill Lab
          </span>
        </Link>

        {/* ── Big search bar: the front-and-center power tool ── */}
        <div className="flex flex-1 items-center justify-center gap-2 sm:gap-3">
          <CommandTrigger label="Search roles, fields, videos…" />
        </div>

        {/* ── Live state + secondary nav ── */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1.5 md:flex">
            <StreakChip streak={streak} />
            <TimeInvestedChip />
          </div>
          <Link href="/browse" className="hidden px-2 py-1 text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-accent)] lg:inline">
            Browse
          </Link>
          <Link href="/library" className="hidden px-2 py-1 text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-accent)] lg:inline">
            {t(lang, "nav.library")}
          </Link>
          <LanguagePicker current={lang} label={t(lang, "nav.language")} />
          {session ? (
            <form action="/api/sign-out" method="post">
              <button type="submit" className="btn btn-ghost" aria-label={t(lang, "nav.sign_out")}>
                {t(lang, "nav.sign_out")}
              </button>
            </form>
          ) : (
            <Link href="/sign-up" className="btn btn-primary">
              {t(lang, "nav.create_account")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
