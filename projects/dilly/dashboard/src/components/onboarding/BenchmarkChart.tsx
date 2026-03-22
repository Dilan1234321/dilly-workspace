"use client";

/** Static bell-ish distribution for UTampa peer benchmark */
const BAR_HEIGHTS = [18, 30, 50, 72, 100, 85, 60, 38, 20, 10];

export function BenchmarkChart({ trackLabel }: { trackLabel: string }) {
  return (
    <div
      className="mb-[18px] rounded-[14px] border p-3"
      style={{
        background: "var(--s2)",
        borderColor: "var(--b1)",
      }}
    >
      <p
        className="mb-3 text-[8px] font-bold uppercase tracking-wide"
        style={{ color: "var(--t3)" }}
      >
        Dilly score distribution · UTampa {trackLabel} peers
      </p>
      <div className="mb-2 flex h-10 items-end gap-1">
        {BAR_HEIGHTS.map((h, i) => {
          const peak = i === 4;
          const near = i === 3 || i === 5;
          const bg = peak
            ? "var(--gold)"
            : near
              ? i === 3
                ? "rgba(201,168,76,0.35)"
                : "rgba(201,168,76,0.25)"
              : "var(--s3)";
          return (
            <div key={i} className="flex-1 rounded-t-[2px]" style={{ height: `${h}%`, background: bg }} />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px]">
        <span style={{ color: "var(--t3)" }}>0</span>
        <span className="font-bold" style={{ color: "var(--gold)" }}>
          Top 25% ←
        </span>
        <span style={{ color: "var(--t3)" }}>100</span>
      </div>
    </div>
  );
}
