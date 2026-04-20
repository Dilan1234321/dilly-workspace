import Link from "next/link";
import { CohortGrid } from "@/components/cohort-grid";
import { VideoCard } from "@/components/video-card";
import { listTrending } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";

export default async function HomePage() {
  const lang = await getLang();
  const trending = await listTrending(8, lang).catch(() => []);

  return (
    <div className="space-y-16">
      <section className="pt-10">
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          {t(lang, "home.hero.title_a")}{" "}
          <span className="text-[color:var(--color-accent)]">{t(lang, "home.hero.title_b")}</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[color:var(--color-muted)]">
          {t(lang, "home.hero.subtitle")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#cohorts" className="btn btn-primary">{t(lang, "home.cta.browse")}</a>
          <Link href="/library" className="btn btn-ghost">{t(lang, "home.cta.library")}</Link>
        </div>
      </section>

      {trending.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl font-semibold">{t(lang, "home.trending.heading")}</h2>
            <span className="text-xs text-[color:var(--color-muted)]">
              {t(lang, "home.trending.subheading")}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trending.map((v) => (
              <VideoCard key={v.id} video={v} lang={lang} />
            ))}
          </div>
        </section>
      )}

      <section id="cohorts">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-semibold">{t(lang, "home.cohorts.heading")}</h2>
          <span className="text-xs text-[color:var(--color-muted)]">{t(lang, "home.cohorts.count")}</span>
        </div>
        <CohortGrid lang={lang} />
      </section>
    </div>
  );
}
