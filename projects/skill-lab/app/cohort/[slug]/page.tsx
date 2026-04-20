import { notFound } from "next/navigation";
import Link from "next/link";
import { VideoCard } from "@/components/video-card";
import { cohortFromSlug, COHORTS } from "@/lib/cohorts";
import { listVideosByCohort } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t, DEFAULT_LANG, type LangCode } from "@/lib/i18n";

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

  const videos = await listVideosByCohort(slug, { limit: 48, sort, maxDurationMin, lang }).catch(
    () => [],
  );

  // If the API fell back to English (because the selected language has no content
  // yet for this cohort), surface a small note.
  const showLangFallback =
    lang !== DEFAULT_LANG && videos.length > 0 && videos.every((v) => v.language === DEFAULT_LANG);

  return (
    <div className="space-y-8 pt-4">
      <header>
        <div className="text-xs text-[color:var(--color-muted)]">
          <Link href="/" className="hover:text-white">{t(lang, "cohort.breadcrumb")}</Link> /{" "}
          {cohort.name}
        </div>
        <h1 className="mt-2 text-3xl font-semibold">{cohort.name}</h1>
        <p className="mt-2 max-w-2xl text-[color:var(--color-muted)]">{cohort.blurb}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <SortPill slug={slug} current={sort} value="best" label={t(lang, "cohort.sort.best")} />
        <SortPill slug={slug} current={sort} value="newest" label={t(lang, "cohort.sort.newest")} />
        <span className="mx-2 h-4 w-px bg-[color:var(--color-border)]" />
        <DurationPill slug={slug} sort={sort} current={maxDurationMin} value={15} label={t(lang, "cohort.filter.short")} />
        <DurationPill slug={slug} sort={sort} current={maxDurationMin} value={45} label={t(lang, "cohort.filter.medium")} />
        <DurationPill slug={slug} sort={sort} current={maxDurationMin} value={undefined} label={t(lang, "cohort.filter.any")} />
      </div>

      {showLangFallback && (
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-muted)]">
          {t(lang, "cohort.lang_fallback")}
        </div>
      )}

      {videos.length === 0 ? (
        <EmptyState lang={lang} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} lang={lang} />
          ))}
        </div>
      )}
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
      style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
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
      style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
    >
      {label}
    </Link>
  );
}

function EmptyState({ lang }: { lang: LangCode }) {
  return (
    <div className="card p-8 text-center text-[color:var(--color-muted)]">
      <div className="text-sm">{t(lang, "cohort.empty.title")}</div>
      <div className="mt-1 text-xs">{t(lang, "cohort.empty.subtitle")}</div>
    </div>
  );
}
