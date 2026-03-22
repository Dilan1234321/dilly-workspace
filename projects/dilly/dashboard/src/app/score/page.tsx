"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import { ChevronRight, FileText, Lightbulb } from "lucide-react";
import { hapticLight } from "@/lib/haptics";
import {
  API_BASE,
  AUTH_TOKEN_KEY,
  DILLY_OPEN_OVERLAY_KEY,
  stashAuditForReportHandoff,
  setCareerCenterReturnPath,
  minimalAuditFromHistorySummary,
  type AuditHistorySummaryRow,
} from "@/lib/dillyUtils";
import type { AuditV2 } from "@/types/dilly";
import type { ScorePageData } from "@/types/scorePage";
import { readScorePageCache, SCORE_PAGE_CACHE_KEY, scorePayloadLooksEmpty } from "@/types/scorePage";
import {
  BottomNav,
  CareerCenterMinibar,
  CareerCenterTabIcon,
  JobsTabIcon,
  RankTabIcon,
  type MainAppTabKey,
} from "@/components/career-center";
import { ScoreHero } from "@/components/score/ScoreHero";
import { DimensionGrid } from "@/components/score/DimensionGrid";
import { ScoreInsight } from "@/components/score/ScoreInsight";
import { ScoreHistory } from "@/components/score/ScoreHistory";
import { PeerPreview } from "@/components/score/PeerPreview";
import { SCORE_PAGE_VARS } from "@/components/score/scoreTokens";
import { LoadingScreen } from "@/components/ui/loading-screen";

const playfair = Playfair_Display({ weight: ["400"], subsets: ["latin"], display: "swap" });

function normAuditId(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "");
}

function defaultScoreData(): ScorePageData {
  return {
    first_name: "there",
    track: "Humanities",
    school_short: "",
    final_score: 0,
    smart: 0,
    grit: 0,
    build: 0,
    final_percentile: 50,
    weakest_dimension: "grit",
    gap_insight: "Run a resume audit to see your Dilly score.",
    nearest_company: "Top firms",
    nearest_company_bar: 72,
    nearest_company_gap: 72,
    audit_history: [],
    peer_preview: [],
    student_rank: 1,
    peer_count: 0,
    is_free_tier: true,
  };
}

async function tryHydrateScorePageFromAudits(
  token: string,
  subscribed: boolean,
  current: ScorePageData,
): Promise<ScorePageData> {
  if (!scorePayloadLooksEmpty(current)) return current;
  try {
    const h = await fetch(`${API_BASE}/audit/history`, { headers: { Authorization: `Bearer ${token}` } });
    if (!h.ok) return current;
    const j = (await h.json()) as { audits?: unknown[] };
    const audits = Array.isArray(j?.audits) ? j.audits : [];
    const row = audits.find((a: unknown) => {
      if (!a || typeof a !== "object") return false;
      const o = a as Record<string, unknown>;
      const fs = Number(o.final_score);
      if (!Number.isNaN(fs) && fs > 0) return true;
      const sc = o.scores;
      if (sc && typeof sc === "object") {
        const scObj = sc as { smart?: unknown; grit?: unknown; build?: unknown };
        return [scObj.smart, scObj.grit, scObj.build].some((v) => {
          const n = Number(v);
          return !Number.isNaN(n) && n > 0;
        });
      }
      return false;
    }) as AuditHistorySummaryRow | undefined;
    if (!row) return current;
    const minimal = minimalAuditFromHistorySummary(row);
    if (
      minimal.final_score <= 0 &&
      minimal.scores.smart <= 0 &&
      minimal.scores.grit <= 0 &&
      minimal.scores.build <= 0
    ) {
      return current;
    }
    const prof = await fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const displayName = (prof?.name || minimal.candidate_name || "").trim() || "there";
    const first = displayName.split(/\s+/)[0] || "there";
    const track =
      (minimal.detected_track || "").trim() || String(prof?.track || "").trim() || current.track || "Humanities";
    const dims: { key: "smart" | "grit" | "build"; v: number }[] = [
      { key: "smart", v: Math.round(minimal.scores.smart) },
      { key: "grit", v: Math.round(minimal.scores.grit) },
      { key: "build", v: Math.round(minimal.scores.build) },
    ];
    const weakest = dims.reduce((a, b) => (a.v <= b.v ? a : b)).key;
    const fs = Math.round(Number(minimal.final_score) || 0);
    const pp = minimal.peer_percentiles;
    let finalPct = 50;
    if (pp) {
      const tops = (["smart", "grit", "build"] as const).map((k) =>
        Math.max(1, 100 - (Number(pp[k]) || 50)),
      );
      finalPct = Math.min(...tops);
    }
    const hist = audits.slice(0, 12).map((a: unknown) => {
      const o = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
      let dateStr = "";
      if (typeof o.ts === "number") {
        try {
          dateStr = new Date(o.ts * 1000).toISOString().slice(0, 10);
        } catch {
          dateStr = "";
        }
      }
      const aid = o.id;
      const audit_id = aid != null && String(aid).trim() ? String(aid).trim() : null;
      return { score: Math.round(Number(o.final_score) || 0), date: dateStr, audit_id };
    });
    let nearest = current.nearest_company;
    if (Array.isArray(prof?.target_companies) && prof.target_companies.length > 0) {
      nearest = String(prof.target_companies[0]).trim().slice(0, 80) || nearest;
    } else if (typeof prof?.target_school === "string" && prof.target_school.trim()) {
      nearest = prof.target_school.trim().slice(0, 80);
    }
    const wkLabel = weakest.charAt(0).toUpperCase() + weakest.slice(1);
    const wkVal = dims.find((d) => d.key === weakest)!.v;
    const gap_insight = `Your ${wkLabel} is ${wkVal}. Sharpen outcomes and proof in that dimension to improve.`;
    return {
      ...current,
      first_name: first,
      track,
      final_score: fs,
      smart: Math.round(minimal.scores.smart),
      grit: Math.round(minimal.scores.grit),
      build: Math.round(minimal.scores.build),
      final_percentile: finalPct,
      weakest_dimension: weakest,
      gap_insight,
      nearest_company: nearest,
      audit_history: hist.length ? hist : current.audit_history,
      latest_audit_id: minimal.id?.trim() || null,
      audit_ts: typeof row.ts === "number" ? row.ts : null,
      is_free_tier: !subscribed,
    };
  } catch {
    return current;
  }
}

