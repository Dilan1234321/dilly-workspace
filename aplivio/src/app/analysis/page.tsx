"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMe } from "@/components/MeProvider";
import { TierBadge } from "@/components/TierBadge";
import { getCollegeById, getMatchResult } from "@/lib/match";
import { buildSchoolAnalysis, formatTierBadge } from "@/lib/schoolAnalysis";
import { cn } from "@/lib/cn";

export default function AnalysisPage() {
  const { profile, savedCollegeIds, ready } = useMe();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionPlan, setActionPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planSource, setPlanSource] = useState<"rules" | "ai" | null>(null);

  useEffect(() => {
    if (savedCollegeIds.length && selectedId == null) {
      setSelectedId(savedCollegeIds[0]);
    }
    if (selectedId && !savedCollegeIds.includes(selectedId)) {
      setSelectedId(savedCollegeIds[0] ?? null);
    }
  }, [savedCollegeIds, selectedId]);

  const college = useMemo(
    () => (selectedId ? getCollegeById(selectedId) : undefined),
    [selectedId],
  );

  const match = useMemo(
    () => (college ? getMatchResult(profile, college) : null),
    [profile, college],
  );

  const analysis = useMemo(() => {
    if (!college || !match) return null;
    return buildSchoolAnalysis(profile, college, match);
  }, [profile, college, match]);

  // Action-plan paragraph: server session + optional OpenAI. Debounced so typing on Profile doesn’t spam the API.
  useEffect(() => {
    if (!selectedId) return;

    const collegeIdRequested = selectedId;
    let cancelled = false;
    setPlanLoading(true);
    setActionPlan(null);

    const t = window.setTimeout(() => {
      (async () => {
        const c = getCollegeById(collegeIdRequested);
        if (!c) {
          if (!cancelled) setPlanLoading(false);
          return;
        }
        const m = getMatchResult(profile, c);
        const local = buildSchoolAnalysis(profile, c, m);

        try {
          const r = await fetch("/api/analysis/plan", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collegeId: collegeIdRequested }),
          });
          const data = (await r.json()) as {
            actionPlan?: string;
            source?: "rules" | "ai";
          };
          if (cancelled || collegeIdRequested !== selectedId) return;
          setActionPlan(data.actionPlan ?? local.actionPlanFallback);
          setPlanSource(data.source ?? "rules");
        } catch {
          if (!cancelled && collegeIdRequested === selectedId) {
            setActionPlan(local.actionPlanFallback);
            setPlanSource("rules");
          }
        } finally {
          if (!cancelled && collegeIdRequested === selectedId) setPlanLoading(false);
        }
      })();
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [selectedId, profile]);

  if (!ready) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  if (savedCollegeIds.length === 0) {
    return (
      <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <p className="text-sm text-[var(--muted)]">
          Save schools from <strong className="text-[var(--text)]">Match</strong> to unlock AI-powered admissions
          analysis.
        </p>
        <Link
          href="/match"
          className="inline-flex rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
        >
          Go to Match
        </Link>
      </div>
    );
  }

  if (!college || !match || !analysis) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  const displayPlan = actionPlan ?? analysis.actionPlanFallback;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">AI-Powered Admissions Analysis</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Click each school to see personalized insights</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {savedCollegeIds.map((id) => {
          const c = getCollegeById(id);
          if (!c) return null;
          const short = c.name.split(" ")[0] ?? c.name;
          const active = id === selectedId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedId(id)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-white/20 bg-white text-[var(--bg)]"
                  : "border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] hover:bg-white/5",
              )}
            >
              {short}
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-b from-sky-500/10 via-[var(--surface)] to-[var(--surface)] shadow-lg shadow-sky-950/20">
        <div className="border-b border-sky-500/15 bg-sky-500/5 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">{college.name}</h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{analysis.statsLine}</p>
            </div>
            <TierBadge tier={match.tier} label={formatTierBadge(match.tier, match.estimatedRate)} />
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              Your strengths
            </div>
            <ul className="space-y-3 text-sm">
              {analysis.strengths.map((s) => (
                <li key={s.label + s.detail}>
                  <span className="font-medium text-[var(--text)]">{s.label}</span>
                  <span className="text-[var(--muted)]"> — {s.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              Areas to strengthen
            </div>
            <ul className="list-inside list-disc space-y-2 text-sm text-[var(--muted)]">
              {analysis.areasToStrengthen.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-sky-500/15 bg-sky-500/5 px-4 py-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Lightbulb className="h-4 w-4 text-amber-300" aria-hidden />
            AI action plan
          </div>
          {planLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Generating plan…
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-[var(--text)]">{displayPlan}</p>
              {planSource ? (
                <p className="mt-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  {planSource === "ai" ? "Enhanced with AI" : "Rule-based (set OPENAI_API_KEY for richer prose)"}
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
