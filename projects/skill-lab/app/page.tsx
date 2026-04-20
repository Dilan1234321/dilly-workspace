import Link from "next/link";
import { CohortGrid } from "@/components/cohort-grid";
import { FeaturedPath } from "@/components/featured-path";
import { IndustryPicker } from "@/components/industry-picker";
import { listVideosByCohort } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { COHORTS_BY_SLUG } from "@/lib/cohorts";

// Featured path — rotate weekly for editorial cadence.
const FEATURED_SLUG = "software-engineering-cs";

export default async function HomePage() {
  const lang = await getLang();
  const featuredCohort = COHORTS_BY_SLUG[FEATURED_SLUG];
  const featuredVideos = await listVideosByCohort(FEATURED_SLUG, {
    limit: 5,
    sort: "best",
    lang,
  }).catch(() => []);

  return (
    <div>
      {/* ═══ Hero — AI-proof positioning, primary CTA = pick your role ═══ */}
      <section className="container-app relative pb-16 pt-20 sm:pt-28">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip chip-accent">Free. Forever. No account needed.</span>
            <span className="chip">By Dilly</span>
          </div>
          <h1 className="editorial mt-5 text-[2.4rem] font-semibold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
            Learn the skills{" "}
            <span className="italic text-[color:var(--color-accent-soft)]">
              AI can&apos;t replace.
            </span>
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-relaxed text-[color:var(--color-muted)] sm:text-lg lg:text-xl">
            Every job is being rewritten. Pick your role and we&apos;ll show you exactly which
            skills matter now — curated from the highest-signal videos on YouTube. No fluff,
            no paywalls, no account required.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#industries" className="btn btn-primary">
              Pick your role →
            </a>
            <a href="#cohorts" className="btn btn-ghost">
              Or browse by field
            </a>
          </div>
        </div>
      </section>

      {/* ═══ Industry picker — the new front door ═══ */}
      <section id="industries" className="container-app pt-6 sm:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="eyebrow">Start here</div>
            <h2 className="editorial mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              I work in…
            </h2>
            <p className="mt-2 text-[color:var(--color-muted)]">
              Pick your role. We&apos;ll show you what&apos;s at risk, what&apos;s safe, and the
              skills worth learning now.
            </p>
          </div>
        </div>
        <div className="mt-8">
          <IndustryPicker />
        </div>
      </section>

      <div className="container-app">
        <div className="rule" />
      </div>

      {/* ═══ Featured path ═══ */}
      {featuredVideos.length > 0 && featuredCohort && (
        <section className="container-app">
          <FeaturedPath
            cohort={featuredCohort}
            videos={featuredVideos}
            lang={lang}
          />
        </section>
      )}

      <div className="container-app">
        <div className="rule" />
      </div>

      {/* ═══ Full cohort index ═══ */}
      <section id="cohorts" className="container-app pt-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Or browse by field</div>
            <h2 className="editorial mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t(lang, "home.cohorts.heading")}
            </h2>
          </div>
          <div className="text-xs text-[color:var(--color-dim)]">
            {t(lang, "home.cohorts.count")}
          </div>
        </div>
        <div className="mt-8">
          <CohortGrid lang={lang} />
        </div>
      </section>

      {/* ═══ Closing manifesto — trust-building short essay ═══ */}
      <section className="container-app pt-24">
        <div className="container-narrow">
          <div className="eyebrow">Why this exists</div>
          <h2 className="editorial mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            The internet is full of videos.{" "}
            <span className="italic text-[color:var(--color-accent-soft)]">
              This is a shortlist.
            </span>
          </h2>
          <div className="mt-6 space-y-4 text-[color:var(--color-muted)]">
            <p className="leading-relaxed">
              College teaches what was true ten years ago. YouTube gives you a billion rabbit
              holes. Neither tells you what to learn <em>now</em> so the next decade isn&apos;t
              something that happens to you.
            </p>
            <p className="leading-relaxed">
              Skill Lab is the shortlist. We rank videos for real learning signal — depth, channel
              authority, topical fit — and organize them by the roles people actually have and
              the majors people actually study. Nothing to buy. No account to browse. Just the
              good stuff, in an order that makes sense.
            </p>
            <p className="leading-relaxed">
              If it helps you pick up one skill that matters, we&apos;ll have done our job.
            </p>
          </div>
          <div className="mt-8">
            <Link href="/sign-up" className="btn btn-ghost">
              Save what you love (optional) →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
