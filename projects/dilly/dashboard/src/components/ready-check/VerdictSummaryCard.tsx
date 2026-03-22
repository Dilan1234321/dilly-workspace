"use client";

export function VerdictSummaryCard({ summary }: { summary: string }) {
  return (
    <section
      className="mx-4 mt-3 rounded-[20px] p-[18px]"
      style={{ background: "var(--s2)" }}
    >
      <p className="text-[13px] leading-[1.7]" style={{ color: "var(--t2)" }}>
        {summary}
      </p>
    </section>
  );
}

