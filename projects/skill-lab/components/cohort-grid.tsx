import Link from "next/link";
import { COHORTS } from "@/lib/cohorts";
import type { LangCode } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function CohortGrid({ lang }: { lang: LangCode }) {
  const hint = t(lang, "home.cohorts.browse_hint");
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {COHORTS.map((c) => (
        <Link
          key={c.slug}
          href={`/cohort/${c.slug}`}
          className="card group p-4 transition"
        >
          <div className="text-sm font-semibold">{c.name}</div>
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">
            {c.tagline}
          </div>
          <div className="mt-3 text-xs text-[color:var(--color-muted)] opacity-0 transition group-hover:opacity-100">
            {hint}
          </div>
        </Link>
      ))}
    </div>
  );
}
