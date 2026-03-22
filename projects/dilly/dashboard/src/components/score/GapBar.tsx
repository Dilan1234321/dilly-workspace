"use client";

import { useEffect, useState } from "react";

type Props = {
  score: number;
  scoreColor: string;
  companyBar: number;
  gapPts: number;
  companyShort: string;
};

export function GapBar({ score, scoreColor, companyBar, gapPts, companyShort }: Props) {
  const [fillW, setFillW] = useState(0);
  const [markerOn, setMarkerOn] = useState(false);

  useEffect(() => {
    setFillW(0);
    setMarkerOn(false);
    const t1 = window.setTimeout(() => setFillW(Math.min(100, Math.max(0, score))), 220);
    const t2 = window.setTimeout(() => setMarkerOn(true), 220);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [score]);

  const barPct = Math.min(100, Math.max(0, companyBar));

  return (
    <div className="w-full max-w-[230px] mx-auto mt-4">
      <div className="flex justify-between items-center mb-[5px]">
        <span className="text-[9px]" style={{ color: "var(--t3)" }}>
          You
        </span>
        <span className="text-[9px] font-bold" style={{ color: scoreColor }}>
          {gapPts} pts from {companyShort}&apos;s bar
        </span>
      </div>
      <div
        className="relative w-full rounded-full"
        style={{
          height: 5,
          background: "rgba(255,255,255,0.06)",
          overflow: "visible",
        }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            width: `${fillW}%`,
            background: scoreColor,
            transition: "width 800ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        <div
          className="absolute flex flex-col items-center pointer-events-none"
          style={{
            left: `${barPct}%`,
            top: -3,
            width: 0,
            transition: markerOn ? "opacity 200ms ease" : undefined,
            opacity: markerOn ? 1 : 0,
          }}
        >
          <span
            className="absolute whitespace-nowrap font-medium"
            style={{
              color: "var(--green)",
              fontSize: 8,
              bottom: 14,
              transform: "translateX(-50%)",
            }}
          >
            {companyShort}
          </span>
          <span
            className="absolute rounded-full"
            style={{
              width: 1.5,
              height: 11,
              background: "var(--green)",
              transform: "translateX(-50%)",
              top: 0,
            }}
          />
        </div>
      </div>
      <div className="flex justify-between items-center mt-[3px]">
        <span className="text-[9px] font-medium tabular-nums" style={{ color: scoreColor }}>
          {score}
        </span>
        <span className="text-[9px] font-bold" style={{ color: "var(--green)" }}>
          {companyBar} ← {companyShort}
        </span>
      </div>
    </div>
  );
}
