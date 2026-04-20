import { notFound } from "next/navigation";
import Link from "next/link";
import { VideoCard } from "@/components/video-card";
import { cohortFromSlug, COHORTS } from "@/lib/cohorts";
import { listVideosByCohort } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t, DEFAULT_LANG, type LangCode } from "@/lib/i18n";
import { formatDuration } from "@/lib/utils";

type SortKey = "best" | "newest";

export async function generateStaticParams() {
  return COHORTS.map((c) => ({ slug: c.slug }));
}

export default async function CohortPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; max?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const cohort = cohortFromSlug(slug);
  if (!cohort) notFound();

  const lang = await getLang();
  const sort: SortKey = sp.sort === "newest" ? "newest" : "best";
  const maxDurationMin = sp.max ? Number(sp.max) : undefined;

  const videos = await listVideosByCohort(slug, {
    limit: 48, sort, maxDurationMin, lang,
  }).catch(() => []);

  const showLangFallback =
    lang !== DEFAULT_LANG && videos.length > 0 && videos.every((v) => v.language === DEFAULT_LANG);

  const startHere = videos.slice(0, 5);
  const library = videos.slice(5);

  return (
    <div>
      {/* ═══ Cohort hero ═══ */}
      <section className="container-app pb-8 pt-14 sm:pt-20">
        <div className="max-w-4xl">
          <div className="eyebrow">
            <Link href="/" className="hover:text-white">Skill Lab</Link> · Cohort
          </div>
          <h1 className="editorial mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {cohort.name}
          </h1>
          <p className="editorial mt-3 text-xl italic text-[color:var(--color-accent-soft)] sm:text-2xl">
            {cohort.tagline}
          </p>
          <p className="mt-5 max-w-2xl leading-relaxed text-[color:var(--color-muted)]">
            {cohort.blurb}
          </p>
        </div>
      </section>

      {showLangFallback && (
        <div className="container-app">
          <div className="card mb-4 p-3 text-xs text-[color:var(--color-muted)]">
            {t(lang, "cohort.lang_fallback")}
          </div>
        </div>
      )}

      {/* ═══ Start here — numbered sequence ═══ */}
      {startHere.length > 0 && (
        <section className="container-app pt-6">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Start here</div>
              <h2 className="editorial mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                A 5-step path through the fundamentals
              </h2>
            </div>
            <div className="text-xs text-[color:var(--color-dim)]">
              ~{Math.round(startHere.reduce((s, v) => s + v.duration_sec, 0) / 60)} min total
            </div>
          </div>
          <ol className="space-y-3">
            {startHere.map((v, i) => (
              <li key={v.id}>
                <Link
                  href={`/video/${v.id}`}
                  className="card card-featured relative flex items-start gap-4 p-4 sm:p-5"
                >
                  <span className="step-number mt-0.5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[1rem] font-semibold leading-snug text-white sm:text-[1.05rem]">
                      {v.title}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted)]">
                      <span>{v.channel_title}</span>
                      <span>·</span>
                      <span>{formatDuration(v.duration_sec)}</span>
                      {v.quality_score >= 85 && (
                        <>
                          <span>·</span>
                          <span className="text-[color:var(--color-accent-soft)]">
                            {t(lang, "video.high_signal")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="hidden shrink-0 text-[color:var(--color-dim)] sm:inline">→</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ═══ The full library ═══ */}
      <section className="container-app pt-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">The library</div>
            <h2 className="editorial mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything we&apos;ve ranked for {cohort.name.toLowerCase()}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SortPill slug={slug} current={sort} value="best" label={t(lang, "cohort.sort.best")} />
            <SortPill slug={slug} current={sort} value="newest" label={t(lang, "cohort.sort.newest")} />
            <span className="mx-1 h-5 w-px bg-[color:var(--color-border)]" />
            <DurationPill slug={slug} sort={sort} current={maxDurationMin} value={15} label={t(lang, "cohort.filter.short")} />
            <DurationPill slug={slug} sort={sort} current={maxDurationMin} value={45} label={t(lang, "cohort.filter.medium")} />
            <DurationPill slug={slug} sort={sort} current={maxDurationMin} value={undefined} label={t(lang, "cohort.filter.any")} />
          </div>
        </div>

        {library.length === 0 && startHere.length === 0 ? (
          <EmptyState lang={lang} />
        ) : library.length === 0 ? (
          <div className="text-sm text-[color:var(--color-dim)]">
            That&apos;s the full library for now. Check back after the next ingest.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {library.map((v) => (
              <VideoCard key={v.id} video={v} lang={lang} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SortPill({
  slug, current, value, label,
}: { slug: string; current: SortKey; value: SortKey; label: string }) {
  const active = current === value;
  return (
    <Link
      href={`/cohort/${slug}?sort=${value}`}
      className={active ? "btn btn-primary" : "btn btn-ghost"}
      style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
    >
      {label}
    </Link>
  );
}

function DurationPill({
  slug, sort, current, value, label,
}: { slug: string; sort: SortKey; current?: number; value?: number; label: string }) {
  const active = current === value;
  const q = new URLSearchParams({ sort });
  if (value) q.set("max", String(value));
  return (
    <Link
      href={`/cohort/${slug}?${q.toString()}`}
      className={active ? "btn btn-primary" : "btn btn-ghost"}
      style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
    >
      {label}
    </Link>
  );
}

function EmptyState({ lang }: { lang: LangCode }) {
  return (
    <div className="card p-12 text-center text-[color:var(--color-muted)]">
      <div className="text-base">{t(lang, "cohort.empty.title")}</div>
      <div className="mt-2 text-xs text-[color:var(--color-dim)]">
        {t(lang, "cohort.empty.subtitle")}
      </div>
    </div>
  );
}
