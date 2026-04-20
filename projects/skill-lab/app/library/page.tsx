import Link from "next/link";
import { VideoCard } from "@/components/video-card";
import { AccountNudge } from "@/components/account-nudge";
import { getSession, listSavedVideos } from "@/lib/api";

export default async function LibraryPage() {
  const session = await getSession().catch(() => null);

  if (!session) {
    return (
      <div className="space-y-6 pt-4">
        <header>
          <h1 className="text-3xl font-semibold">Your library</h1>
          <p className="mt-2 text-[color:var(--color-muted)]">
            Save videos across any cohort and come back to them later. Your library is sorted by when you saved.
          </p>
        </header>
        <AccountNudge
          headline="Sign in to see your library"
          body="Create a free account, or sign in if you already have one. No pressure, takes 20 seconds."
          nextPath="/library"
        />
        <div className="text-sm text-[color:var(--color-muted)]">
          Already have an account?{" "}
          <Link href="/sign-in?next=/library" className="underline hover:text-white">
            Sign in
          </Link>
          .
        </div>
      </div>
    );
  }

  const saved = await listSavedVideos().catch(() => []);

  return (
    <div className="space-y-6 pt-4">
      <header>
        <h1 className="text-3xl font-semibold">Your library</h1>
        <p className="mt-2 text-[color:var(--color-muted)]">
          {saved.length === 0
            ? "Nothing saved yet. Hit Save on any video to add it here."
            : `${saved.length} saved video${saved.length === 1 ? "" : "s"}.`}
        </p>
      </header>

      {saved.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {saved.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