async function fetchLatestAuditForStash(token: string, auditId: string | null | undefined): Promise<void> {
  if (!auditId?.trim()) return;
  try {
    const res = await fetch(`${API_BASE}/audit/history/${encodeURIComponent(auditId.trim())}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    const a = data?.audit as AuditV2 | undefined;
    if (a?.scores) stashAuditForReportHandoff(a);
  } catch {
    /* ignore */
  }
}

async function fetchScorePayload(token: string, subscribed: boolean, auditId?: string | null): Promise<ScorePageData> {
  const id = auditId?.trim() ?? "";
  const url = id
    ? `${API_BASE}/profile/score-page/audit/${encodeURIComponent(id)}`
    : `${API_BASE}/profile/score-page`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("audit-not-found");
    throw new Error("score-page");
  }
  let payload = (await res.json()) as ScorePageData;
  if (!auditId?.trim()) {
    payload = await tryHydrateScorePageFromAudits(token, subscribed, payload);
  }
  return payload;
}

function ScorePageInner() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<{ email: string; subscribed: boolean } | null>(null);
  const [data, setData] = useState<ScorePageData | null>(() => readScorePageCache());
  const [baselineData, setBaselineData] = useState<ScorePageData | null>(() => readScorePageCache());
  const [lookbackLoading, setLookbackLoading] = useState(false);
  const [lookbackError, setLookbackError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) {
      setUser(null);
      setAuthLoading(false);
      return;
    }
    let subscribed = false;
    try {
      const me = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!me.ok) throw new Error("auth");
      const u = await me.json();
      subscribed = !!u?.subscribed;
      setUser({ email: u?.email ?? "", subscribed });
    } catch {
      setUser(null);
      setAuthLoading(false);
      return;
    }

    try {
      const payload = await fetchScorePayload(token, subscribed, null);
      setData(payload);
      setBaselineData(payload);
      setLookbackError(null);
      setLoadError(null);
      try {
        sessionStorage.setItem(
          SCORE_PAGE_CACHE_KEY,
          JSON.stringify({ audit_ts: payload.audit_ts ?? null, payload }),
        );
      } catch {
        /* ignore */
      }
      void fetchLatestAuditForStash(token, payload.latest_audit_id);
    } catch {
      const fromAudits = await tryHydrateScorePageFromAudits(token, subscribed, defaultScoreData());
      if (!scorePayloadLooksEmpty(fromAudits)) {
        setData(fromAudits);
        setBaselineData(fromAudits);
        setLookbackError(null);
        setLoadError(null);
        try {
          sessionStorage.setItem(
            SCORE_PAGE_CACHE_KEY,
            JSON.stringify({ audit_ts: fromAudits.audit_ts ?? null, payload: fromAudits }),
          );
        } catch {
          /* ignore */
        }
        void fetchLatestAuditForStash(token, fromAudits.latest_audit_id);
      } else {
        setLoadError("Could not load your score. Pull to refresh or try again.");
        setData((d) => d ?? defaultScoreData());
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const pickAudit = useCallback(
    async (rawAuditId: string) => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token || !baselineData) return;
      const auditId = String(rawAuditId ?? "").trim();
      if (!auditId) return;
      hapticLight();
      const latestId = String(baselineData.latest_audit_id ?? "").trim();
      if (latestId && normAuditId(auditId) === normAuditId(latestId)) {
        setData(baselineData);
        setLookbackError(null);
        return;
      }
      setLookbackLoading(true);
      setLookbackError(null);
      try {
        const subscribed = user?.subscribed ?? false;
        const payload = await fetchScorePayload(token, subscribed, auditId);
        setData(payload);
        void fetchLatestAuditForStash(token, payload.latest_audit_id);
      } catch (e) {
        const msg =
          e instanceof Error && e.message === "audit-not-found"
            ? "That audit wasn't found."
            : "Couldn't load that audit.";
        setLookbackError(msg);
      } finally {
        setLookbackLoading(false);
      }
    },
    [baselineData, user?.subscribed],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** After SSR (state starts null), restore from session before paint so we don’t flash the zero shell. */
  useLayoutEffect(() => {
    const c = readScorePageCache();
    if (!c || scorePayloadLooksEmpty(c)) return;
    setData((prev) => (prev == null || scorePayloadLooksEmpty(prev) ? c : prev));
    setBaselineData((prev) => (prev == null || scorePayloadLooksEmpty(prev) ? c : prev));
  }, []);

  useEffect(() => {
    setCareerCenterReturnPath("/score");
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.email) router.replace("/");
  }, [authLoading, user?.email, router]);

  const goReport = async () => {
    const id = data?.latest_audit_id?.trim();
    if (!id) return;
    hapticLight();
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) await fetchLatestAuditForStash(token, id);
    router.push(`/audit/${encodeURIComponent(id)}`);
  };

  if (!authLoading && !user?.email) {
    return null;
  }

  const hasCachedScore = data != null && !scorePayloadLooksEmpty(data);
  if (authLoading && !hasCachedScore) {
    return (
      <div
        className="score-page-root min-h-screen w-full max-w-[430px] mx-auto"
        style={{ ...SCORE_PAGE_VARS, background: "var(--bg)" }}
      >
        <LoadingScreen message="Loading…" className="min-h-screen" style={{ background: "var(--bg)" }} />
      </div>
    );
  }

  const d = data ?? defaultScoreData();
  const baseline = baselineData ?? d;
  const isLookback =
    Boolean(baseline.latest_audit_id?.trim()) &&
    Boolean(d.latest_audit_id?.trim()) &&
    normAuditId(d.latest_audit_id) !== normAuditId(baseline.latest_audit_id);

  const lookbackDateLabel =
    d.audit_ts != null
      ? (() => {
          try {
            return new Date(d.audit_ts * 1000).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          } catch {
            return "";
          }
        })()
      : "";

  return (
    <div
      className="score-page-root min-h-screen w-full max-w-[430px] mx-auto pb-40 overflow-x-hidden"
      style={{ ...SCORE_PAGE_VARS, background: "var(--bg)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <header className="sticky top-0 z-20 flex items-center justify-center px-3 h-12 border-b" style={{ borderColor: "var(--b1)", background: "var(--bg)" }}>
        <button
          type="button"
          onClick={() => {
            hapticLight();
            router.back();
          }}
          className="absolute left-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-sm font-medium border-0 bg-transparent"
          style={{ color: "var(--t2)" }}
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="text-[13px] font-semibold" style={{ color: "var(--t1)" }}>
          Your score
        </h1>
      </header>

      <main className="min-w-0">
        {loadError && (
          <p className="px-5 py-3 text-sm" style={{ color: "var(--coral)" }}>
            {loadError}
          </p>
        )}
        {isLookback ? (
          <div
            className="mx-5 mb-3 flex flex-row flex-wrap items-center justify-between gap-2 rounded-[12px] px-3 py-2.5"
            style={{ background: "var(--s2)", border: "1px solid var(--b2)", margin: "0 20px 12px" }}
          >
            <p className="text-[11px] font-medium min-w-0" style={{ color: "var(--t2)" }}>
              Viewing a past audit{lookbackDateLabel ? ` · ${lookbackDateLabel}` : ""}
            </p>
            <button
              type="button"
              onClick={() => {
                hapticLight();
                if (baselineData) {
                  setData(baselineData);
                  setLookbackError(null);
                }
              }}
              className="shrink-0 text-[11px] font-semibold border-0 rounded-lg px-2.5 py-1.5"
              style={{ background: "var(--blue)", color: "#fff" }}
            >
              Current score
            </button>
          </div>
        ) : null}
        {lookbackError ? (
          <p className="px-5 pb-2 text-[11px]" style={{ color: "var(--coral)" }}>
            {lookbackError}
          </p>
        ) : null}
        <ScoreHero
          firstName={d.first_name}
          finalScore={d.final_score}
          track={d.track}
          schoolShort={d.school_short}
          finalPercentile={d.final_percentile}
          nearestCompany={d.nearest_company}
          nearestCompanyBar={d.nearest_company_bar}
          nearestCompanyGap={d.nearest_company_gap}
          playfairClassName={playfair.className}
        />
        <DimensionGrid data={d} />
        <ScoreInsight data={d} />
        <ScoreHistory
          data={d}
          activeAuditId={d.latest_audit_id ?? null}
          onSelectAuditId={(id) => void pickAudit(id)}
          disabled={lookbackLoading}
        />
        {d.peer_preview.length > 0 ? <PeerPreview data={d} /> : null}

        <section className="mx-5 mb-6 space-y-2" style={{ margin: "0 20px 24px" }}>
          <button
            type="button"
            onClick={() => void goReport()}
            disabled={!d.latest_audit_id}
            className="flex items-center justify-between gap-3 w-full min-h-[48px] px-4 py-3 rounded-[12px] text-left text-[13px] font-semibold transition-opacity active:opacity-90 border-0"
            style={{ background: "var(--s2)", color: "var(--t1)" }}
          >
            <span className="flex items-center gap-3 min-w-0">
              <FileText className="h-5 w-5 shrink-0" style={{ color: "var(--blue)" }} aria-hidden />
              <span>View full report</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0" style={{ color: "var(--t3)" }} aria-hidden />
          </button>
          <Link
            href="/?tab=insights"
            className="flex items-center justify-between gap-3 w-full min-h-[48px] px-4 py-3 rounded-[12px] text-left text-[13px] font-semibold transition-opacity active:opacity-90"
            style={{ background: "var(--s2)", color: "var(--t1)" }}
          >
            <span className="flex items-center gap-3 min-w-0">
              <Lightbulb className="h-5 w-5 shrink-0" style={{ color: "var(--green)" }} aria-hidden />
              <span>Insights</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0" style={{ color: "var(--t3)" }} aria-hidden />
          </Link>
        </section>
      </main>

      <BottomNav
        dockTop={
          user?.subscribed ? (
            <CareerCenterMinibar
              docked
              active="score"
              embedded={{
                onScore: () => {
                  hapticLight();
                  router.push("/score");
                },
                onNewAudit: () => {
                  hapticLight();
                  router.push("/?tab=upload");
                },
                onCalendar: () => {
                  hapticLight();
                  router.push("/?tab=calendar");
                },
              }}
            />
          ) : undefined
        }
        activeTab="career"
        voiceOverlayOpen={false}
        onTabSelect={(key: MainAppTabKey) => {
          hapticLight();
          if (key === "center") {
            router.push("/");
            return;
          }
          if (key === "voice") {
            try {
              sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
            } catch {
              /* ignore */
            }
            router.push("/");
            return;
          }
          if (key === "resources") {
            router.push("/?tab=resources");
            return;
          }
          if (key === "rank") {
            const tr = (d.track || "Humanities").trim() || "Humanities";
            router.push(`/leaderboard?track=${encodeURIComponent(tr)}`);
            return;
          }
        }}
        items={[
          {
            key: "center",
            label: "Career Center",
            icon: <CareerCenterTabIcon />,
          },
          { key: "rank", label: "Rank", icon: <RankTabIcon /> },
          {
            key: "voice",
            label: "Dilly AI",
            icon: (
              <svg className="w-[14px] h-[14px] text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
            ),
          },
          { key: "resources", label: "Get Hired", icon: <JobsTabIcon /> },
        ]}
      />
    </div>
  );
}

export default function ScorePage() {
  return (
    <Suspense fallback={null}>
      <ScorePageInner />
    </Suspense>
  );
}
