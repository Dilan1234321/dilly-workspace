import Link from "next/link";
import { CohortGrid } from "@/components/cohort-grid";
import { IndustryPicker } from "@/components/industry-picker";
import { TodayPanel } from "@/components/today-panel";
import { listTrending, listVideosByCohort } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import {
  getStreak,
  getLastWatched,
  isFirstVisit,
} from "@/lib/session-state";

const DEFAULT_COHORT = "software-engineering-cs";

export default async function HomePage() {
  const lang = await getLang();
  const [streak, lastWatched, firstVisit] = await Promise.all([
    getStreak(),
    getLastWatched(),
    isFirstVisit(),
  ]);

  // Pick today's video: from the user's last cohort if they have one, else trending.
  const todaySources = lastWatched
    ? await listVideosByCohort(lastWatched.cohort, { limit: 8, sort: "best", lang }).catch(() => [])
    : await listTrending(8, lang).catch(() => []);
  const todayVideo =
    todaySources.find((v) => v.id !== lastWatched?.id) ?? todaySources[0] ?? null;

  // Fallback if trending and last-cohort both returned nothing
  const fallbackTrending = !todayVideo
    ? await listVideosByCohort(DEFAULT_COHORT, { limit: 1, sort: "best", lang }).catch(() => [])
    : [];
  const pick = todayVideo ?? fallbackTrending[0] ?? null;

  // Count fresh videos (< 72h) so the hero can surface "N new today"
  const freshCount = todaySources.filter((v) => {
    const t = new Date(v.published_at).getTime();
    return Number.isFinite(t) && Date.now() - t < 72 * 60 * 60 * 1000;
  }).length;

  return (
    <div>
      {/* ═══ Today panel — the new front door ═══ */}
      {pick ? (
        <TodayPanel
          video={pick}
          streak={streak}
          lastWatched={lastWatched}
          fresh={freshCount}
        />
      ) : (
        <FirstRunHero firstVisit={firstVisit} />
      )}

      {/* ═══ Industry picker ═══ */}
      <section id="industries" className="container-app pt-16 sm:pt-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="eyebrow">I work in…</div>
            <h2 className="editorial mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Pick your role to see what AI is taking and what&apos;s yours to own.
            </h2>
          </div>
        </div>
        <div className="mt-6">
          <IndustryPicker />
        </div>
      </section>

      <div className="container-app">
        <div className="rule" />
      </div>

      {/* ═══ Cohort index ═══ */}
      <section id="cohorts" className="container-app pt-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Or browse by field</div>
            <h2 className="editorial mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {t(lang, "home.cohorts.heading")}
            </h2>
          </div>
          <div className="text-xs text-[color:var(--color-dim)]">
            {t(lang, "home.cohorts.count")}
          </div>
        </div>
        <div className="mt-6">
          <CohortGrid lang={lang} />
        </div>
      </section>

      {/* ═══ A single-line calling card — no marketing wall ═══ */}
      <section className="container-app pt-16">
        <div className="container-narrow">
          <p className="editorial text-lg italic leading-relaxed text-[color:var(--color-muted)] sm:text-xl">
            Skill Lab is free, forever, for everyone. We keep the list short
            so your time isn&apos;t.{" "}
            <Link
              href="/sign-up"
              className="not-italic text-white underline decoration-[color:var(--color-accent)]/50 underline-offset-4 hover:text-[color:var(--color-accent-soft)]"
            >
              Make it yours →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

function FirstRunHero({ firstVisit }: { firstVisit: boolean }) {
  return (
    <section className="container-app pt-16 sm:pt-24">
      <div className="max-w-3xl">
        <div className="eyebrow">{firstVisit ? "Start here" : "Welcome back"}</div>
        <h1 className="editorial mt-3 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Learn the skills{" "}
          <span className="italic text-[color:var(--color-accent-soft)]">
            AI can&apos;t replace.
          </span>
        </h1>
        <p className="mt-4 text-base text-[color:var(--color-muted)] sm:text-lg">
          Fetching your first pick…
        </p>
      </div>
    </section>
  );
}
