import Link from "next/link";
import type { Video } from "@/lib/types";
import type { LangCode } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { formatDuration, timeAgo } from "@/lib/utils";

const FRESH_MS = 72 * 60 * 60 * 1000;

function isFresh(publishedIso: string): boolean {
  const t = new Date(publishedIso).getTime();
  return Number.isFinite(t) && Date.now() - t < FRESH_MS;
}

export function VideoCard({ video, lang }: { video: Video; lang: LangCode }) {
  const thumb =
    video.thumbnail_url ||
    `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  const fresh = isFresh(video.published_at);
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
        <div className="absolute left-2 top-2 flex gap-1">
          {fresh && (
            <span className="chip chip-mint backdrop-blur">
              <span className="h-1 w-1 animate-pulse rounded-full bg-[color:var(--color-mint)]" />
              Fresh
            </span>
          )}
          {video.quality_score >= 85 && !fresh && (
            <span className="chip chip-accent backdrop-blur">
              {t(lang, "video.high_signal")}
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-[color:var(--color-text)]">
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
