"use client";

export function MemoryNarrativeBlock({
  narrative,
  updatedLabel,
  count,
}: {
  narrative: string | null;
  updatedLabel: string;
  count: number;
}) {
  return (
    <section className="px-5 pt-6 pb-2">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--t3)" }}
      >
        Your career story
      </p>
      <p className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>
        (as Dilly sees it)
      </p>
      <p
        className="mt-3 text-[14px] leading-[1.75]"
        style={{ color: "var(--t1)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        {narrative?.trim() || "Start talking with Dilly and your career story will appear here."}
      </p>
      <p className="text-[11px] mt-2" style={{ color: "var(--t3)" }}>
        Updated {updatedLabel} · {count} {count === 1 ? "thing" : "things"} Dilly knows about you
      </p>
    </section>
  );
}

