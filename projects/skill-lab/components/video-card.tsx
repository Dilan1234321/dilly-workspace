import Link from "next/link";
import type { Video } from "@/lib/types";
import type { LangCode } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { formatDuration, timeAgo } from "@/lib/utils";

/**
 * Video card — editorial, not YouTube-shaped.
 * De-emphasizes view counts (that's YouTube social proof). Leads with channel
 * trust, duration, and a "high signal" badge when quality is well above the
 * curation threshold.
 */
export function VideoCard({ video, lang }: { video: Video; lang: LangCode }) {
  const thumb =
    video.thumbnail_url ||
    `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  return (
    <Link
      href={`/video/${video.id}`}
      className="card group block overflow-hidden transition hover:-translate-y-0.5"
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        {video.duration_sec > 0 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-medium backdrop-blur-sm">
            {formatDuration(video.duration_sec)}
          </span>
        )}
        {video.quality_score >= 85 && (
          <span className="chip chip-accent absolute left-2 top-2">
            {t(lang, "video.high_signal")}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-white">
          {video.title}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[color:var(--color-muted)]">
          <span className="truncate">{video.channel_title}</span>
          <span className="shrink-0 text-[color:var(--color-dim)]">
            {timeAgo(video.published_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}
