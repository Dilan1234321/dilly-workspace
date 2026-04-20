import { notFound } from "next/navigation";
import Link from "next/link";
import { SaveButton } from "@/components/save-button";
import { AccountNudge } from "@/components/account-nudge";
import { getSession, getVideo, listSavedVideos, listVideosByCohort } from "@/lib/api";
import { COHORTS_BY_NAME } from "@/lib/cohorts";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { formatDuration, timeAgo, youtubeWatchUrl } from "@/lib/utils";
import { VideoPlayer } from "@/components/video-player";

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

  // Streak + last-watched are written from the client-side <WatchTracker/>
  // (server components can't mutate cookies).

  // "Where this fits" — pull the cohort's best and find this video's position.
  const cohortTopVideos = cohort
    ? await listVideosByCohort(cohort.slug, { limit: 12, sort: "best", lang }).catch(() => [])
    : [];
  const positionIndex = cohortTopVideos.findIndex((v) => v.id === id);
  const nextVideo =
    positionIndex >= 0 && positionIndex < cohortTopVideos.length - 1
      ? cohortTopVideos[positionIndex + 1]
      : null;
  const related = cohortTopVideos.filter((v) => v.id !== id).slice(0, 5);

  return (
    <div className="container-app pb-16 pt-8 sm:pt-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-12">
        {/* ═══ Player + meta ═══ */}
        <div className="space-y-6">
          <Link
            href={cohort ? `/cohort/${cohort.slug}` : "/"}
            className="text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-accent)]"
          >
            ← {cohort?.name ?? "Skill Lab"}
          </Link>

          <div className="card overflow-hidden">
            <VideoPlayer
              videoId={video.id}
              cohortSlug={cohort?.slug ?? null}
              title={video.title}
            />
          </div>

          <div>
            <h1 className="editorial text-2xl font-semibold leading-tight tracking-tight text-[color:var(--color-text)] sm:text-3xl">
              {video.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[color:var(--color-muted)]">
              <span className="font-medium text-[color:var(--color-text)]">{video.channel_title}</span>
              <span>·</span>
              <span>{formatDuration(video.duration_sec)}</span>
              <span>·</span>
              <span>{timeAgo(video.published_at)}</span>
              {cohort && (
                <>
                  <span>·</span>
                  <Link href={`/cohort/${cohort.slug}`} className="chip hover:text-[color:var(--color-accent)]">
                    {cohort.name}
                  </Link>
                </>
              )}
              {video.quality_score >= 85 && (
                <>
                  <span>·</span>
                  <span className="chip chip-accent">
                    {t(lang, "video.high_signal")}
                  </span>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
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
              {nextVideo && (
                <Link href={`/video/${nextVideo.id}`} className="btn btn-ghost">
                  Next in path →
                </Link>
              )}
            </div>

            {video.description && (
              <details className="mt-6 text-sm text-[color:var(--color-muted)]">
                <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-[color:var(--color-dim)] hover:text-[color:var(--color-accent)]">
                  Full description
                </summary>
                <p className="mt-3 whitespace-pre-wrap leading-relaxed">
                  {video.description}
                </p>
              </details>
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

        {/* ═══ Where this fits sidebar ═══ */}
        <aside className="space-y-8">
          {cohort && positionIndex >= 0 && (
            <div className="card p-5">
              <div className="eyebrow">Where this fits</div>
              <div className="editorial mt-3 text-lg font-semibold leading-snug text-[color:var(--color-text)]">
                Step {positionIndex + 1} in the {cohort.name.toLowerCase()} path
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--color-border)]">
                <div
                  className="h-full rounded-full bg-[color:var(--color-accent)]"
                  style={{
                    width: `${Math.min(100, ((positionIndex + 1) / cohortTopVideos.length) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-[color:var(--color-dim)]">
                {positionIndex + 1} of {cohortTopVideos.length} in this cohort&apos;s top library
              </div>
              {nextVideo && (
                <Link
                  href={`/video/${nextVideo.id}`}
                  className="mt-5 block rounded-lg border border-[color:var(--color-border)] p-3 transition hover:border-[color:var(--color-accent)]/40 hover:bg-[color:var(--color-surface)]"
                >
                  <div className="text-xs text-[color:var(--color-dim)]">Up next</div>
                  <div className="mt-1 line-clamp-2 text-sm font-semibold text-[color:var(--color-text)]">
                    {nextVideo.title}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                    {nextVideo.channel_title} · {formatDuration(nextVideo.duration_sec)}
                  </div>
                </Link>
              )}
            </div>
          )}

          {related.length > 0 && (
            <div>
              <div className="eyebrow">More from this cohort</div>
              <ul className="mt-3 space-y-2">
                {related.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/video/${v.id}`}
                      className="block rounded-lg border border-transparent p-2 transition hover:border-[color:var(--color-border)] hover:bg-[color:var(--color-surface)]"
                    >
                      <div className="line-clamp-2 text-sm font-medium text-[color:var(--color-text)]">
                        {v.title}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                        {v.channel_title} · {formatDuration(v.duration_sec)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
