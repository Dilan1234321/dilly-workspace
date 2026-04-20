import Link from "next/link";
import { VideoCard } from "@/components/video-card";
import { AccountNudge } from "@/components/account-nudge";
import { getSession, listSavedVideos } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";

export default async function LibraryPage() {
  const lang = await getLang();
  const session = await getSession().catch(() => null);

  if (!session) {
    return (
      <div className="container-app pb-16 pt-14 sm:pt-20">
        <div className="max-w-2xl">
          <div className="eyebrow">Your library</div>
          <h1 className="editorial mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t(lang, "library.title")}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-[color:var(--color-muted)]">
            {t(lang, "library.blurb_unauthed")}
          </p>
        </div>
        <div className="mt-8">
          <AccountNudge
            headline={t(lang, "library.nudge.headline")}
            body={t(lang, "library.nudge.body")}
            ctaLabel={t(lang, "nudge.cta")}
            nextPath="/library"
          />
        </div>
        <div className="mt-6 text-sm text-[color:var(--color-muted)]">
          {t(lang, "library.already")}{" "}
          <Link href="/sign-in?next=/library" className="underline decoration-[color:var(--color-accent)]/40 underline-offset-4 hover:text-[color:var(--color-accent)]">
            {t(lang, "nav.sign_in")}
          </Link>
          .
        </div>
      </div>
    );
  }

  const saved = await listSavedVideos().catch(() => []);

  return (
    <div className="container-app pb-16 pt-14 sm:pt-20">
      <div className="max-w-2xl">
        <div className="eyebrow">Your library</div>
        <h1 className="editorial mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {t(lang, "library.title")}
        </h1>
        <p className="mt-4 text-lg text-[color:var(--color-muted)]">
          {saved.length === 0
            ? t(lang, "library.blurb_authed_empty")
            : t(lang, "library.blurb_authed_count", { count: saved.length })}
        </p>
      </div>

      {saved.length > 0 && (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {saved.map((v) => (
            <VideoCard key={v.id} video={v} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}
