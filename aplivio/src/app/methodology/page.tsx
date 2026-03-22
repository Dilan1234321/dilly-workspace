import Link from "next/link";

export default function MethodologyPage() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-[var(--muted)]">
      <Link href="/" className="text-[var(--accent)] underline">
        ← Home
      </Link>
      <h1 className="text-2xl font-semibold text-[var(--text)]">How estimates work</h1>
      <p>
        <strong className="text-[var(--text)]">Percentages are not predictions.</strong> The app builds a{" "}
        <strong className="text-[var(--text)]">strength index (0–100)</strong> from your inputs, compares it to a{" "}
        <strong className="text-[var(--text)]">difficulty index</strong> for each school (using published admit rate and
        typical SAT/GPA mids), then applies a smooth curve so outputs stay in a plausible band. The goal is directional:
        “higher vs lower” relative to the demo data—not what any admission office computes.
      </p>
      <p>
        <strong className="text-[var(--text)]">Inputs that move the needle:</strong>
      </p>
      <ul className="list-inside list-disc space-y-1 pl-1">
        <li>
          <strong className="text-[var(--text)]">Unweighted GPA</strong> and optional <strong>weighted GPA</strong>{" "}
          (blended so we don’t double-count).
        </li>
        <li>
          <strong className="text-[var(--text)]">SAT or ACT</strong> (concorded to an SAT-scale band) or a test-optional
          placeholder when empty.
        </li>
        <li>
          <strong className="text-[var(--text)]">AP selections + “other advanced” count</strong> for rigor (capped).
        </li>
        <li>
          Extra <strong className="text-[var(--text)]">STEM AP alignment</strong> when your intended major looks STEM.
        </li>
        <li>
          <strong className="text-[var(--text)]">Activity / work / honors text</strong>: length plus simple impact
          keywords (leadership, awards, scope)—not an essay review.
        </li>
        <li>
          <strong className="text-[var(--text)]">Extracurricular depth slider</strong> as a fallback when text is thin.
        </li>
      </ul>
      <p>
        School rows in <code className="rounded bg-[var(--surface2)] px-1">src/data/colleges.json</code> are illustrative.
        Production systems should use licensed or official sources (IPEDS, CDS), versioned snapshots, and documented
        uncertainty (ranges, not fake precision).
      </p>
      <p>
        <strong className="text-[var(--text)]">Tiers:</strong> reach / match / safety are heuristic buckets from the
        estimated rate and selectivity—not categories from any college.
      </p>
    </div>
  );
}
