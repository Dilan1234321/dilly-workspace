import Link from "next/link";

/**
 * Three hand-picked starting points. Deliberately NOT a tile grid — this is
 * "the editor's choice" frame, a magazine's front page, not a chooser.
 * Each card routes to an existing industry page so the underlying curation
 * keeps working automatically.
 */
const PATHS: {
  slug: string;
  eyebrow: string;
  title: string;
  subtitle: string;
}[] = [
  {
    slug: "software-engineer",
    eyebrow: "For engineers",
    title: "Ship 10× more with AI as your pair.",
    subtitle:
      "System design, code-review judgment, and the craft of owning production — the things Copilot can't do for you.",
  },
  {
    slug: "marketer",
    eyebrow: "For marketers",
    title: "Strategy is the job. Execution is a commodity.",
    subtitle:
      "Positioning, narrative, and the taste to direct AI creative. The discipline of being the person who decides what's interesting.",
  },
  {
    slug: "student",
    eyebrow: "For students",
    title: "Stack the skills AI can't automate away.",
    subtitle:
      "School prepares you for the last era. Learn what your courses don't — prompting as a thinking tool, data literacy, and building real projects.",
  },
];

export function EditorialPaths() {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {PATHS.map((p) => (
        <li key={p.slug}>
          <Link
            href={`/industry/${p.slug}`}
            className="card group block h-full p-6 transition hover:-translate-y-0.5 sm:p-7"
          >
            <div className="eyebrow">{p.eyebrow}</div>
            <h3 className="editorial mt-3 text-[1.35rem] leading-tight tracking-tight sm:text-2xl">
              {p.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-muted)]">
              {p.subtitle}
            </p>
            <div className="mt-6 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-accent)] transition group-hover:gap-2">
              Read the path
              <span aria-hidden>→</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
