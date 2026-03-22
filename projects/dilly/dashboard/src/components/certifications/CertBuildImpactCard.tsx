"use client";

export function CertBuildImpactCard({
  currentBuild,
  after,
  deltaPts,
}: {
  currentBuild: number;
  after: number;
  deltaPts: number;
}) {
  return (
    <div style={{ background: "var(--s3)", borderRadius: 12, padding: "11px 13px", marginBottom: 13 }}>
      <p
        style={{
          fontSize: 8,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--t3)",
          marginBottom: 7,
        }}
      >
        Estimated Build impact
      </p>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="tabular-nums" style={{ fontSize: 32, fontWeight: 300, letterSpacing: "-0.04em", color: "var(--green)" }}>
          {after}
        </span>
        <span style={{ fontSize: 13, fontWeight: 300, color: "var(--t3)" }}>/100</span>
        <span style={{ fontSize: 13, color: "var(--t3)" }}>←</span>
        <span className="tabular-nums" style={{ fontSize: 16, fontWeight: 300, color: "var(--t2)", textDecoration: "line-through" }}>
          {currentBuild}
        </span>
        <span style={{ fontSize: 11, color: "var(--t3)" }}>current</span>
        <span
          style={{
            background: "var(--gdim)",
            border: "1px solid var(--gbdr)",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--green)",
          }}
        >
          +{deltaPts} pts
        </span>
      </div>
    </div>
  );
}
