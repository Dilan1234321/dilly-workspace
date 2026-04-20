import Link from "next/link";
import { CohortGrid } from "@/components/cohort-grid";
import { VideoCard } from "@/components/video-card";
import { listTrending } from "@/lib/api";

export default async function HomePage() {
  const trending = await listTrending(8).catch(() => []);

  return (
    <div className="space-y-16">
      <section className="pt-10">
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          The best YouTube videos for your field,{" "}
          <span className="text-[color:var(--color-accent)]">sorted for you.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[color:var(--color-muted)]">
          Skill Lab is a free library of the highest-signal learning videos across 22 cohorts.
          No noise, no fluff, no account required. Built by Dilly.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#cohorts" className="btn btn-primary">Browse by cohort</a>
          <Link href="/library" className="btn btn-ghost">Your library</Link>
        </div>
      </section>

      {trending.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl font-semibold">Trending this week</h2>
            <span className="text-xs text-[color:var(--color-muted)]">
              Highest-signal picks across all cohorts
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trending.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </section>
      )}

      <section id="cohorts">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-semibold">Browse by cohort</h2>
          <span className="text-xs text-[color:var(--color-muted)]">22 fields</span>
        </div>
        <CohortGrid />
      </section>
    </div>
  );
}
