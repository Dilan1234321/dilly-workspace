import { useState, useRef, useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { useToast } from "@/hooks/useToast";
import { dilly } from "@/lib/dilly";
import { getEffectiveCohortLabel } from "@/lib/trackDefinitions";
import {
  GOALS_ALL,
  auditStorageKey,
  setCareerCenterReturnPath,
  scoresCrossedMilestones,
  writeLastAtsScoreCache,
  minimalAuditFromHistorySummary,
  type AuditHistorySummaryRow,
} from "@/lib/dillyUtils";
import { computeNewUnlocks, type ProfileAchievements } from "@/lib/achievements";
import { fireConfetti } from "@/components/ConfettiCelebration";
import { playSound } from "@/lib/sounds";
import { tryFireMicroCelebration } from "@/lib/dillyMicroCelebrations";
import type { AuditV2, CohortPulse, UserCohortPulse } from "@/types/dilly";

interface UseDataFetchingParams {
  latestAuditRef: React.MutableRefObject<AuditV2 | null>;
  setApplicationTarget: (v: string) => void;
}

export function useDataFetching({ latestAuditRef, setApplicationTarget }: UseDataFetchingParams) {
  const { toast } = useToast();
  const {
    state: { mainAppTab, reviewSubView, getHiredSubTab },
  } = useNavigation();
  const { user, appProfile, setAppProfile } = useAppContext();
  const {
    audit, setAudit,
    lastAudit,
    savedAuditForCenter, setSavedAuditForCenter,
    viewingAudit, setViewingAudit,
    auditHistory, setAuditHistory, setAuditHistoryLoading,
    atsScoreHistory, setAtsScoreHistory,
    setAtsPeerPercentile,
    setDoorEligibility,
    centerRefreshKey,
  } = useAuditScore();
  const {
    voiceOverlayOpen,
    voiceApplicationsPreview, setVoiceApplicationsPreview,
    setMemoryItems,
  } = useVoice();

  const [currentCohortPulse, setCurrentCohortPulse] = useState<(UserCohortPulse & { cohort: CohortPulse }) | null>(null);
  const [habits, setHabits] = useState<{
    streak?: number;
    longest_streak?: number;
    already_checked_in?: boolean;
    today?: string;
    daily_action?: { id: string; label: string; action: string };
    applications_this_month?: number;
    applications_this_week?: number;
    applied_count?: number;
    silent_2_weeks?: number;
    silent_apps?: { company: string; role: string }[];
    upcoming_deadlines?: { label: string; date: string; days: number }[];
    is_review_day?: boolean;
    milestones?: { first_application?: boolean; first_interview?: boolean; first_offer?: boolean; ten_applications?: boolean };
    ritual_suggestions?: { id: string; label: string; prompt: string }[];
    pipeline_counts?: { applied?: number; interviewing?: number; offers?: number };
  } | null>(null);
  const [proactiveLines, setProactiveLines] = useState<string[]>([]);
  const [proactiveNudges, setProactiveNudges] = useState<{
    app_funnel?: { applied: number; responses: number; interviews: number; silent_2_weeks: number };
    relationship_nudges?: { person: string; weeks_ago: number }[];
    deadline_urgent?: { label: string; days: number };
    score_nudge?: { dimension: string; gain: number };
    seasonal?: { label: string };
  } | null>(null);
  const [recommendedJobs, setRecommendedJobs] = useState<{ id: string; title: string; company: string; location: string; url: string; match_pct: number; why_bullets: string[] }[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [cohortStats, setCohortStats] = useState<{ track: string; cohort_n: number; use_fallback: boolean; avg: { smart: number; grit: number; build: number }; p25: { smart: number; grit: number; build: number }; p75: { smart: number; grit: number; build: number }; how_to_get_ahead: string } | null>(null);
  const [progressExplainer, setProgressExplainer] = useState<string | null>(null);
  const [progressExplainerLoading, setProgressExplainerLoading] = useState(false);

  // Celebration refs
  const streakCelebrationInitRef = useRef(false);
  const prevStreakForCelebrationRef = useRef<number | undefined>(undefined);
  const auditCelebrationInitRef = useRef(false);
  const prevAuditCountForCelebrationRef = useRef(0);
  const appCelebrationInitRef = useRef(false);
  const prevAppCountForCelebrationRef = useRef(0);
  const milestoneCelebratedForTsRef = useRef<number | null>(null);

  // Cohort pulse fetch
  useEffect(() => {
    const needsPulse = mainAppTab === "center";
    if (!needsPulse || !user?.subscribed) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/cohort-pulse/current`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const row = d && typeof d === "object" ? (d as UserCohortPulse & { cohort: CohortPulse }) : null;
        setCurrentCohortPulse(row);
      })
      .catch(() => setCurrentCohortPulse(null));
  }, [mainAppTab, user?.subscribed, centerRefreshKey]);

  // Proactive nudges + habits + applications fetch
  useEffect(() => {
    const needsNudges = mainAppTab === "center" || mainAppTab === "voice" || voiceOverlayOpen;
    if (!needsNudges || !user?.subscribed) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/voice/proactive-nudges`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const lines = Array.isArray(d?.proactive_lines) ? d.proactive_lines : [];
        setProactiveLines(lines);
        const nudges = d?.proactive_nudges;
        setProactiveNudges(nudges && typeof nudges === "object" ? nudges : null);
      })
      .catch(() => { setProactiveLines([]); setProactiveNudges(null); });
    dilly.fetch(`/habits`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHabits(d && typeof d === "object" ? d : null))
      .catch(() => setHabits(null));
    dilly.fetch(`/applications`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rows =
          d && typeof d === "object" && Array.isArray((d as { applications?: unknown }).applications)
            ? (d as { applications: Record<string, unknown>[] }).applications
            : [];
        setVoiceApplicationsPreview(
          rows
            .slice(0, 15)
            .map((a) => ({
              company: String(a.company ?? "").trim(),
              role: a.role ? String(a.role).trim() : undefined,
              status: a.status ? String(a.status).trim() : undefined,
              deadline:
                a.deadline != null && String(a.deadline).trim() ? String(a.deadline).trim() : null,
            }))
            .filter((a) => a.company),
        );
      })
      .catch(() => setVoiceApplicationsPreview([]));
  }, [mainAppTab, voiceOverlayOpen, user?.subscribed, centerRefreshKey]);

  // Memory items fetch
  useEffect(() => {
    if (!user?.subscribed) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/memory`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setMemoryItems(Array.isArray(d?.items) ? d.items : []);
      })
      .catch(() => { setMemoryItems([]); });
  }, [user?.subscribed, centerRefreshKey]);

  // Celebration effects for streak/audit/app milestones
  useEffect(() => {
    if (!user?.subscribed || habits?.streak == null) return;
    const s = habits.streak;
    if (!streakCelebrationInitRef.current) {
      streakCelebrationInitRef.current = true;
      prevStreakForCelebrationRef.current = s;
      return;
    }
    const prev = prevStreakForCelebrationRef.current;
    prevStreakForCelebrationRef.current = s;
    if (s >= 7 && (prev ?? 0) < 7) tryFireMicroCelebration("streak_7", toast);
  }, [habits?.streak, user?.subscribed, toast]);

  useEffect(() => {
    if (!user?.subscribed) return;
    const n = auditHistory.length;
    if (!auditCelebrationInitRef.current) {
      auditCelebrationInitRef.current = true;
      prevAuditCountForCelebrationRef.current = n;
      return;
    }
    const prev = prevAuditCountForCelebrationRef.current;
    if (prev === 0 && n === 1) tryFireMicroCelebration("first_audit", toast);
    prevAuditCountForCelebrationRef.current = n;
  }, [auditHistory.length, user?.subscribed, toast]);

  useEffect(() => {
    if (!user?.subscribed) return;
    const n = voiceApplicationsPreview.length;
    if (!appCelebrationInitRef.current) {
      appCelebrationInitRef.current = true;
      prevAppCountForCelebrationRef.current = n;
      return;
    }
    const prev = prevAppCountForCelebrationRef.current;
    if (prev === 0 && n === 1) tryFireMicroCelebration("first_application", toast);
    prevAppCountForCelebrationRef.current = n;
  }, [voiceApplicationsPreview.length, user?.subscribed, toast]);

  // Career center return path
  useEffect(() => {
    if (mainAppTab === "hiring" && reviewSubView === "upload") return;
    let path = "/?tab=center";
    if (mainAppTab === "hiring" && reviewSubView === "insights") path = "/?tab=insights";
    else if (mainAppTab === "hiring" && reviewSubView === "home") path = "/score";
    else if (mainAppTab === "calendar") path = "/?tab=calendar";
    else if (mainAppTab === "resources") {
      path = getHiredSubTab === "jobs" ? "/?tab=resources&view=jobs" : "/?tab=resources";
    }
    else if (mainAppTab === "practice") path = "/?tab=practice";
    setCareerCenterReturnPath(path);
  }, [mainAppTab, reviewSubView, getHiredSubTab]);

  // Scroll to insights
  useEffect(() => {
    if (mainAppTab === "hiring" && reviewSubView === "insights") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [mainAppTab, reviewSubView]);

  // Saved audit hydration from localStorage
  useEffect(() => {
    if (!user?.email) return;
    try {
      const raw = localStorage.getItem(auditStorageKey(user.email));
      if (raw) {
        const parsed = JSON.parse(raw) as AuditV2;
        if (parsed && typeof parsed.scores === "object" && parsed.final_score != null && !isNaN(Number(parsed.final_score))) {
          setSavedAuditForCenter(parsed);
          latestAuditRef.current = parsed;
          return;
        }
      }
    } catch { /* ignore */ }
    setSavedAuditForCenter(null);
  }, [user?.email]);

  // Audit history fetch
  useEffect(() => {
    if (!user?.email) { setAuditHistory([]); setAuditHistoryLoading(false); return; }
    if (!localStorage.getItem("dilly_auth_token")) { setAuditHistoryLoading(false); return; }
    setAuditHistoryLoading(true);
    dilly.fetch(`/audit/history`)
      .then((res) => (res.ok ? res.json() : { audits: [] }))
      .then((data) => { setAuditHistory(Array.isArray(data?.audits) ? data.audits : []); setAuditHistoryLoading(false); })
      .catch(() => { setAuditHistory([]); setAuditHistoryLoading(false); });
  }, [user?.email, centerRefreshKey]);

  // ATS score history fetch
  useEffect(() => {
    if (!user?.email) { setAtsScoreHistory([]); setAtsPeerPercentile(null); return; }
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/ats-score/history`)
      .then((res) => (res.ok ? res.json() : { scores: [] }))
      .then((data) => {
        const scores = Array.isArray(data?.scores) ? data.scores : [];
        setAtsScoreHistory(scores);
        const pct = data?.ats_peer_percentile;
        setAtsPeerPercentile(typeof pct === "number" && pct >= 0 && pct <= 100 ? pct : null);
        if (scores.length > 0) {
          const s0 = scores[0] as { score?: unknown; ts?: unknown; audit_id?: unknown };
          const sc = Math.round(Number(s0.score));
          if (!Number.isNaN(sc)) {
            const tsSec = typeof s0.ts === "number" ? s0.ts : 0;
            writeLastAtsScoreCache({
              score: sc,
              ts: tsSec > 1e12 ? Math.round(tsSec) : Math.round(tsSec * 1000),
              audit_id: s0.audit_id != null && s0.audit_id !== "" ? String(s0.audit_id) : null,
            });
          }
        }
      })
      .catch(() => { setAtsScoreHistory([]); setAtsPeerPercentile(null); });
  }, [user?.email, centerRefreshKey, mainAppTab, reviewSubView]);

  // Door eligibility fetch
  useEffect(() => {
    if (!user?.email || !user?.subscribed) { setDoorEligibility(null); return; }
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/door-eligibility`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.doors)) {
          setDoorEligibility({
            doors: data.doors,
            eligible_count: typeof data.eligible_count === "number" ? data.eligible_count : 0,
            next_door: data.next_door ?? null,
          });
        } else {
          setDoorEligibility(null);
        }
      })
      .catch(() => setDoorEligibility(null));
  }, [user?.email, user?.subscribed, centerRefreshKey]);

  // Latest audit restore
  useEffect(() => {
    if (!user?.email || auditHistory.length === 0) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    const latest = auditHistory[0];
    const latestId = latest?.id?.trim();
    const rowUsable =
      latest &&
      typeof latest.scores === "object" &&
      latest.scores !== null &&
      (latest as { final_score?: unknown }).final_score != null &&
      !isNaN(Number((latest as { final_score?: unknown }).final_score));

    const applyMinimalFromHistory = () => {
      if (!rowUsable) return;
      const minimal = minimalAuditFromHistorySummary(latest as AuditHistorySummaryRow);
      setAudit(minimal);
      setSavedAuditForCenter(minimal);
      latestAuditRef.current = minimal;
    };
    const hydrateFromServer = () => {
      if (!latestId) return;
      dilly.fetch(`/audit/history/${encodeURIComponent(latestId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const full = data?.audit;
          if (full && typeof full === "object" && typeof full.scores === "object") {
            setAudit(full);
            setSavedAuditForCenter(full);
            latestAuditRef.current = full;
            try { localStorage.setItem(auditStorageKey(user?.email ?? ""), JSON.stringify(full)); } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    };

    const fromStorage = typeof localStorage !== "undefined" ? localStorage.getItem(auditStorageKey(user?.email ?? "")) : null;
    if (fromStorage) {
      try {
        const parsed = JSON.parse(fromStorage) as AuditV2;
        if (parsed && typeof parsed.scores === "object" && parsed.final_score != null && !isNaN(Number(parsed.final_score))) {
          const parsedId = parsed.id?.trim();
          if (latestId && parsedId && parsedId !== latestId) {
            applyMinimalFromHistory();
            hydrateFromServer();
            return;
          }
          setAudit(parsed);
          setSavedAuditForCenter(parsed);
          latestAuditRef.current = parsed;
          return;
        }
      } catch { /* ignore */ }
    }
    if (rowUsable) applyMinimalFromHistory();
    hydrateFromServer();
  }, [user?.email, auditHistory]);

  // Achievement auto-update
  useEffect(() => {
    if (!user?.email || !appProfile) return;
    const audits = auditHistory.map((a) => ({
      id: a.id, ts: a.ts, scores: a.scores, final_score: a.final_score,
      detected_track: a.detected_track, peer_percentiles: a.peer_percentiles, page_count: a.page_count,
    }));
    const ctx = {
      profile: {
        achievements: appProfile.achievements ?? {},
        track: appProfile.track ?? null,
        first_application_at: (appProfile as { first_application_at?: number }).first_application_at ?? null,
        first_interview_at: (appProfile as { first_interview_at?: number }).first_interview_at ?? null,
        application_count: (appProfile as { application_count?: number }).application_count,
      },
      audits,
      streakDays: undefined,
      lastVisitDates: undefined,
    };
    const newUnlocks = computeNewUnlocks(ctx);
    if (Object.keys(newUnlocks).length === 0) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    const merged = Object.fromEntries(
      Object.entries({ ...(appProfile.achievements ?? {}), ...newUnlocks }).filter(([, v]) => v != null)
    ) as ProfileAchievements;
    dilly.fetch(`/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ achievements: merged }),
    })
      .then((res) => {
        if (res.ok) setAppProfile((prev) => (prev ? { ...prev, achievements: merged } : prev));
      })
      .catch(() => {});
  }, [user?.email, appProfile, auditHistory]);

  // Recommended jobs fetch
  useEffect(() => {
    if (!user?.email || !user?.subscribed) return;
    if (mainAppTab !== "center" && mainAppTab !== "hiring") return;
    if (recommendedJobs.length > 0) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    setJobsLoading(true);
    dilly.fetch(`/jobs/recommended?limit=15&offset=0`)
      .then((res) => (res.ok ? res.json() : { jobs: [] }))
      .then((data) => { setRecommendedJobs(Array.isArray(data?.jobs) ? data.jobs : []); })
      .catch(() => setRecommendedJobs([]))
      .finally(() => setJobsLoading(false));
  }, [user?.email, user?.subscribed, mainAppTab]);

  // Cohort stats fetch
  useEffect(() => {
    const onInsights = mainAppTab === "hiring" && reviewSubView === "insights";
    if (!user?.subscribed || (!onInsights && mainAppTab !== "center")) return;
    const auditT = savedAuditForCenter?.detected_track ?? audit?.detected_track;
    const track = getEffectiveCohortLabel(auditT, appProfile?.track);
    if (!track) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/peer-cohort-stats?track=${encodeURIComponent(track)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.cohort_n === "number" && data.cohort_n > 0 && data.avg) setCohortStats(data as typeof cohortStats);
        else setCohortStats(null);
      })
      .catch(() => setCohortStats(null));
  }, [user?.subscribed, mainAppTab, reviewSubView, savedAuditForCenter?.detected_track, audit?.detected_track, appProfile?.track]);

  // Score milestone celebration
  useEffect(() => {
    if (mainAppTab !== "center" || auditHistory.length < 2) return;
    const current = auditHistory[auditHistory.length - 1];
    const prev = auditHistory[auditHistory.length - 2];
    const ts = current?.ts;
    if (ts == null || milestoneCelebratedForTsRef.current === ts) return;
    const crossed = scoresCrossedMilestones(current, prev);
    if (crossed.length > 0) {
      milestoneCelebratedForTsRef.current = ts;
      fireConfetti();
      playSound("celebration");
    }
  }, [mainAppTab, auditHistory]);

  // Reset viewingAudit on center
  useEffect(() => {
    if (mainAppTab === "center") setViewingAudit(null);
  }, [mainAppTab]);

  // Sync primary goal input when profile loads
  useEffect(() => {
    // This returns data needed by page.tsx — handled as state sync
  }, [appProfile?.career_goal, appProfile?.goals]);

  // Progress explainer fetch
  useEffect(() => {
    if (!audit || !lastAudit) { setProgressExplainer(null); return; }
    setProgressExplainerLoading(true);
    setProgressExplainer(null);
    dilly.fetch(`/audit/explain-delta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previous: lastAudit, current: audit }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => setProgressExplainer(data?.explainer || null))
      .catch(() => setProgressExplainer(null))
      .finally(() => setProgressExplainerLoading(false));
  }, [audit?.final_score, audit?.candidate_name, lastAudit?.final_score, lastAudit?.candidate_name]);

  return {
    currentCohortPulse,
    setCurrentCohortPulse,
    habits,
    proactiveLines,
    proactiveNudges,
    recommendedJobs,
    jobsLoading,
    cohortStats,
    progressExplainer,
    progressExplainerLoading,
  };
}
