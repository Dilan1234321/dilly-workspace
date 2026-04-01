"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dilly } from "@/lib/dilly";
import { LoaderOne } from "@/components/ui/loader-one";
import { JOBS_VARS } from "@/components/jobs/jobsTokens";
import { JobsHeader } from "@/components/jobs/JobsHeader";
import { FilterRow, type JobFilterKey } from "@/components/jobs/FilterRow";
import { JobCard } from "@/components/jobs/JobCard";
import { JobsLockedOverlay } from "@/components/jobs/JobsLockedOverlay";
import { ApplyModal } from "@/components/jobs/ApplyModal";
import { JobsEmptyState } from "@/components/jobs/JobsEmptyState";
import type { JobMatch, JobsPageData } from "@/types/jobsPage";
import { JOBS_PAGE_CACHE_KEY, isFullJobMatch } from "@/types/jobsPage";

function matchesFilter(m: JobMatch, f: JobFilterKey): boolean {
  if (f === "all") return true;
  if (f === "ready") return m.readiness === "ready";
  if (f === "close_gap") return m.readiness === "close_gap";
  if (f === "internship") return m.type === "internship";
  if (f === "full_time") return m.type === "full_time";
  return true;
}

function sortAppliedLast(jobs: JobMatch[]): JobMatch[] {
  return [...jobs].sort((a, b) => {
    if (a.applied !== b.applied) return a.applied ? 1 : -1;
    return 0;
  });
}

export type JobsPanelProps = {
  /** Logged-in user email; panel no-ops until present. */
  userEmail: string | undefined | null;
  subscribed: boolean;
  /** Optional filter from deep link (`?type=internship` → Get Hired Jobs). */
  initialFilter?: JobFilterKey | null;
  /** When true, omit outer max-width (parent provides layout). */
  embedded?: boolean;
};

/**
 * Jobs for you — same data and cards as legacy `/jobs` page, for embedding under Get Hired.
 */
