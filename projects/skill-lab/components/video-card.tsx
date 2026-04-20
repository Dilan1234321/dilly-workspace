import Link from "next/link";
import type { Video } from "@/lib/types";
import type { LangCode } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { formatDuration, formatViews, timeAgo } from "@/lib/utils";

export function VideoCard({ video, lang }: { video: Video; lang: LangCode }) {
  const thumb =
    video.thumbnail_url ||
    `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  return (
    <Link href={`/video/${video.id}`} className="card block overflow-hidden">
      <div className="relative aspect-video bg-black">
        <img
          src={thumb}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {video.duration_sec > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium">
            {formatDuration(video.duration_sec)}
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="line-clamp-2 text-sm font-semibold leading-snug">
          {video.title}
        </div>
        <div className="mt-1.5 text-xs text-[color:var(--color-muted)]">
          {video.channel_title}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-muted)]">
          <span>{formatViews(video.view_count)} {t(lang, "video.views")}</span>
          <span>·</span>
          <span>{timeAgo(video.published_at)}</span>
          {video.quality_score >= 75 && (
            <>
              <span>·</span>
              <span className="text-[color:var(--color-accent)]">{t(lang, "video.high_signal")}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
