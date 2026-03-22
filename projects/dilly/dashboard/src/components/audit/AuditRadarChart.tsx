"use client";

import { useId } from "react";

const CX = 140;
const CY = 105;
const R = 72;

/** Top, bottom-right, bottom-left — Smart, Grit, Build */
const ANGLES = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];

function vertex(scale: number, i: number): { x: number; y: number } {
  const a = ANGLES[i];
  return { x: CX + R * scale * Math.cos(a), y: CY + R * scale * Math.sin(a) };
}

function pointsForScores(smart: number, grit: number, build: number): string {
  const s = [smart, grit, build].map((v) => Math.min(100, Math.max(0, v)) / 100);
  return s.map((sc, i) => {
    const p = vertex(sc, i);
    return `${p.x},${p.y}`;
  }).join(" ");
}

function ringPolygon(scale: number): string {
  return [0, 1, 2].map((i) => {
    const p = vertex(scale, i);
    return `${p.x},${p.y}`;
  }).join(" ");
}

export function AuditRadarChart({ smart, grit, build }: { smart: number; grit: number; build: number }) {
  const gid = useId().replace(/:/g, "");
  const poly = pointsForScores(smart, grit, build);
  const v0 = vertex(1, 0);
  const v1 = vertex(1, 1);
  const v2 = vertex(1, 2);

  const pts = [
    { label: `Smart ${smart}`, x: v0.x, y: v0.y - 14, color: "rgba(244,244,250,0.55)", anchor: "middle" as const },
    { label: `Grit ${grit}`, x: v1.x + 12, y: v1.y, color: "rgba(52,199,89,0.9)", anchor: "start" as const },
    { label: `Build ${build}`, x: v2.x - 12, y: v2.y + 6, color: "rgba(10,132,255,0.9)", anchor: "end" as const },
  ];

  return (
    <div style={{ background: "var(--s2)", borderRadius: 16, padding: 14 }}>
      <div className="flex items-center justify-between mb-3.5">
        <span
          className="uppercase"
          style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--t3)" }}
        >
          Score breakdown
        </span>
        <div className="flex flex-wrap gap-1 justify-end">
          <span
            className="inline-flex items-center"
            style={{
              background: "var(--s3)",
              border: "1px solid var(--b2)",
              borderRadius: 999,
              padding: "3px 9px",
              fontSize: 9,
              fontWeight: 600,
              color: "var(--amber)",
            }}
          >
            Smart {smart}
          </span>
          <span
            className="inline-flex items-center"
            style={{
              background: "var(--s3)",
              border: "1px solid var(--b2)",
              borderRadius: 999,
              padding: "3px 9px",
              fontSize: 9,
              fontWeight: 600,
              color: "var(--green)",
            }}
          >
            Grit {grit}
          </span>
          <span
            className="inline-flex items-center"
            style={{
              background: "var(--s3)",
              border: "1px solid var(--b2)",
              borderRadius: 999,
              padding: "3px 9px",
              fontSize: 9,
              fontWeight: 600,
              color: "var(--blue)",
            }}
          >
            Build {build}
          </span>
        </div>
      </div>
      <svg width="100%" height={200} viewBox="0 0 280 200" className="block mx-auto">
        <defs>
          <linearGradient id={`audit-radar-grad-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,159,10,0.15)" />
            <stop offset="100%" stopColor="rgba(52,199,89,0.08)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <polygon
            key={t}
            points={ringPolygon(t)}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        ))}
        {[0, 1, 2].map((i) => {
          const p = vertex(1, i);
          return (
            <line
              key={i}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={0.5}
            />
          );
        })}
        <polygon points={poly} fill={`url(#audit-radar-grad-${gid})`} stroke="var(--amber)" strokeWidth={1.5} />
        {[smart, grit, build].map((_, i) => {
          const sc = Math.min(100, Math.max(0, [smart, grit, build][i])) / 100;
          const p = vertex(sc, i);
          const fill = i === 0 ? "var(--amber)" : i === 1 ? "var(--green)" : "var(--blue)";
          return <circle key={i} cx={p.x} cy={p.y} r={4} fill={fill} />;
        })}
        {[0.25, 0.5, 0.75].map((t, i) => {
          const p = vertex(t, 0);
          return (
            <text
              key={i}
              x={p.x + 4}
              y={p.y - 4}
              fill="rgba(244,244,250,0.2)"
              fontSize={8}
              fontFamily="var(--font-inter), system-ui, sans-serif"
            >
              {Math.round(t * 100)}
            </text>
          );
        })}
        {pts.map((p) => (
          <text
            key={p.label}
            x={p.x}
            y={p.y}
            textAnchor={p.anchor}
            fill={p.color}
            fontSize={10}
            fontWeight={600}
            fontFamily="var(--font-inter), system-ui, sans-serif"
          >
            {p.label}
          </text>
        ))}
      </svg>
      <div style={{ borderTop: "1px solid var(--b1)", paddingTop: 10, paddingBottom: 4 }}>
        <div className="flex justify-between gap-2 text-center" style={{ fontSize: 10, color: "var(--t2)" }}>
          <span className="flex-1">
            <span style={{ color: "var(--t1)", fontWeight: 600 }}>Smart</span> = academic rigor
          </span>
          <span className="flex-1">
            <span style={{ color: "var(--t1)", fontWeight: 600 }}>Grit</span> = leadership
          </span>
        </div>
        <p className="text-center mt-1" style={{ fontSize: 10, color: "var(--t2)" }}>
          <span style={{ color: "var(--t1)", fontWeight: 600 }}>Build</span> = track readiness
        </p>
        <p className="text-center mt-1" style={{ fontSize: 9, color: "var(--t3)" }}>
          Scores from your resume only · Dilly Truth Standard
        </p>
      </div>
    </div>
  );
}