export function JobsPanel({ userEmail, subscribed, initialFilter, embedded }: JobsPanelProps) {
  const [payload, setPayload] = useState<JobsPageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [filter, setFilter] = useState<JobFilterKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyModalJob, setApplyModalJob] = useState<JobMatch | null>(null);
  const [appliedOverrides, setAppliedOverrides] = useState<Record<string, boolean>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [updatedFade, setUpdatedFade] = useState(1);

  useEffect(() => {
    if (!initialFilter) return;
    setFilter(initialFilter);
  }, [initialFilter]);

  const loadJobs = useCallback(async () => {
    setFetching(true);
    setLoadError(null);
    try {
      const res = await dilly.fetch("/jobs/page", { cache: "no-store" });
      if (!res.ok) throw new Error("jobs-page");
      const data = (await res.json()) as JobsPageData;
      setPayload(data);
      setUpdatedAt(Date.now());
      try {
        sessionStorage.setItem(JOBS_PAGE_CACHE_KEY, JSON.stringify({ ts: Date.now(), payload: data }));
      } catch {
        /* ignore */
      }
    } catch {
      setLoadError("Could not load jobs. Pull to refresh.");
      try {
        const raw = sessionStorage.getItem(JOBS_PAGE_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { payload?: JobsPageData };
          if (parsed?.payload) setPayload(parsed.payload);
        }
      } catch {
        /* ignore */
      }
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!userEmail || !subscribed) return;
    void loadJobs();
  }, [userEmail, subscribed, loadJobs]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && userEmail && subscribed) void loadJobs();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userEmail, subscribed, loadJobs]);

  useEffect(() => {
    if (!subscribed || updatedAt == null) return;
    setUpdatedFade(1);
    const t = setTimeout(() => setUpdatedFade(0), 4000);
    return () => clearTimeout(t);
  }, [updatedAt, subscribed]);

  const mergedMatches = useMemo(() => {
    if (!payload?.matches) return [];
    return payload.matches.map((m) => {
      if (!isFullJobMatch(m)) return m;
      return { ...m, applied: m.applied || !!appliedOverrides[m.id] };
    });
  }, [payload?.matches, appliedOverrides]);

  const fullMatchesRaw = useMemo(
    () => mergedMatches.filter((m): m is JobMatch => isFullJobMatch(m)),
    [mergedMatches],
  );

  const stubs = useMemo(() => mergedMatches.filter((m) => !isFullJobMatch(m)), [mergedMatches]);

  const filteredFull = useMemo(() => {
    const list = fullMatchesRaw.filter((m) => matchesFilter(m, filter));
    return sortAppliedLast(list);
  }, [fullMatchesRaw, filter]);

  const showFilterEmpty = fullMatchesRaw.length > 0 && filteredFull.length === 0 && filter !== "all";

  const allFullApplied =
    fullMatchesRaw.length > 0 && fullMatchesRaw.every((m) => m.applied || appliedOverrides[m.id]);

  const updatedLabel =
    subscribed && updatedAt != null
      ? `Updated ${new Date(updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
      : null;

  const markApplied = (job: JobMatch) => {
    setAppliedOverrides((prev) => ({ ...prev, [job.id]: true }));
    const today = new Date().toISOString().slice(0, 10);
    void dilly.fetch("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: job.company ?? "Unknown",
        role: job.title ?? "Position",
        status: "applied",
        job_id: String(job.id),
        job_url: job.apply_url ?? null,
        match_pct: job.match_pct != null ? Math.round(job.match_pct) : null,
        applied_at: today,
      }),
    }).catch(() => {});
  };

  if (!userEmail || !subscribed) {
    return null;
  }

  const p = payload;
  const noLocation = p && !p.has_location_prefs && p.total_matches === 0;
  const noAuditEmpty = p && !p.has_audit && p.total_matches === 0;

  const outerClass = embedded
    ? "min-w-0 flex flex-col flex-1"
    : "min-h-[100dvh] min-h-screen w-full max-w-[430px] mx-auto flex flex-col overflow-x-hidden";

  return (
    <div
      className={outerClass}
      style={{
        ...JOBS_VARS,
        background: "var(--bg)",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
      }}
    >
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto">
        {fetching && !p ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <LoaderOne color="var(--green)" size={12} />
          </div>
        ) : p && noLocation ? (
          <JobsEmptyState variant="no_location" />
        ) : p && noAuditEmpty ? (
          <JobsEmptyState variant="no_audit" />
        ) : p && !noLocation && !noAuditEmpty && p.total_matches === 0 ? (
          <JobsEmptyState variant="no_matches" />
        ) : p && !noLocation && !noAuditEmpty && allFullApplied ? (
          <JobsEmptyState variant="all_applied" />
        ) : p ? (
          <>
            <JobsHeader totalMatches={p.total_matches} updatedLabel={updatedLabel} updatedOpacity={updatedFade} />
            <FilterRow active={filter} onChange={setFilter} />
            {loadError ? (
              <p className="px-5 text-center text-xs mb-2" style={{ color: "var(--coral)" }}>
                {loadError}
              </p>
            ) : null}
            {showFilterEmpty ? (
              <JobsEmptyState variant="filter_empty" />
            ) : (
              <>
                {filteredFull.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    expanded={expandedId === job.id}
                    onExpand={() => setExpandedId(job.id)}
                    onCollapse={() => setExpandedId(null)}
                    onApplied={markApplied}
                    onOpenApplyEmail={(j) => setApplyModalJob(j)}
                  />
                ))}
                {p.is_free_tier && p.locked_count > 0 && stubs.length > 0 ? (
                  <JobsLockedOverlay lockedCount={p.locked_count} stubs={stubs} />
                ) : null}
              </>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center py-16">
            <LoaderOne color="var(--green)" size={12} />
          </div>
        )}
      </div>

      <ApplyModal
        job={applyModalJob}
        onClose={() => setApplyModalJob(null)}
        onSent={() => {
          if (applyModalJob) markApplied(applyModalJob);
        }}
      />
    </div>
  );
}
