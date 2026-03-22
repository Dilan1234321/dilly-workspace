"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppProfileHeader } from "@/components/career-center";
import { DeltaView } from "@/components/ready-check/DeltaView";
import { DimensionCard } from "@/components/ready-check/DimensionCard";
import { RoadmapSection } from "@/components/ready-check/RoadmapSection";
import { TimelineNote } from "@/components/ready-check/TimelineNote";
import { VerdictHeader } from "@/components/ready-check/VerdictHeader";
import { VerdictSummaryCard } from "@/components/ready-check/VerdictSummaryCard";
import { API_BASE, AUTH_TOKEN_KEY, getCareerCenterReturnPath } from "@/lib/dillyUtils";
import type { ReadyCheck, ReadyCheckAction } from "@/types/dilly";

function actionDestination(check: ReadyCheck, action: ReadyCheckAction): string {
  switch (action.action_type) {
    case "open_bullet_practice":
      return "/?tab=voice&prompt=bullet_practice";
    case "open_certifications":
      return "/certifications";
    case "open_voice":
      return `/?tab=voice&prompt=${encodeURIComponent(action.action_payload?.prompt || "Help me improve this gap")}`;
    case "open_ats":
      return "/ats/overview";
    case "open_interview_prep":
      return "/?tab=resources";
    default:
      return "/?tab=voice";
  }
}

export default function ReadyCheckDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const token = useMemo(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null),
    []
  );
  const [check, setCheck] = useState<ReadyCheck | null>(null);
  const [previous, setPrevious] = useState<ReadyCheck | null>(null);

  useEffect(() => {
    if (!token || !params.id) return;
    fetch(`${API_BASE}/ready-check/${params.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((row) => setCheck((row as ReadyCheck) || null))
      .catch(() => setCheck(null));
  }, [params.id, token]);

  useEffect(() => {
    const prevId = search.get("follow_up");
    if (!token || !prevId) return;
    fetch(`${API_BASE}/ready-check/${encodeURIComponent(prevId)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((row) => setPrevious((row as ReadyCheck) || null))
      .catch(() => setPrevious(null));
  }, [search, token]);

  const markActionDone = async (action: ReadyCheckAction) => {
    if (!token || !check) return;
    await fetch(`${API_BASE}/ready-check/${check.id}/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ completed: true }),
    });
    setCheck((prev) =>
      prev
        ? {
            ...prev,
            actions: prev.actions.map((a) =>
              a.id === action.id ? { ...a, completed: true, completed_at: new Date().toISOString() } : a
            ),
          }
        : prev
    );
    router.push(actionDestination(check, action));
  };

  if (!check) {
    return (
      <div className="min-h-screen px-4 py-8" style={{ background: "var(--bg)", color: "var(--t3)" }}>
        Loading verdict...
      </div>
    );
  }

  return (
    <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="w-full max-w-[390px] mx-auto pb-36">
        <div className="px-4">
          <AppProfileHeader back={getCareerCenterReturnPath()} />
        </div>
        <VerdictHeader check={check} />
        <VerdictSummaryCard summary={check.summary} />
        <DimensionCard
          name="Smart"
          userScore={check.user_scores.smart}
          barScore={check.company_bars.smart_min}
          gap={check.dimension_gaps.smart}
          narrative={check.dimension_narratives.smart}
        />
        <DimensionCard
          name="Grit"
          userScore={check.user_scores.grit}
          barScore={check.company_bars.grit_min}
          gap={check.dimension_gaps.grit}
          narrative={check.dimension_narratives.grit}
        />
        <DimensionCard
          name="Build"
          userScore={check.user_scores.build}
          barScore={check.company_bars.build_min}
          gap={check.dimension_gaps.build}
          narrative={check.dimension_narratives.build}
        />
        {previous ? <DeltaView thenCheck={previous} nowCheck={check} /> : null}
        {check.verdict !== "ready" ? (
          <RoadmapSection actions={check.actions || []} onRunAction={markActionDone} />
        ) : null}
        {check.timeline_weeks != null && check.timeline_note ? <TimelineNote note={check.timeline_note} /> : null}
        <div className="px-4 mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push(`/ready-check/new?company=${encodeURIComponent(check.company)}`)}
            className="rounded-[12px] py-2.5 text-[12px] font-semibold"
            style={{ background: "var(--blue)", color: "#fff" }}
          >
            Check again after updating resume
          </button>
          <button
            type="button"
            onClick={() => router.push(`/voice?context=ready_check&id=${encodeURIComponent(check.id)}`)}
            className="rounded-[12px] py-2.5 text-[12px] font-semibold border"
            style={{ borderColor: "var(--bbdr)", color: "var(--t2)" }}
          >
            Ask Dilly about this
          </button>
        </div>
      </main>
    </div>
  );
}

