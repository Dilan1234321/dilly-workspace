import Link from "next/link";
import type { Video } from "@/lib/types";
import type { Cohort } from "@/lib/cohorts";
import type { LangCode } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { formatDuration } from "@/lib/utils";

type Props = {
  cohort: Cohort;
  videos: Video[];
  lang: LangCode;
};

/**
 * Editorial feature: a week's "Start here" path, rendered as a numbered
 * sequence. This is the primary differentiator from other video aggregators —
 * users see a curated syllabus, not a search grid.
 */
export function FeaturedPath({ cohort, videos, lang }: Props) {
  const totalSeconds = videos.reduce((s, v) => s + (v.duration_sec || 0), 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  const visible = videos.slice(0, 5);

  return (
    <div className="grid gap-10 lg:grid-cols-[340px_1fr]">
      <aside className="lg:pt-2">
        <div className="eyebrow">This week&apos;s path</div>
        <h2 className="editorial mt-3 text-3xl font-semibold tracking-tight">
          {cohort.name}
        </h2>
        <p className="editorial mt-3 text-lg italic leading-snug text-[color:var(--color-muted)]">
          {cohort.tagline}
        </p>
        <p className="mt-5 text-sm leading-relaxed text-[color:var(--color-muted)]">
          A sequenced read of the best {cohort.name.toLowerCase()} videos on YouTube this quarter. Watch in order if
          you&apos;re new to the field, or jump to whatever you need.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="chip chip-accent">{visible.length} videos</span>
          <span className="chip">{totalMinutes} min total</span>
        </div>
        <Link
          href={`/cohort/${cohort.slug}`}
          className="btn btn-ghost mt-6"
        >
          Open the full path →
        </Link>
      </aside>

      <ol className="space-y-3">
        {visible.map((v, i) => (
          <li key={v.id}>
            <Link
              href={`/video/${v.id}`}
              className="card card-featured relative flex items-start gap-4 p-4 sm:p-5"
            >
              <span className="step-number mt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[0.95rem] font-semibold leading-snug text-[color:var(--color-text)]">
                  {v.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted)]">
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
    </div>
  );
}
