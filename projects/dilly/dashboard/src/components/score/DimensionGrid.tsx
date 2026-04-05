"use client";

import { useEffect, useState } from "react";
import type { ScorePageData } from "@/types/scorePage";

const DIM: { key: "smart" | "grit" | "build"; label: string; color: string }[] = [
  { key: "smart", label: "Smart", color: "var(--blue)" },
  { key: "grit", label: "Grit", color: "var(--amber)" },
  { key: "build", label: "Build", color: "var(--green)" },
];

function useStaggerCount(target: number, delayMs: number, durationMs: number): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional
    setV(0);
    const start = performance.now() + delayMs;
    let frame: number;
    const tick = (now: number) => {
      if (now < start) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - start) / durationMs);
      const e = 1 - (1 - t) ** 3;
      setV(Math.round(target * e));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delayMs, durationMs]);
  return v;
}

function DimensionTile({
  label,
  color,
  target,
  delayMs,
  isWeak,
}: {
  label: string;
  color: string;
  target: number;
  delayMs: number;
  isWeak: boolean;
}) {
  const val = useStaggerCount(target, delayMs, 700);
  return (
    <div
      className="text-center rounded-[13px]"
      style={{
        background: "var(--s2)",
        padding: "11px 10px",
        border: isWeak ? "1px solid var(--abdr)" : "none",
      }}
    >
      <p
        className="tabular-nums mb-1"
        style={{
          fontSize: 22,
          fontWeight: 300,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginBottom: 4,
          color,
        }}
      >
        {val}
      </p>
      <p
        className="uppercase font-bold"
        style={{
          fontSize: 8,
          letterSpacing: "0.08em",
          color: isWeak ? "var(--amber)" : "var(--t3)",
          margin: "4px 0 5px",
        }}
      >
        {isWeak ? `${label} ← gap` : label}
      </p>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 2, background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, val)}%`,
            background: color,
            transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </div>
    </div>
  );
}

type Props = { data: ScorePageData };

export function DimensionGrid({ data }: Props) {
  const wk = data.weakest_dimension;
  return (
    <div className="grid mx-5 mb-3.5" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8, margin: "16px 20px 14px" }}>
      {DIM.map((d, i) => (
        <DimensionTile
          key={d.key}
          label={d.label}
          color={d.color}
          target={data[d.key]}
          delayMs={i * 200}
          isWeak={d.key === wk}
        />
      ))}
    </div>
  );
}
