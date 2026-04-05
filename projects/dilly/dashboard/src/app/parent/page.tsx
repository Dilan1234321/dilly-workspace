"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { dilly } from "@/lib/dilly";

type ParentSummary = {
  student_name: string;
  track: string | null;
  school_id: string | null;
  last_audit_at: number | null;
  last_scores: { smart?: number; grit?: number; build?: number } | null;
  on_track: boolean | null;
  peer_percentiles?: Record<string, unknown>;
};

function ParentView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [summary, setSummary] = useState<ParentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional
      setError("Missing link. Your student can generate a new invite link in Settings → Share with parent.");
      return;
    }
    dilly.get<ParentSummary>(`/parent/summary?token=${encodeURIComponent(token)}`)
      .then(setSummary)
      .catch(() => setError("Invalid or expired link. Ask your student to generate a new link in Settings."));
  }, [token]);

  if (error) {
    return (
      <div className="m-app min-h-screen flex flex-col items-center justify-center p-6">
        <div className="max-w-[375px] text-center">
          <h1 className="text-lg font-semibold text-[var(--m-text)] mb-2">Couldn&apos;t load progress</h1>
          <p className="text-sm text-[var(--m-text-3)] mb-4">{error}</p>
          <Link href="/" className="text-sm text-[var(--dilly-primary)] hover:underline">Go to Dilly</Link>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="m-app min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-[var(--m-text-3)]">Loading…</p>
      </div>
    );
  }

  const name = summary.student_name || "Your student";
  const track = summary.track || "-";
  const scores = summary.last_scores;
  const onTrack = summary.on_track;

  return (
    <div className="m-app min-h-screen">
      <header className="m-header">
        <div className="m-header-inner">
          <span className="text-sm font-medium" style={{ color: "var(--m-text-2)" }}>Dilly</span>
          <h1 className="text-base font-semibold" style={{ color: "var(--m-text)" }}>Parent view</h1>
          <div className="w-16" />
        </div>
      </header>
      <main className="m-page px-4 pb-10">
        <div className="max-w-[375px] mx-auto space-y-6">
          <div className="m-rounded-card p-4" style={{ backgroundColor: "var(--m-surface-2)", border: "1px solid var(--m-border)" }}>
            <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--m-text-4)] mb-1">Student</p>
            <p className="text-lg font-semibold text-[var(--m-text)]">{name}</p>
            <p className="text-sm text-[var(--m-text-3)]">{track}</p>
          </div>
          {summary.last_audit_at ? (
            <>
              <div className="m-rounded-card p-4" style={{ backgroundColor: "var(--m-surface-2)", border: "1px solid var(--m-border)" }}>
                <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--m-text-4)] mb-2">Last audit</p>
                <p className="text-xs text-[var(--m-text-3)] mb-2">
                  {new Date(summary.last_audit_at * 1000).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </p>
                {scores && (
                  <div className="flex flex-wrap gap-2">
                    {typeof scores.smart === "number" && <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/15 text-green-500">Smart {scores.smart}</span>}
                    {typeof scores.grit === "number" && <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/15 text-amber-500">Grit {scores.grit}</span>}
                    {typeof scores.build === "number" && <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/15 text-amber-500">Build {scores.build}</span>}
                  </div>
                )}
              </div>
              {onTrack !== null && (
                <div className="m-rounded-card p-4" style={{ backgroundColor: "var(--m-surface-2)", border: "1px solid var(--m-border)" }}>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--m-text-4)] mb-1">Status</p>
                  <p className="text-sm font-medium" style={{ color: onTrack ? "var(--m-text)" : "var(--m-text-3)" }}>
                    {onTrack ? "On track" : "Room to grow"}
                  </p>
                  <p className="text-xs text-[var(--m-text-4)] mt-1">
                    {onTrack ? "Scores are at or above 50 in all dimensions." : "Suggest focusing on the lower-scoring dimensions."}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="m-rounded-card p-4" style={{ backgroundColor: "var(--m-surface-2)", border: "1px solid var(--m-border)" }}>
              <p className="text-sm text-[var(--m-text-3)]">No audit yet. When {name} runs a resume audit, you&apos;ll see scores and status here.</p>
            </div>
          )}
          <p className="text-center text-[11px] text-[var(--m-text-4)]">
            Dilly · We don&apos;t sell your data. <Link href="https://trydilly.com/for-parents.html" className="underline">For parents</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function ParentPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading…" className="m-app" />}>
      <ParentView />
    </Suspense>
  );
}
