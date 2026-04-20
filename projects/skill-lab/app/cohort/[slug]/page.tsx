import { notFound } from "next/navigation";
import Link from "next/link";
import { VideoCard } from "@/components/video-card";
import { cohortFromSlug, COHORTS } from "@/lib/cohorts";
import { listVideosByCohort } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t, DEFAULT_LANG, type LangCode } from "@/lib/i18n";
import { formatDuration } from "@/lib/utils";
import type { Video } from "@/lib/types";

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

  const hero = videos[0] ?? null;
  const nextUp = videos.slice(1, 5);
  const rest = videos.slice(5);

  const channelCount = new Set(videos.map((v) => v.channel_title)).size;

  return (
    <div>
      {/* ═══ Compact header strip — name, one tagline, the stats ═══ */}
      <section className="container-app pt-10 sm:pt-14">
        <div className="flex flex-col gap-4 border-b border-[color:var(--color-border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="eyebrow">
              <Link href="/" className="hover:text-[color:var(--color-accent)]">Skill Lab</Link>
              <span className="mx-1.5 text-[color:var(--color-dim)]">·</span>
              Cohort
            </div>
            <h1 className="editorial mt-2 text-3xl font-semibold leading-[1.05] tracking-tight text-[color:var(--color-text)] sm:text-4xl lg:text-5xl">
              {cohort.name}
            </h1>
            <p className="editorial mt-1.5 text-base italic text-[color:var(--color-accent-soft)] sm:text-lg">
              {cohort.tagline}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-5 text-sm">
            <Stat value={String(videos.length)} label="videos" />
            <span className="h-8 w-px bg-[color:var(--color-border)]" />
            <Stat value={String(channelCount)} label="channels" />
          </div>
        </div>
      </section>

      {showLangFallback && (
        <div className="container-app pt-4">
          <div className="card p-3 text-xs text-[color:var(--color-muted)]">
            {t(lang, "cohort.lang_fallback")}
          </div>
        </div>
      )}

      {videos.length === 0 ? (
        <div className="container-app pt-10">
          <EmptyState lang={lang} />
        </div>
      ) : (
        <>
          {/* ═══ One hero pick + numbered next-4 ═══ */}
          <section className="container-app pt-8 sm:pt-10">
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-10">
              {hero && <HeroPick video={hero} />}
              {nextUp.length > 0 && <NextUpList videos={nextUp} start={2} />}
            </div>
          </section>

          {/* ═══ Everything else, filterable ═══ */}
          {rest.length > 0 && (
            <section className="container-app pt-16">
              <div className="flex flex-col gap-4 border-b border-[color:var(--color-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="eyebrow">Everything else</div>
                  <h2 className="editorial mt-1.5 text-xl font-semibold tracking-tight text-[color:var(--color-text)] sm:text-2xl">
                    The rest of the library
                  </h2>
                </div>
                <FilterBar
                  slug={slug}
                  sort={sort}
                  maxDurationMin={maxDurationMin}
                  lang={lang}
                />
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {rest.map((v) => (
                  <VideoCard key={v.id} video={v} lang={lang} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   The hero pick — a huge playable cover card. Same visual language as
   the Today panel so the interface feels consistent across pages.
   ═══════════════════════════════════════════════════════════════════ */
function HeroPick({ video }: { video: Video }) {
  const thumb =
    video.thumbnail_url || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  return (
    <Link
      href={`/video/${video.id}`}
      className="card card-featured group relative block overflow-hidden p-0"
      aria-label={`Play: ${video.title}`}
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        <img
          src={thumb}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-90 transition group-hover:opacity-100">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--color-accent)] shadow-[0_20px_60px_rgba(123,159,255,0.4)] transition group-hover:scale-110">
            <PlayIcon />
          </span>
        </div>
        <div className="absolute left-4 top-4 flex gap-2">
          <span className="chip chip-accent backdrop-blur">
            <span className="step-number-inline">1</span>
            Start here
          </span>
          {video.quality_score >= 85 && (
            <span className="chip chip-mint backdrop-blur">High signal</span>
          )}
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <div className="text-[0.7rem] uppercase tracking-wider text-white/70">
            {video.channel_title} · {formatDuration(video.duration_sec)}
          </div>
          <h2 className="editorial mt-2 line-clamp-2 text-xl font-semibold leading-tight text-white sm:text-2xl">
            {video.title}
          </h2>
        </div>
      </div>
    </Link>
  );
}

/* Four numbered follow-ups — tight, one-line rows, no extra ornament. */
function NextUpList({ videos, start }: { videos: Video[]; start: number }) {
  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-end justify-between">
        <div className="eyebrow">Then these</div>
        <span className="text-[0.7rem] uppercase tracking-wider text-[color:var(--color-dim)]">
          {videos.length} picks
        </span>
      </div>
      <ol className="flex-1 space-y-2">
        {videos.map((v, i) => (
          <li key={v.id}>
            <Link
              href={`/video/${v.id}`}
              className="group flex items-start gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 transition hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-raised)]"
            >
              <span className="step-number mt-0.5">{start + i}</span>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-sm font-semibold text-[color:var(--color-text)]">
                  {v.title}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[0.7rem] text-[color:var(--color-muted)]">
                  <span className="truncate">{v.channel_title}</span>
                  <span>·</span>
                  <span className="shrink-0">{formatDuration(v.duration_sec)}</span>
                </div>
              </div>
              <span className="shrink-0 text-[color:var(--color-dim)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--color-accent-soft)]">
                →
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* One consolidated filter row — clear labels, no buttons competing for attention. */
function FilterBar({
  slug, sort, maxDurationMin, lang,
}: {
  slug: string; sort: SortKey; maxDurationMin?: number; lang: LangCode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <FilterGroup label="Sort">
        <FilterLink slug={slug} params={{ sort: "best" }} active={sort === "best"}>
          {t(lang, "cohort.sort.best")}
        </FilterLink>
        <FilterLink slug={slug} params={{ sort: "newest" }} active={sort === "newest"}>
          {t(lang, "cohort.sort.newest")}
        </FilterLink>
      </FilterGroup>
      <FilterGroup label="Length">
        <FilterLink slug={slug} params={{ sort, max: "15" }} active={maxDurationMin === 15}>
          ≤ 15m
        </FilterLink>
        <FilterLink slug={slug} params={{ sort, max: "45" }} active={maxDurationMin === 45}>
          ≤ 45m
        </FilterLink>
        <FilterLink slug={slug} params={{ sort }} active={!maxDurationMin}>
          Any
        </FilterLink>
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.7rem] uppercase tracking-wider text-[color:var(--color-dim)]">
        {label}
      </span>
      <div className="flex overflow-hidden rounded-md border border-[color:var(--color-border)]">
        {children}
      </div>
    </div>
  );
}

function FilterLink({
  slug, params, active, children,
}: {
  slug: string;
  params: Record<string, string>;
  active: boolean;
  children: React.ReactNode;
}) {
  const q = new URLSearchParams(params);
  return (
    <Link
      href={`/cohort/${slug}?${q.toString()}`}
      className={
        "px-2.5 py-1 text-xs transition " +
        (active
          ? "bg-[color:var(--color-accent)] text-white font-semibold"
          : "text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-accent)]")
      }
    >
      {children}
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right">
      <div className="editorial text-xl font-semibold leading-none text-[color:var(--color-text)] sm:text-2xl">
        {value}
      </div>
      <div className="mt-1 text-[0.65rem] uppercase tracking-wider text-[color:var(--color-dim)]">
        {label}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
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
