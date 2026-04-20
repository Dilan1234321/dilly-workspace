import Link from "next/link";
import { INDUSTRIES } from "@/lib/industries";

/**
 * Industry picker — Skill Lab's primary "start here" choice for working adults.
 * Pitch: pick what you do, we'll show you what to learn so AI doesn't take it.
 */
export function IndustryPicker() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {INDUSTRIES.map((i) => (
        <Link
          key={i.slug}
          href={`/industry/${i.slug}`}
          className="card group flex min-h-[130px] flex-col justify-between gap-3 p-4 transition hover:-translate-y-0.5 sm:p-5"
        >
          <div className="flex items-start justify-between gap-2">
            <span aria-hidden className="text-2xl sm:text-3xl">{i.emoji}</span>
            <span className="text-[color:var(--color-dim)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--color-accent-soft)]">
              →
            </span>
          </div>
          <div>
            <div className="text-[0.95rem] font-semibold leading-snug text-[color:var(--color-text)]">
              {i.name}
            </div>
            <div className="editorial mt-1 text-xs italic leading-snug text-[color:var(--color-muted)]">
              {i.tagline}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
