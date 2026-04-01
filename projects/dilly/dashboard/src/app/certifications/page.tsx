"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_MAX_AGE_MS,
  DILLY_OPEN_OVERLAY_KEY,
  setCareerCenterReturnPath,
} from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import type { AuditV2 } from "@/types/dilly";
import type { CertificationsPageData } from "@/types/certifications";
import { fetchCertificationsFromApi, buildCertificationsPageDataFromAudit } from "@/lib/certificationsPageData";
import { BottomNav, CareerCenterTabIcon, JobsTabIcon, RankTabIcon, type MainAppTabKey } from "@/components/career-center";
import { DEFAULT_VOICE_AVATAR_INDEX, getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import { hapticLight } from "@/lib/haptics";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { CertificationsHero } from "@/components/certifications/CertificationsHero";
import { DillyCommentaryStrip } from "@/components/certifications/DillyCommentaryStrip";
import { ImpactSummaryBar } from "@/components/certifications/ImpactSummaryBar";
import { DillyTopPickBanner } from "@/components/certifications/DillyTopPickBanner";
import { CertCard } from "@/components/certifications/CertCard";

function CertificationsHeader({ onBack }: { onBack: () => void }) {
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
        Certifications
      </h1>
      <span className="shrink-0 w-9" aria-hidden />
    </header>
  );
}

