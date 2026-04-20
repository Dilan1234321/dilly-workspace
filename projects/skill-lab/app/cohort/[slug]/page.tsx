import { notFound } from "next/navigation";
import Link from "next/link";
import { VideoCard } from "@/components/video-card";
import { cohortFromSlug, COHORTS } from "@/lib/cohorts";
import { listVideosByCohort } from "@/lib/api";

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

  const sort: SortKey = sp.sort === "newest" ? "newest" : "best";
  const maxDurationMin = sp.max ? Number(sp.max) : undefined;

  const videos = await listVideosByCohort(slug, { limit: 48, sort, maxDurationMin }).catch(
    () => [],
  );

  return (
    <div className="space-y-8 pt-4">
      <header>
        <div className="text-xs text-[color:var(--color-muted)]">
          <Link href="/" className="hover:text-white">Skill Lab</Link> / cohort
        </div>
        <h1 className="mt-2 text-3xl font-semibold">{cohort.name}</h1>
        <p className="mt-2 max-w-2xl text-[color:var(--color-muted)]">{cohort.blurb}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <SortPill slug={slug} current={sort} value="best" label="Best" />
        <SortPill slug={slug} current={sort} value="newest" label="Newest" />
        <span className="mx-2 h-4 w-px bg-[color:var(--color-border)]" />
        <DurationPill slug={slug} sort={sort} current={maxDurationMin} value={15} label="Under 15 min" />
        <DurationPill slug={slug} sort={sort} current={maxDurationMin} value={45} label="Under 45 min" />
        <DurationPill slug={slug} sort={sort} current={maxDurationMin} value={undefined} label="Any length" />
      </div>

      {videos.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
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

function EmptyState() {
  return (
    <div className="card p-8 text-center text-[color:var(--color-muted)]">
      <div className="text-sm">
        We&apos;re still pulling the first batch of videos for this cohort.
      </div>
      <div className="mt-1 text-xs">
        Nightly ingestion runs at 3am ET. Come back tomorrow.
      </div>
    </div>
  );
}
