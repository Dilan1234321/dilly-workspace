import { CohortGrid } from "@/components/cohort-grid";
import { IndustryPicker } from "@/components/industry-picker";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";

export const metadata = {
  title: "Browse — Skill Lab",
  description: "Every field and role in Skill Lab.",
};

export default async function BrowsePage() {
  const lang = await getLang();
  return (
    <div className="container-app pb-20 pt-12 sm:pt-16">
      <div className="max-w-3xl">
        <div className="eyebrow">Browse</div>
        <h1 className="editorial mt-3 text-4xl leading-[1.05] tracking-tight sm:text-5xl">
          Everything, in one place.
        </h1>
        <p className="mt-3 text-[color:var(--color-muted)] sm:text-lg">
          Pick a role or a field. Both land you in a curated library.
        </p>
      </div>

      <section className="mt-14">
        <div className="eyebrow">By role</div>
        <h2 className="editorial mt-2 text-2xl tracking-tight sm:text-3xl">I work in…</h2>
        <div className="mt-6">
          <IndustryPicker />
        </div>
      </section>

      <div className="rule" />

      <section>
        <div className="eyebrow">By field</div>
        <h2 className="editorial mt-2 text-2xl tracking-tight sm:text-3xl">
          {t(lang, "home.cohorts.heading")}
        </h2>
        <div className="mt-6">
          <CohortGrid lang={lang} />
        </div>
      </section>
    </div>
  );
}
