import Link from "next/link";
import type { Video } from "@/lib/types";
import type { StreakState, LastWatched } from "@/lib/session-state";
import type { SessionUser } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

/**
 * "Today" panel — the new homepage hero. Replaces marketing copy with an
 * actual, ready-to-play pick + the viewer's live state. This is what
 * changes the feel from "website" to "workspace".
 */
export function TodayPanel({
  video,
  streak,
  lastWatched,
  fresh,
  session,
}: {
  video: Video | null;
  streak: StreakState;
  lastWatched: LastWatched | null;
  fresh: number;          // count of videos added in last 72h
  session: SessionUser | null;
}) {
  if (!video) return null;

  const thumb =
    video.thumbnail_url || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  const returning = streak.streak > 0;

  return (
    <section className="container-app pt-8 sm:pt-10 lg:pt-12">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
        {/* ═══ Left: the pick, playable in one click ═══ */}
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center opacity-90 transition group-hover:opacity-100">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--color-accent)] shadow-[0_20px_60px_rgba(123,159,255,0.4)] transition group-hover:scale-110">
                <PlayIcon />
              </span>
            </div>
            <div className="absolute left-4 top-4 flex gap-2">
              <span className="chip chip-accent backdrop-blur">Today&apos;s pick</span>
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

        {/* ═══ Right: your state + context ═══ */}
        <div className="flex flex-col justify-between gap-6">
          <div>
            <div className="eyebrow">
              {returning ? "Welcome back" : "Welcome"}
            </div>
            <h1 className="editorial mt-3 text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl lg:text-[2.6rem]">
              {returning ? (
                <>
                  Day <span className="text-[color:var(--color-accent-soft)]">{streak.streak}</span>.{" "}
                  <span className="italic">Keep it going.</span>
                </>
              ) : (
                <>
                  Fifteen minutes.{" "}
                  <span className="italic text-[color:var(--color-accent-soft)]">
                    One real skill.
                  </span>
                </>
              )}
            </h1>
            <p className="mt-4 text-base text-[color:var(--color-muted)] sm:text-lg">
              {returning
                ? "Your next video is queued. Press Space or click play to start."
                : "Hit play. That's the whole pitch. No signup, no paywall, no scrolling — just the best video we'd hand a real student right now."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Streak" value={streak.streak ? `${streak.streak}d` : "—"} hot={streak.streak >= 3} />
            <Stat
              label="Fresh today"
              value={fresh > 0 ? `${fresh} new` : "—"}
              hot={fresh > 0}
            />
            <Stat label="Fields" value="22" />
          </div>

          {lastWatched && (
            <Link
              href={`/cohort/${lastWatched.cohort}`}
              className="block rounded-xl border border-[color:var(--color-border)] p-3.5 text-sm transition hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface)]"
            >
              <div className="eyebrow">Pick up where you left off</div>
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[color:var(--color-muted)]">
                <span className="truncate text-[color:var(--color-text)]">
                  {friendlyCohort(lastWatched.cohort)}
                </span>
                <span className="shrink-0">→</span>
              </div>
            </Link>
          )}

          {!session && streak.streak >= 2 && <ProgressLockNudge streak={streak.streak} />}
        </div>
      </div>
    </section>
  );
}

/**
 * Shown only to logged-out users who have enough of a streak or history that
 * losing it would genuinely sting. Non-coercive: a Link, not a modal; copy
 * centers on "save" not "sign up".
 */
function ProgressLockNudge({ streak }: { streak: number }) {
  return (
    <Link
      href="/sign-up?next=/&reason=progress"
      className="group block rounded-xl border border-[color:var(--color-accent)]/30 bg-[color:var(--color-lavender)] p-4 transition hover:border-[color:var(--color-accent)]"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xl" aria-hidden>
          🔒
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[color:var(--color-accent)]">
            Don&apos;t lose your {streak}-day streak
          </div>
          <div className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">
            Save progress to your free Dilly account — takes 20 seconds, keeps
            your streak on every device.
          </div>
        </div>
        <span className="shrink-0 text-[color:var(--color-accent)] transition group-hover:translate-x-0.5">
          →
        </span>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  hot,
}: {
  label: string;
  value: string;
  hot?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3.5 " +
        (hot
          ? "border-[rgba(123,159,255,0.3)] bg-[rgba(123,159,255,0.05)]"
          : "border-[color:var(--color-border)]")
      }
    >
      <div className="eyebrow">{label}</div>
      <div
        className={
          "editorial mt-1 text-2xl font-semibold leading-tight " +
          (hot ? "text-[color:var(--color-accent-soft)]" : "text-[color:var(--color-text)]")
        }
      >
        {value}
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

function friendlyCohort(slug: string): string {
  return slug
    .split("-")
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join(" ");
}
