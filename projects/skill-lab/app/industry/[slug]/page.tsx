import { notFound } from "next/navigation";
import Link from "next/link";
import { industryFromSlug, INDUSTRIES } from "@/lib/industries";
import { COHORTS_BY_SLUG } from "@/lib/cohorts";
import { listVideosByCohort } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { VideoCard } from "@/components/video-card";

export async function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const industry = industryFromSlug(slug);
  if (!industry) notFound();

  const lang = await getLang();

  // Pull top videos from each mapped cohort, interleave, take ~16.
  const perCohort = await Promise.all(
    industry.cohort_slugs.map((cs) =>
      listVideosByCohort(cs, { limit: 8, sort: "best", lang }).catch(() => []),
    ),
  );

  // Interleave so the library feels multi-disciplinary, not one cohort dump.
  const videos: ReturnType<typeof Array.from<typeof perCohort[number][number]>> = [];
  for (let i = 0; i < 12; i++) {
    for (const group of perCohort) {
      if (group[i]) videos.push(group[i]);
    }
  }
  const uniqueVideos = Array.from(new Map(videos.map((v) => [v.id, v])).values()).slice(0, 16);

  return (
    <div>
      {/* ── Industry hero ────────────────────────────────────────────────── */}
      <section className="container-app pb-10 pt-16 sm:pt-20">
        <div className="max-w-4xl">
          <div className="eyebrow">
            <Link href="/" className="hover:text-[color:var(--color-accent)]">Skill Lab</Link> · For your role
          </div>
          <h1 className="editorial mt-4 flex flex-wrap items-center gap-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            <span aria-hidden className="text-5xl sm:text-6xl lg:text-7xl">{industry.emoji}</span>
            <span>{industry.name}</span>
          </h1>
          <p className="editorial mt-4 text-xl italic text-[color:var(--color-accent-soft)] sm:text-2xl">
            {industry.tagline}
          </p>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[color:var(--color-muted)] sm:text-lg">
            {industry.blurb}
          </p>
        </div>
      </section>

      {/* ── At risk vs. moat ─────────────────────────────────────────────── */}
      <section className="container-app">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="card p-6">
            <div className="eyebrow text-[color:var(--color-gold)]">What AI is taking</div>
            <p className="mt-3 text-[1rem] leading-relaxed text-[color:var(--color-text)]">
              {industry.at_risk}
            </p>
          </div>
          <div className="card card-featured relative overflow-hidden p-6">
            <div className="eyebrow text-[color:var(--color-accent-soft)]">Your moat</div>
            <p className="mt-3 text-[1rem] leading-relaxed text-[color:var(--color-text)]">
              {industry.moat}
            </p>
          </div>
        </div>
      </section>

      {/* ── Skills to learn ──────────────────────────────────────────────── */}
      <section className="container-app pt-16">
        <div className="max-w-3xl">
          <div className="eyebrow">Stay ahead</div>
          <h2 className="editorial mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Skills to learn, starting now
          </h2>
          <p className="mt-3 text-[color:var(--color-muted)]">
            The shortlist we&apos;d recommend to someone in your role. Short enough to finish, broad enough to matter.
          </p>
        </div>
        <ol className="mt-8 grid gap-3 md:grid-cols-2">
          {industry.ai_skills.map((skill, i) => (
            <li
              key={skill}
              className="card flex items-start gap-4 p-5"
            >
              <span className="step-number mt-0.5">{i + 1}</span>
              <span className="text-[1rem] font-medium leading-snug text-[color:var(--color-text)]">{skill}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Library — videos curated for this role ───────────────────────── */}
      <section className="container-app pt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="eyebrow">Library</div>
            <h2 className="editorial mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Videos picked for {industry.name.toLowerCase()}s
            </h2>
            <p className="mt-3 text-[color:var(--color-muted)]">
              A mix drawn from the cohorts that feed this role. Start anywhere.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {industry.cohort_slugs.map((cs) => {
              const c = COHORTS_BY_SLUG[cs];
              if (!c) return null;
              return (
                <Link key={cs} href={`/cohort/${cs}`} className="chip hover:text-[color:var(--color-accent)]">
                  {c.name}
                </Link>
              );
            })}
          </div>
        </div>

        {uniqueVideos.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {uniqueVideos.map((v) => (
              <VideoCard key={v.id} video={v} lang={lang} />
            ))}
          </div>
        ) : (
          <div className="card mt-8 p-8 text-center text-[color:var(--color-muted)]">
            <div className="text-sm">{t(lang, "cohort.empty.title")}</div>
            <div className="mt-1 text-xs">{t(lang, "cohort.empty.subtitle")}</div>
          </div>
        )}
      </section>
    </div>
  );
}
