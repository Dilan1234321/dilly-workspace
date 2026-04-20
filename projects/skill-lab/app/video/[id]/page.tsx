import { notFound } from "next/navigation";
import Link from "next/link";
import { SaveButton } from "@/components/save-button";
import { AccountNudge } from "@/components/account-nudge";
import { getSession, getVideo, listSavedVideos, listVideosByCohort } from "@/lib/api";
import { COHORTS_BY_NAME } from "@/lib/cohorts";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { formatViews, timeAgo, youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/utils";
import { VideoCard } from "@/components/video-card";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const video = await getVideo(id);
  if (!video) notFound();

  const lang = await getLang();
  const session = await getSession().catch(() => null);
  const saved = session
    ? (await listSavedVideos().catch(() => [])).some((v) => v.id === id)
    : false;

  const cohort = COHORTS_BY_NAME[video.cohort];
  const related = cohort
    ? (await listVideosByCohort(cohort.slug, { limit: 8, sort: "best", lang }).catch(() => []))
        .filter((v) => v.id !== id)
        .slice(0, 4)
    : [];

  return (
    <div className="grid grid-cols-1 gap-8 pt-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="card overflow-hidden">
          <div className="relative aspect-video bg-black">
            <iframe
              src={youtubeEmbedUrl(video.id)}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-semibold leading-snug">{video.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[color:var(--color-muted)]">
            <span>{video.channel_title}</span>
            <span>·</span>
            <span>{formatViews(video.view_count)} {t(lang, "video.views")}</span>
            <span>·</span>
            <span>{timeAgo(video.published_at)}</span>
            {cohort && (
              <>
                <span>·</span>
                <Link href={`/cohort/${cohort.slug}`} className="chip hover:text-white">
                  {cohort.name}
                </Link>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <SaveButton
              videoId={video.id}
              initiallySaved={saved}
              isAuthed={Boolean(session)}
              savedLabel={t(lang, "video.saved")}
              saveLabel={t(lang, "video.save")}
            />
            <a href={youtubeWatchUrl(video.id)} target="_blank" rel="noopener" className="btn btn-ghost">
              {t(lang, "video.open_youtube")}
            </a>
          </div>
          {video.description && (
            <p className="mt-5 whitespace-pre-wrap text-sm text-[color:var(--color-muted)]">
              {video.description}
            </p>
          )}
        </div>

        {!session && (
          <AccountNudge
            headline={t(lang, "video.nudge.headline")}
            body={t(lang, "video.nudge.body")}
            ctaLabel={t(lang, "nudge.cta")}
            nextPath={`/video/${video.id}`}
          />
        )}
      </div>

      {related.length > 0 && (
        <aside>
          <div className="mb-3 text-sm font-semibold">
            {t(lang, "video.more_in")} {video.cohort}
          </div>
          <div className="grid grid-cols-1 gap-3">
            {related.map((v) => (
              <VideoCard key={v.id} video={v} lang={lang} />
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