function SkeletonPulse({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="animate-pulse"
      style={{
        background: "var(--s2)",
        animation: "cert-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function CertificationsLoadingSkeleton() {
  return (
    <>
      <style>{`@keyframes cert-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
      <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
        {[0, 1, 2].map((i) => (
          <SkeletonPulse key={i} style={{ height: 72, borderRadius: 16, border: "1px solid var(--b1)" }} />
        ))}
      </div>
    </>
  );
}

function CertificationsPageInner() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<{ email: string; subscribed: boolean; id?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CertificationsPageData | null>(null);
  const [emptyReason, setEmptyReason] = useState<"no_audit" | "no_track" | "no_certs" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    try {
      setCareerCenterReturnPath("/?tab=resources");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("dilly_auth_token") : null;
    if (!token) {
      setUser({ email: "", subscribed: false });
      setAuthLoading(false);
      router.replace("/");
      return;
    }
    try {
      const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(AUTH_USER_CACHE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { email: string; subscribed: boolean; ts: number };
        if (parsed?.email && typeof parsed.ts === "number" && Date.now() - parsed.ts < AUTH_USER_CACHE_MAX_AGE_MS && parsed.subscribed) {
          setUser({ email: parsed.email, subscribed: true });
          setAuthLoading(false);
        }
      }
    } catch {
      /* ignore */
    }

    dilly.fetch("/auth/me")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((d) => {
        const u = { email: d?.email ?? "", subscribed: !!d?.subscribed, id: typeof d?.id === "string" ? d.id : undefined };
        setUser(u);
        if (!u.subscribed) router.replace("/");
      })
      .catch(() => {
        setUser({ email: "", subscribed: false });
        router.replace("/");
      })
      .finally(() => setAuthLoading(false));
  }, [router]);

  useEffect(() => {
    if (authLoading || !user?.subscribed) return;
    const uid = (user.id || user.email || "").trim();
    if (!uid) {
      setLoading(false);
      setEmptyReason("no_audit");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setEmptyReason(null);

    (async () => {
      try {
        const token = typeof localStorage !== "undefined" ? localStorage.getItem("dilly_auth_token") : null;
        const apiData = await fetchCertificationsFromApi(uid, token ?? "");
        if (cancelled) return;
        if (apiData) {
          setData(apiData);
          return;
        }

        const histRes = await dilly.fetch("/audit/history");
        const histJson = histRes.ok ? await histRes.json() : null;
        const list = Array.isArray(histJson?.audits) ? histJson.audits : Array.isArray(histJson) ? histJson : [];
        const sorted = [...list]
          .filter((a: { ts?: number }) => typeof a?.ts === "number")
          .sort((a: { ts: number }, b: { ts: number }) => b.ts - a.ts);
        const latestId = sorted[0]?.id?.trim();
        if (!latestId) {
          setData(null);
          setEmptyReason("no_audit");
          return;
        }
        const fullRes = await dilly.fetch(`/audit/history/${encodeURIComponent(latestId)}`);
        if (!fullRes.ok) {
          setData(null);
          setEmptyReason("no_audit");
          return;
        }
        const fullJson = await fullRes.json();
        const raw = fullJson?.audit as AuditV2 | undefined;
        const audit = raw ? { ...raw, id: (raw.id && String(raw.id).trim()) || latestId } : undefined;
        if (!audit?.scores) {
          setData(null);
          setEmptyReason("no_audit");
          return;
        }
        const built = buildCertificationsPageDataFromAudit(audit, uid);
        if (!built) {
          setData(null);
          setEmptyReason((audit.detected_track || "").trim() ? "no_certs" : "no_track");
          return;
        }
        setData(built);
      } catch {
        setData(null);
        setEmptyReason("no_audit");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.subscribed, user?.email, user?.id]);

  const onBack = useCallback(() => {
    router.push("/?tab=resources");
  }, [router]);

  const toggleCard = useCallback((id: string) => {
    hapticLight();
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (next) {
        setTimeout(() => {
          cardRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
      }
      return next;
    });
  }, []);

  const maxPts = data ? Math.max(0, ...data.certifications.map((c) => c.estimated_build_pts)) : 0;
  const hasTopPick = data?.certifications.some((c) => c.dilly_pick) ?? false;

  if (authLoading) {
    return <LoadingScreen />;
  }
  if (!user?.subscribed) {
    return (
      <div
        className="min-h-screen w-full flex flex-col items-center justify-center px-6"
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)", color: "var(--t3)" }}
      >
        <p className="text-sm text-center">Taking you back…</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col pb-[120px]"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)", color: "var(--t1)" }}
    >
      <CertificationsHeader onBack={onBack} />

      <div
        className="w-full max-w-[390px] mx-auto flex flex-col flex-1 min-w-0"
        style={{ padding: "0 16px 40px", display: "flex", flexDirection: "column", gap: 0 }}
      >
        {loading ? (
          <CertificationsLoadingSkeleton />
        ) : !data ? (
          <div className="rounded-[16px] p-6 text-center mt-5" style={{ background: "var(--s2)", border: "1px solid var(--b1)" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)", marginBottom: 8 }}>
              {emptyReason === "no_track"
                ? "We need your track"
                : emptyReason === "no_certs"
                  ? "Nothing curated yet"
                  : "Nothing here yet"}
            </p>
            <p style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.55, marginBottom: 16 }}>
              {emptyReason === "no_track"
                ? "We couldn't detect a track from your profile, so certifications can't be matched yet."
                : emptyReason === "no_certs"
                  ? "We don't have hub certifications for your track yet. Check back later."
                  : "This page shows picks when your profile includes resume scores and a track."}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="rounded-[14px] border border-[var(--b1)] px-5 py-3 font-semibold w-full min-h-[48px]"
              style={{ background: "var(--s2)", color: "var(--t1)" }}
            >
              Back
            </button>
          </div>
        ) : (
          <>
            <CertificationsHero track={data.track} />
            <DillyCommentaryStrip commentary={data.dilly_commentary} />
            <ImpactSummaryBar maxPts={maxPts} />
            {hasTopPick ? <DillyTopPickBanner reason={data.dilly_top_pick_reason} /> : null}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 0 10px",
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--t3)" }}>
                Curated for {data.track}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)" }}>{data.total_certs} certs</span>
            </div>
            <div className="flex flex-col" style={{ gap: 8 }}>
              {data.certifications.map((cert) => (
                <CertCard
                  key={cert.id}
                  ref={(el) => {
                    cardRefs.current[cert.id] = el;
                  }}
                  cert={cert}
                  expanded={expandedId === cert.id}
                  currentBuild={data.current_build_score}
                  onToggle={() => toggleCard(cert.id)}
                />
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: 11, fontWeight: 400, color: "var(--t3)", marginTop: 4, padding: "0 10px" }}>
              Curated by Dilly. Score impact is estimated.
            </p>
          </>
        )}
      </div>

      <BottomNav
        activeTab="resources"
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
            router.push("/?tab=center");
            return;
          }
          if (key === "rank") {
            router.push("/leaderboard");
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

export default function CertificationsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CertificationsPageInner />
    </Suspense>
  );
}
