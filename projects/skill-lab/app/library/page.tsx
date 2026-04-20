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
      <div className="space-y-6 pt-4">
        <header>
          <h1 className="text-3xl font-semibold">{t(lang, "library.title")}</h1>
          <p className="mt-2 text-[color:var(--color-muted)]">
            {t(lang, "library.blurb_unauthed")}
          </p>
        </header>
        <AccountNudge
          headline={t(lang, "library.nudge.headline")}
          body={t(lang, "library.nudge.body")}
          ctaLabel={t(lang, "nudge.cta")}
          nextPath="/library"
        />
        <div className="text-sm text-[color:var(--color-muted)]">
          {t(lang, "library.already")}{" "}
          <Link href="/sign-in?next=/library" className="underline hover:text-white">
            {t(lang, "nav.sign_in")}
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
        <h1 className="text-3xl font-semibold">{t(lang, "library.title")}</h1>
        <p className="mt-2 text-[color:var(--color-muted)]">
          {saved.length === 0
            ? t(lang, "library.blurb_authed_empty")
            : t(lang, "library.blurb_authed_count", { count: saved.length })}
        </p>
      </header>

      {saved.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {saved.map((v) => (
            <VideoCard key={v.id} video={v} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}
