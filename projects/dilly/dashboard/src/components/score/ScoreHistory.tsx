"use client";

import { useEffect, useState } from "react";
import { heroScoreColor } from "./scoreTokens";
import type { ScorePageData } from "@/types/scorePage";

function normAuditId(s: string): string {
  return s.trim().toLowerCase().replace(/-/g, "");
}

type Props = {
  data: ScorePageData;
  /** Audit id that the hero + dimensions reflect (from payload `latest_audit_id`). */
  activeAuditId: string | null;
  onSelectAuditId: (auditId: string) => void;
  disabled?: boolean;
};

export function ScoreHistory({ data, activeAuditId, onSelectAuditId, disabled }: Props) {
  const hist = data.audit_history;
  const n = hist.length;
  const activeTrim = (activeAuditId || "").trim();

  if (n < 1) return null;

  if (n === 1) {
    return (
      <section className="rounded-[14px] px-3.5 py-3 mx-5" style={{ background: "var(--s2)", margin: "0 20px 14px" }}>
        <p className="text-[11px] leading-snug" style={{ color: "var(--t3)" }}>
          Run another audit to track your progress over time.
        </p>
      </section>
    );
  }

  const lastN = Math.min(n, 8);
  const slice = hist.slice(0, lastN).reverse();
  const firstScore = slice[0]?.score ?? 0;
  const lastScore = slice[slice.length - 1]?.score ?? 0;
  const delta = lastScore - firstScore;
  let trend: { text: string; color: string } = {
    text: "Keep auditing to track your progress.",
    color: "var(--t3)",
  };
  if (delta > 0) trend = { text: `+${delta} pts since first audit.`, color: "var(--green)" };
  else if (delta < 0)
    trend = { text: `You have dropped ${Math.abs(delta)} pts. Run a fresh audit.`, color: "var(--coral)" };

  return (
    <section
      className="rounded-[14px] px-3.5 py-3 mx-5 transition-opacity"
      style={{
        background: "var(--s2)",
        margin: "0 20px 14px",
        opacity: disabled ? 0.55 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
      aria-busy={disabled}
    >
      <p className="uppercase font-bold mb-1" style={{ fontSize: 9, color: "var(--t3)" }}>
        Your last {lastN} audits
      </p>
      <p className="text-[10px] mb-2.5 leading-snug" style={{ color: "var(--t3)" }}>
        Tap a bar to see your score as of that audit.
      </p>
      <div className="flex flex-row items-end gap-2" style={{ height: 44 }} role="group" aria-label="Audit history">
        {slice.map((a, i) => {
          const id = String(a.audit_id ?? "").trim();
          const canPick = Boolean(id);
          const isActive = activeTrim
            ? normAuditId(id) === normAuditId(activeTrim)
            : i === slice.length - 1;
          const col = isActive ? heroScoreColor(a.score) : "var(--s3)";
          const bar = (
            <HistoryBar
              score={a.score}
              delayMs={i * 80}
              fillColor={col}
              labelColor={isActive ? heroScoreColor(a.score) : "var(--t3)"}
              bold={isActive}
            />
          );
          const label = a.date ? `Audit ${a.date}, score ${a.score}` : `Audit score ${a.score}`;
          return canPick ? (
            <button
              key={`${id}-${i}`}
              type="button"
              onClick={() => onSelectAuditId(id)}
              className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 border-0 bg-transparent p-0 cursor-pointer touch-manipulation rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
              style={{ outlineColor: "var(--blue)" }}
              aria-label={label}
              aria-pressed={isActive}
            >
              {bar}
            </button>
          ) : (
            <div key={`${a.date}-${i}`} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" aria-label={label}>
              {bar}
            </div>
          );
        })}
      </div>
      <p className="mt-[7px] text-[10px] font-medium" style={{ color: trend.color }}>
        {trend.text}
      </p>
    </section>
  );
}

const BAR_MAX = 44;

function HistoryBar({
  score,
  delayMs,
  fillColor,
  labelColor,
  bold,
}: {
  score: number;
  delayMs: number;
  fillColor: string;
  labelColor: string;
  bold: boolean;
}) {
  const [hPx, setHPx] = useState(0);
  const targetPx = Math.max(3, (Math.min(100, score) / 100) * BAR_MAX);
  useEffect(() => {
    setHPx(0);
    const t = window.setTimeout(() => setHPx(targetPx), 30 + delayMs);
    return () => window.clearTimeout(t);
  }, [targetPx, delayMs]);

  return (
    <>
      <div className="w-full flex items-end justify-center" style={{ height: BAR_MAX }}>
        <div
          className="w-full max-w-[28px] rounded-t-sm"
          style={{
            height: hPx,
            background: fillColor,
            transition: "height 600ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </div>
      <span className="text-[8px] tabular-nums" style={{ color: labelColor, fontWeight: bold ? 700 : 400 }}>
        {score}
      </span>
    </>
  );
}
