"use client";

export function DimensionCard({
  name,
  userScore,
  barScore,
  gap,
  narrative,
}: {
  name: "Smart" | "Grit" | "Build";
  userScore: number;
  barScore: number;
  gap: number;
  narrative?: string;
}) {
  const color = gap > 0 ? "var(--green)" : gap >= -5 ? "var(--amber)" : "var(--coral)";
  const width = Math.min(100, (userScore / (barScore + 10)) * 100);
  return (
    <section className="mx-4 mt-2.5 rounded-[16px] p-[14px]" style={{ background: "var(--s2)" }}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold" style={{ color: "var(--t1)" }}>
          {name}
        </p>
        <p className="text-[12px] font-semibold" style={{ color: "var(--t2)" }}>
          {userScore} / {barScore}
        </p>
      </div>
      <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "var(--b1)" }}>
        <div className="h-1 rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
      <p className="mt-1 text-[11px] font-semibold" style={{ color }}>
        {gap >= 0 ? `+${gap} above bar` : `${gap} below bar`}
      </p>
      {gap < 0 && narrative ? (
        <p className="text-[11px] leading-5 mt-1" style={{ color: "var(--t3)" }}>
          {narrative}
        </p>
      ) : null}
    </section>
  );
}

