"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  API_BASE,
  AUTH_TOKEN_KEY,
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_MAX_AGE_MS,
  auditScrollStorageKey,
  auditStorageKey,
  consumeAuditReportHandoff,
  DILLY_OPEN_OVERLAY_KEY,
  getCareerCenterReturnPath,
  setCareerCenterReturnPath,
} from "@/lib/dillyUtils";
import type { AuditV2 } from "@/types/dilly";
import { buildAuditReportViewModel } from "@/lib/auditReportViewModel";
import { BottomNav, CareerCenterTabIcon, JobsTabIcon, RankTabIcon, type MainAppTabKey } from "@/components/career-center";
import { DEFAULT_VOICE_AVATAR_INDEX, getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import { hapticLight } from "@/lib/haptics";
import { AuditScoreHero } from "@/components/audit/AuditScoreHero";
import { AuditDimensionGrid } from "@/components/audit/AuditDimensionGrid";
import { AuditRadarChart } from "@/components/audit/AuditRadarChart";
import { AuditBenchmarking } from "@/components/audit/AuditBenchmarking";
import { AuditCohortCard } from "@/components/audit/AuditCohortCard";
import { AuditRecommendationsList } from "@/components/audit/AuditRecommendationsList";
import { AuditEvidenceCard } from "@/components/audit/AuditEvidenceCard";
import { AuditConsistencyCard } from "@/components/audit/AuditConsistencyCard";
import { AuditCTAs } from "@/components/audit/AuditCTAs";
import { DillyAvatar } from "@/components/ats/DillyAvatar";

/** Session (main app) + localStorage (ATS) — same keys as /ats and home overlay. */
function readCachedSubscribedUser(): { email: string; subscribed: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_USER_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { email?: string; subscribed?: boolean; ts?: number };
      if (
        parsed?.email &&
        typeof parsed.ts === "number" &&
        Date.now() - parsed.ts < AUTH_USER_CACHE_MAX_AGE_MS &&
        parsed.subscribed
      ) {
        return { email: parsed.email, subscribed: true };
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const lr = localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (lr) {
      const parsed = JSON.parse(lr) as { ts?: number; user?: { email: string; subscribed: boolean } };
      const now = Date.now();
      if (
        parsed?.user?.email &&
        typeof parsed.ts === "number" &&
        now - parsed.ts < AUTH_USER_CACHE_MAX_AGE_MS &&
        parsed.user.subscribed
      ) {
        return parsed.user;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function formatHeaderDate(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AuditReportPageHeader({
  tsMs,
  onBack,
}: {
  tsMs: number | null;
  onBack: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center w-full max-w-[390px] mx-auto px-4 py-3 gap-2"
      style={{ background: "var(--bg)" }}
    >
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-[12px] border-0 outline-none"
        style={{ background: "transparent", color: "var(--t2)" }}
        aria-label="Back"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1
        className="flex-1 text-center truncate"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--t1)",
          letterSpacing: "-0.02em",
        }}
      >
        Audit Report
      </h1>
      <span className="shrink-0 text-right w-[52px] tabular-nums" style={{ fontSize: 11, fontWeight: 500, color: "var(--t3)" }}>
        {tsMs != null ? formatHeaderDate(tsMs) : "—"}
      </span>
    </header>
  );
}

function SkeletonPulse({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{
        background: "var(--s2)",
        animation: "audit-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function AuditReportSkeleton() {
  return (
    <div className="px-4 pb-10 flex flex-col gap-2.5" style={{ marginTop: 12 }}>
      <style>{`@keyframes audit-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
      <SkeletonPulse style={{ borderRadius: 20, height: 220 }} />
      <SkeletonPulse style={{ height: 14, width: 120, borderRadius: 8 }} />
      <div className="grid grid-cols-2 gap-2">
        <SkeletonPulse style={{ height: 120, borderRadius: 14 }} />
        <SkeletonPulse style={{ height: 120, borderRadius: 14 }} />
      </div>
      <SkeletonPulse style={{ height: 100, borderRadius: 14, gridColumn: "1 / -1" }} />
    </div>
  );
}

function AuditReportPageInner() {
  const params = useParams();
  const router = useRouter();
  const auditId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
  const scrollKey = auditId ? auditScrollStorageKey(auditId) : "";

  const [user, setUser] = useState<{ email: string; subscribed: boolean } | null>(() => readCachedSubscribedUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [vm, setVm] = useState<ReturnType<typeof buildAuditReportViewModel>>(null);
  const [barsAnimated, setBarsAnimated] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasVmRef = useRef(false);
  hasVmRef.current = vm != null;

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      router.replace("/");
      return;
    }
    const cached = readCachedSubscribedUser();
    if (cached) setUser((prev) => prev ?? cached);
  }, [router]);

  /** In-session handoff (from app) or localStorage cache — instant paint like /ats + home. */
  useLayoutEffect(() => {
    if (typeof window === "undefined" || !auditId) return;

    const applyAudit = (audit: AuditV2, idNorm: string) => {
      const model = buildAuditReportViewModel({ ...audit, id: idNorm }, {
        auditTsSeconds: null,
        previousFinalScore: null,
      });
      if (model) {
        setVm(model);
        setLoading(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setBarsAnimated(true));
        });
      }
    };

    const handed = consumeAuditReportHandoff(auditId);
    if (handed) {
      applyAudit(handed, auditId);
      return;
    }

    const email = user?.email ?? readCachedSubscribedUser()?.email;
    if (!email) return;
    try {
      const raw = localStorage.getItem(auditStorageKey(email));
      if (!raw) return;
      const audit = JSON.parse(raw) as AuditV2;
      const id = String(audit?.id || "").trim();
      if (id !== auditId || !audit.scores) return;
      applyAudit(audit, id || auditId);
    } catch {
      /* ignore */
    }
  }, [auditId, user?.email]);

  useEffect(() => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) {
      router.replace("/");
      return;
    }

    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const u = { email: data?.email ?? "", subscribed: !!data?.subscribed };
        setUser(u);
        if (!u.subscribed) router.replace("/");
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (!user?.subscribed || !auditId) return;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;

    let cancelled = false;
    const showBlockingLoading = !hasVmRef.current;
    if (showBlockingLoading) {
      setLoading(true);
    }
    setError(null);
    setNotFound(false);

    (async () => {
      try {
        const [histRes, auditRes] = await Promise.all([
          fetch(`${API_BASE}/audit/history`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/audit/history/${encodeURIComponent(auditId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (!auditRes.ok) {
          if (auditRes.status === 404) {
            if (!cancelled) setNotFound(true);
            return;
          }
          if (!cancelled) setError("load_failed");
          return;
        }

        const data = await auditRes.json();
        const raw = data?.audit as AuditV2 | undefined;
        const audit = raw
          ? { ...raw, id: (raw.id && String(raw.id).trim()) || auditId }
          : undefined;
        if (!audit?.scores) {
          if (!cancelled) setNotFound(true);
          return;
        }

        let prevFinal: number | null = null;
        let tsSec: number | null = null;
        if (histRes.ok) {
          const hist = await histRes.json();
          const list = Array.isArray(hist?.audits) ? hist.audits : Array.isArray(hist) ? hist : [];
          const sorted = [...list]
            .filter((a: { ts?: number }) => typeof a?.ts === "number")
            .sort((a: { ts: number }, b: { ts: number }) => b.ts - a.ts);
          const idx = sorted.findIndex((a: { id?: string }) => (a.id || "").trim() === auditId);
          if (idx >= 0 && sorted[idx + 1]) {
            prevFinal = Math.round(Number(sorted[idx + 1].final_score) || 0);
            tsSec = sorted[idx].ts;
          } else if (idx >= 0) {
            tsSec = sorted[idx].ts;
          }
        }

        const model = buildAuditReportViewModel(audit, {
          auditTsSeconds: tsSec,
          previousFinalScore: prevFinal,
        });
        if (!cancelled) {
          setVm(model);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!cancelled) setBarsAnimated(true);
            });
          });
        }
      } catch {
        if (!cancelled) setError("load_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.subscribed, auditId]);

  useEffect(() => {
    if (!scrollKey || loading) return;
    try {
      const y = sessionStorage.getItem(scrollKey);
      if (y != null) {
        const n = parseInt(y, 10);
        if (!Number.isNaN(n)) {
          requestAnimationFrame(() => window.scrollTo(0, n));
        }
      }
    } catch {
      /* ignore */
    }
  }, [scrollKey, loading, vm]);

  const onScroll = useCallback(() => {
    if (!scrollKey) return;
    try {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    } catch {
      /* ignore */
    }
  }, [scrollKey]);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const onBack = () => {
    router.push(getCareerCenterReturnPath());
  };

  useEffect(() => {
    try {
      setCareerCenterReturnPath("/?tab=center");
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      ref={contentRef}
      className="min-h-screen min-h-[100dvh] career-center-talent w-full flex flex-col pb-[120px]"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)", color: "var(--t1)" }}
    >
      <AuditReportPageHeader tsMs={vm?.tsMs ?? null} onBack={onBack} />

      {loading ? (
        <AuditReportSkeleton />
      ) : notFound ? (
        <div className="px-4 flex flex-col items-center gap-4" style={{ marginTop: 24 }}>
          <p className="text-center" style={{ fontSize: 14, color: "var(--t2)" }}>
            This audit doesn&apos;t exist or was deleted.
          </p>
          <button
            type="button"
            onClick={() => router.push(getCareerCenterReturnPath())}
            className="rounded-[14px] border-0 px-5 py-3 font-semibold"
            style={{ background: "var(--blue)", color: "var(--t1)" }}
          >
            Back to Career Center
          </button>
        </div>
      ) : error ? (
        <div className="px-4 mx-auto w-full max-w-[390px]" style={{ marginTop: 12 }}>
          <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--s2)" }}>
            <div style={{ background: "var(--coral)", padding: "10px 14px" }}>
              <span className="text-[11px] font-bold uppercase" style={{ color: "rgba(0,0,0,0.55)" }}>
                Something went wrong
              </span>
            </div>
            <div className="flex flex-col items-center gap-3 px-4 py-6">
              <DillyAvatar size={40} />
              <p className="text-center text-sm" style={{ color: "var(--t2)" }}>
                I couldn&apos;t load this audit. Give it another try.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-[14px] border-0 px-5 py-3 font-semibold"
                style={{ background: "var(--blue)", color: "var(--t1)" }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : vm ? (
        <div className="flex flex-col gap-2.5 px-4 pb-10 w-full max-w-[390px] mx-auto" style={{ marginTop: 12 }}>
          <AuditScoreHero
            final_score={vm.final_score}
            tsMs={vm.tsMs}
            track={vm.track}
            final_percentile_top={vm.final_percentile_top}
            score_delta={vm.score_delta}
            dilly_score_commentary={vm.dilly_score_commentary}
            barsAnimated={barsAnimated}
          />
          <AuditDimensionGrid
            smart={vm.smart}
            grit={vm.grit}
            build={vm.build}
            smart_at_bar={vm.smart_at_bar}
            grit_at_bar={vm.grit_at_bar}
            build_at_bar={vm.build_at_bar}
            smart_bar={vm.smart_bar}
            grit_bar={vm.grit_bar}
            build_bar={vm.build_bar}
            smart_label={vm.smart_label}
            grit_label={vm.grit_label}
            build_label={vm.build_label}
            grit_percentile_top={vm.grit_percentile_top}
            barsAnimated={barsAnimated}
          />
          <AuditRadarChart smart={vm.smart} grit={vm.grit} build={vm.build} />
          <AuditBenchmarking
            track={vm.track}
            peer_count={vm.peer_count}
            smart={vm.smart}
            grit={vm.grit}
            build={vm.build}
            smart_bar={vm.smart_bar}
            grit_bar={vm.grit_bar}
            build_bar={vm.build_bar}
            smart_percentile_top={vm.smart_percentile_top}
            grit_percentile_top={vm.grit_percentile_top}
            build_percentile_top={vm.build_percentile_top}
            smart_at_bar={vm.smart_at_bar}
            grit_at_bar={vm.grit_at_bar}
            build_at_bar={vm.build_at_bar}
            dilly_benchmarking_commentary={vm.dilly_benchmarking_commentary}
            barsAnimated={barsAnimated}
          />
          <AuditCohortCard cohort={vm.cohort_description} />
          <AuditRecommendationsList recommendations={vm.recommendations} rewrites={vm.rewrites} />
          <>
            <p
              className="uppercase"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--t3)",
                letterSpacing: "0.12em",
                padding: "6px 0 4px",
              }}
            >
              Evidence from your resume
            </p>
            <div className="flex flex-col gap-2.5">
              {vm.evidence.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--t3)" }}>No cited evidence blocks for this audit yet.</p>
              ) : (
                vm.evidence.map((e) => <AuditEvidenceCard key={e.id} ev={e} />)
              )}
            </div>
          </>
          <AuditConsistencyCard flags={vm.consistency_flags} />
          <AuditCTAs auditId={vm.id} />
        </div>
      ) : null}

      <BottomNav
        activeTab="hiring"
        onTabSelect={(key: MainAppTabKey) => {
          hapticLight();
          if (key === "voice") {
            try {
              sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
            } catch {
              /* ignore */
            }
            router.push("/?tab=center");
            return;
          }
          if (key === "center") {
            router.push(getCareerCenterReturnPath());
            return;
          }
          if (key === "rank") {
            const tr = (vm?.track || "Humanities").trim() || "Humanities";
            router.push(`/leaderboard?track=${encodeURIComponent(tr)}`);
            return;
          }
          if (key === "resources") {
            router.push("/?tab=resources");
            return;
          }
        }}
        items={[
          { key: "center", label: "Career Center", icon: <CareerCenterTabIcon /> },
          { key: "rank", label: "Rank", icon: <RankTabIcon /> },
          { key: "voice", label: "Dilly AI", icon: getVoiceAvatarUrl(DEFAULT_VOICE_AVATAR_INDEX) ? (
            <img src={getVoiceAvatarUrl(DEFAULT_VOICE_AVATAR_INDEX)!} alt="" className="w-[14px] h-[14px] object-contain" style={{ filter: "brightness(1.15) contrast(1.1)" }} />
          ) : (
            <span className="w-[14px] h-[14px] text-white" aria-hidden>✦</span>
          ) },
          { key: "resources", label: "Get Hired", icon: <JobsTabIcon /> },
        ]}
      />
    </div>
  );
}

export default function AuditReportPage() {
  return (
    <Suspense fallback={null}>
      <AuditReportPageInner />
    </Suspense>
  );
}
