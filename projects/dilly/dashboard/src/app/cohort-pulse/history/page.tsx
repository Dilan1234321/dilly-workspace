"use client";

import { useEffect, useMemo, useState } from "react";
import { AppProfileHeader } from "@/components/career-center";
import { PulseHistoryList } from "@/components/cohort-pulse/PulseHistoryList";
import { PulseTrendChart } from "@/components/cohort-pulse/PulseTrendChart";
import { API_BASE, AUTH_TOKEN_KEY, getCareerCenterReturnPath } from "@/lib/dillyUtils";
import type { CohortPulse, UserCohortPulse } from "@/types/dilly";

type PulseWithCohort = UserCohortPulse & { cohort: CohortPulse };
type ScorePoint = { week_start: string; user_score: number; cohort_avg_score: number };

export default function CohortPulseHistoryPage() {
  const token = useMemo(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null),
    []
  );
  const [items, setItems] = useState<PulseWithCohort[]>([]);
  const [scoreHistory, setScoreHistory] = useState<ScorePoint[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/cohort-pulse/history?limit=8`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const rows = Array.isArray(data?.items) ? (data.items as PulseWithCohort[]) : [];
        const history = Array.isArray(data?.score_history) ? (data.score_history as ScorePoint[]) : [];
        setItems(rows);
        setScoreHistory(history);
      })
      .catch(() => {
        setItems([]);
        setScoreHistory([]);
      });
  }, [token]);

  const first = items[0];
  const subtitle = first ? `${(first.cohort.track || "Track").toUpperCase()} · ${(first.cohort.school_id || "School").toUpperCase()}` : "Your cohort trend";
  const accent =
    first?.cohort.top_improvement_dimension === "grit"
      ? "var(--amber)"
      : first?.cohort.top_improvement_dimension === "build"
      ? "var(--indigo)"
      : "var(--blue)";

  return (
    <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto w-full max-w-[390px] pb-32">
        <div className="px-4">
          <AppProfileHeader back={getCareerCenterReturnPath()} />
        </div>
        <header className="px-4 pb-3 pt-2">
          <h1 className="text-[18px] font-semibold" style={{ color: "var(--t1)" }}>Cohort history</h1>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--t3)" }}>{subtitle}</p>
        </header>
        <div className="px-4 pb-3">
          <PulseTrendChart points={scoreHistory} accent={accent} />
        </div>
        <div className="px-4">
          <PulseHistoryList items={items} />
        </div>
      </main>
    </div>
  );
}

