"use client";

function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
    </svg>
  );
}

export function ImpactSummaryBar({ maxPts }: { maxPts: number }) {
  return (
    <div
      style={{
        background: "var(--s2)",
        borderRadius: 14,
        padding: "11px 13px",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        borderLeft: "2px solid var(--green)",
        marginBottom: 10,
      }}
    >
      <div
        className="shrink-0 flex items-center justify-center rounded-full"
        style={{
          width: 30,
          height: 30,
          background: "var(--gdim)",
          border: "1px solid var(--gbdr)",
        }}
      >
        <StarIcon size={15} color="var(--green)" />
      </div>
      <div className="min-w-0 flex-1">
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", margin: 0 }}>
          Complete any one cert → up to +{maxPts} Build pts
        </p>
        <p style={{ fontSize: 10, fontWeight: 400, color: "var(--t2)", margin: "2px 0 0" }}>Estimated · verified against your current audit</p>
      </div>
    </div>
  );
}
