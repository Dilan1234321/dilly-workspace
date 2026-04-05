"use client";

import React from "react";

import { useAppContext } from "@/context/AppContext";

export interface DeadlineCardsProps {
  theme: { primary: string; secondary: string; backgroundTint?: string; primaryContrast?: string };
}

export function DeadlineCards(props: DeadlineCardsProps) {
  const { theme } = props;
  const { appProfile } = useAppContext();

  const dls = (appProfile?.deadlines || []).filter((d) => d.date && d.label && !d.completedAt);
  const now = Date.now();
  const soonest = dls
    .filter((d) => new Date(d.date).getTime() > now)
    .map((d) => ({ ...d, daysLeft: Math.ceil((new Date(d.date).getTime() - now) / 86400000) }))
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];

  if (!soonest) return null;

  const isSprint = soonest.daysLeft <= 14;

  return (
    <div className="mb-4 m-rounded-card p-4 border overflow-hidden" style={{ backgroundColor: isSprint ? "rgba(234,179,8,0.08)" : "var(--ut-surface-raised)", borderColor: isSprint ? "rgba(234,179,8,0.4)" : "var(--ut-border)", borderLeftWidth: "4px", borderLeftColor: isSprint ? "#eab308" : theme.primary }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">Deadline reminder</span>
        <span className="text-sm font-bold tabular-nums text-slate-100">{soonest.daysLeft} day{soonest.daysLeft !== 1 ? "s" : ""} left</span>
      </div>
      <p className="text-slate-200 font-medium text-sm mb-2">&quot;{soonest.label}&quot;</p>
      <div className="h-2 rounded-full overflow-hidden bg-slate-700/50">
        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, 100 - (soonest.daysLeft / 14) * 100))}%` }} />
      </div>
      <p className="text-slate-500 text-[10px] mt-1.5">Due {new Date(soonest.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
    </div>
  );
}
