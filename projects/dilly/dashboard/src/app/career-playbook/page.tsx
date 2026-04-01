"use client";

import type { CSSProperties } from "react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_MAX_AGE_MS,
  DILLY_OPEN_OVERLAY_KEY,
  DILLY_PLAYBOOK_VOICE_PROMPT_KEY,
  setCareerCenterReturnPath,
} from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import { getEffectiveCohortLabel, getPlaybookForTrack, getTrackTips } from "@/lib/trackDefinitions";
import type { AppProfile, AuditV2, CareerPlaybookDeepDive, CareerPlaybookPayload, CareerPlaybookSignal } from "@/types/dilly";
import { BottomNav, CareerCenterTabIcon, JobsTabIcon, RankTabIcon, type MainAppTabKey } from "@/components/career-center";
import { DEFAULT_VOICE_AVATAR_INDEX, getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import { hapticLight } from "@/lib/haptics";
import { LoadingScreen } from "@/components/ui/loading-screen";

function formatPlaybookHttpError(status: number, bodyText: string): string {
  if (status === 404) {
    return "We couldn't reach the playbook service. It may not be deployed on this API yet—redeploy the backend, or ask your host to expose POST /audit/career-playbook. You can still use the Job search checklist on Get Hired.";
  }
  const trimmed = bodyText.trim().slice(0, 400);
  if (!trimmed) return "Could not build your playbook. Try again.";
  try {
    const j = JSON.parse(trimmed) as { detail?: unknown };
    if (j?.detail != null) {
      return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    }
  } catch {
    /* ignore */
  }
  return trimmed;
}

/**
 * When both POST /audit/career-playbook and POST /career-playbook return 404 (old API / wrong host),
 * show the same shape as the backend `_career_playbook_fallback` plus top audit recommendations as signals.
 */
function buildClientPlaybookWhenApi404(
  effectiveTrack: string,
  headline: string,
  bullets: string[],
  trackTips: string[],
  audit: AuditV2,
): CareerPlaybookPayload {
  const dives: CareerPlaybookDeepDive[] = [];
  for (const b of bullets.slice(0, 8)) {
    const t = String(b ?? "").trim();
    if (!t) continue;
    dives.push({
      theme: t.slice(0, 220),
      for_you:
        "Personalized coaching for this theme needs the AI service. Use your latest audit recommendations and ask Dilly in chat to apply this to your bullets.",
      this_week: "Spend 25 minutes improving one resume line that supports this theme.",
    });
  }
  if (!dives.length) {
    dives.push({
      theme: "Sharpen your story",
      for_you: "Tie each experience to an outcome recruiters in your track can verify.",
      this_week: "Rewrite your top bullet with a metric or scope (team size, dollars, percent, users).",
    });
  }
  const gaps = trackTips
    .filter((x) => typeof x === "string" && x.trim())
    .slice(0, 8)
    .map((x) => x.slice(0, 240));

  const resume_signals: CareerPlaybookSignal[] = [];
  const recs = Array.isArray(audit.recommendations) ? audit.recommendations : [];
  for (const r of recs.slice(0, 4)) {
    const title = (r?.title ?? "").trim();
    if (!title) continue;
    resume_signals.push({
      signal: title.slice(0, 400),
      from_resume: (r.current_line ?? "").slice(0, 600),
      why: (r.diagnosis || r.action || "From your latest audit.").slice(0, 900),
    });
  }

  const trackLabel = effectiveTrack || "track";
  return {
    opening: `We could not generate your fully personalized playbook brief right now. Below is your ${trackLabel} framework so you still have a roadmap.`,
    cohort_lens:
      headline ||
      "Recruiters in your track reward proof, not adjectives. Every line should answer what you did, how big it was, and what changed because of you.",
    resume_signals,
    deep_dive: dives.slice(0, 8),
    gaps_to_close: gaps,
    closer: "Run a fresh audit after edits, then open this page again for a deeper pass.",
    fallback: true,
  };
}

function buildAuditForPlaybook(audit: AuditV2): Record<string, unknown> {
  const text = (audit.structured_text || audit.resume_text || "").slice(0, 7500);
  return {
    candidate_name: audit.candidate_name,
    major: audit.major,
    detected_track: audit.detected_track,
    scores: audit.scores,
    final_score: audit.final_score,
    audit_findings: audit.audit_findings,
    evidence: audit.evidence,
    evidence_quotes: audit.evidence_quotes ?? undefined,
    recommendations: audit.recommendations,
    dilly_take: audit.dilly_take,
    peer_percentiles: audit.peer_percentiles,
    application_target: audit.application_target,
    structured_text: text,
    strongest_signal_sentence: audit.strongest_signal_sentence,
  };
}

function CareerPlaybookHeader({ onBack, trackLabel }: { onBack: () => void; trackLabel: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center w-full max-w-[390px] mx-auto px-4 py-3 gap-2" style={{ background: "var(--bg)" }}>
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
      <div className="flex-1 min-w-0 text-center">
        <h1 className="font-cinzel text-[15px] font-semibold truncate" style={{ color: "var(--te-gold)", letterSpacing: "0.04em" }}>
          Your playbook
        </h1>
        <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--t3)" }}>
          {trackLabel}
        </p>
      </div>
      <span className="shrink-0 w-9" aria-hidden />
    </header>
  );
}

function CareerPlaybookInner() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<{ email: string; subscribed: boolean; id?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<CareerPlaybookPayload | null>(null);
  const [trackLabel, setTrackLabel] = useState("");

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

  const loadPlaybook = useCallback(async () => {
    if (!user?.subscribed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const [profRes, histRes] = await Promise.all([
        dilly.fetch("/profile"),
        dilly.fetch("/audit/history"),
      ]);
      const profile = profRes.ok ? ((await profRes.json()) as AppProfile & Record<string, unknown>) : {};
      const histJson = histRes.ok ? await histRes.json() : null;
      const list = Array.isArray(histJson?.audits) ? histJson.audits : Array.isArray(histJson) ? histJson : [];
      const sorted = [...list]
        .filter((a: { ts?: number }) => typeof a?.ts === "number")
        .sort((a: { ts: number }, b: { ts: number }) => b.ts - a.ts);
      const latestId = String(sorted[0]?.id ?? "").trim();
      if (!latestId) {
        setErr("We need a resume audit first. Run one from Resume Review, then come back.");
        setLoading(false);
        return;
      }
      const fullRes = await dilly.fetch(`/audit/history/${encodeURIComponent(latestId)}`);
      if (!fullRes.ok) {
        setErr("Could not load your latest audit.");
        setLoading(false);
        return;
      }
      const fullJson = await fullRes.json();
      const raw = fullJson?.audit as AuditV2 | undefined;
      if (!raw?.scores) {
        setErr("We need a resume audit first.");
        setLoading(false);
        return;
      }
      const audit: AuditV2 = { ...raw, id: (raw.id && String(raw.id).trim()) || latestId };
      const eff = getEffectiveCohortLabel(audit.detected_track, profile?.track ?? null) || audit.detected_track || "Your track";
      setTrackLabel(eff);
      const playbook = getPlaybookForTrack(eff);
      const tips = getTrackTips(eff);
      const body = {
        audit: buildAuditForPlaybook(audit),
        profile: {
          name: profile?.name,
          major: profile?.major ?? audit.major,
          majors: profile?.majors,
          career_goal: profile?.career_goal,
          goals: profile?.goals,
          target_school: profile?.target_school,
        },
        playbook_baseline: { headline: playbook.headline, bullets: playbook.bullets },
        track_tips: tips,
        effective_track: eff,
      };
      /** Prefer /audit/career-playbook so gateways that only forward /audit/* still work. */
      let playRes = await dilly.post("/audit/career-playbook", body);
      if (playRes.status === 404) {
        playRes = await dilly.post("/career-playbook", body);
      }
      if (!playRes.ok) {
        if (playRes.status === 404) {
          setData(buildClientPlaybookWhenApi404(eff, playbook.headline, playbook.bullets, tips, audit));
          return;
        }
        const t = await playRes.text().catch(() => "");
        setErr(formatPlaybookHttpError(playRes.status, t));
        return;
      }
      let payload: CareerPlaybookPayload;
      try {
        payload = (await playRes.json()) as CareerPlaybookPayload;
      } catch {
        setErr("Could not read playbook response. Try again.");
        return;
      }
      if (!payload?.opening) {
        setErr("Unexpected response. Try again.");
        return;
      }
      setData(payload);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") setErr("That took too long. Try again.");
      else setErr("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }, [user?.subscribed]);

  useEffect(() => {
    if (authLoading || !user?.subscribed) return;
    void loadPlaybook();
  }, [authLoading, user?.subscribed, loadPlaybook]);

  const onBack = useCallback(() => {
    router.push("/?tab=resources");
  }, [router]);

  const openDilly = useCallback(() => {
    hapticLight();
    try {
      sessionStorage.setItem(
        DILLY_PLAYBOOK_VOICE_PROMPT_KEY,
        'I just read my personalized playbook. Help me turn the top two "this week" actions into specific resume edits and one concrete outreach step.',
      );
      sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
    } catch {
      /* ignore */
    }
    router.push("/?tab=center");
  }, [router]);

  /** Subscribed-only: never spin forever on null user after auth (redirect in flight). */
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

  const cardBase = "rounded-[18px] p-4 min-w-0 border";
  const cardStyle: CSSProperties = { background: "var(--s2)", borderColor: "var(--b1)" };

  return (
    <div
      className="min-h-screen w-full flex flex-col pb-[120px]"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)", color: "var(--t1)" }}
    >
      <CareerPlaybookHeader onBack={onBack} trackLabel={trackLabel || "…"} />

      <div className="w-full max-w-[390px] mx-auto flex flex-col flex-1 min-w-0 px-4 pb-8 gap-4">
        {loading ? (
          <div className="mt-6 space-y-3">
            <div className="h-24 rounded-[18px] animate-pulse" style={{ background: "var(--s2)" }} />
            <div className="h-40 rounded-[18px] animate-pulse" style={{ background: "var(--s2)" }} />
            <div className="h-32 rounded-[18px] animate-pulse" style={{ background: "var(--s2)" }} />
          </div>
        ) : err ? (
          <div className="mt-6 rounded-[18px] p-5 text-center border" style={cardStyle}>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--t1)" }}>
              Playbook unavailable
            </p>
            <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--t2)" }}>
              {err}
            </p>
            <button
              type="button"
              onClick={() => void loadPlaybook()}
              className="w-full min-h-[44px] rounded-xl font-semibold text-sm"
              style={{ background: "var(--s3)", color: "var(--t1)", border: "1px solid var(--b2)" }}
            >
              Try again
            </button>
            <button type="button" onClick={onBack} className="w-full mt-2 min-h-[44px] rounded-xl text-sm" style={{ color: "var(--t3)" }}>
              Back to Get Hired
            </button>
          </div>
        ) : data ? (
          <>
            {data.fallback ? (
              <p className="text-[11px] mt-2 px-1" style={{ color: "var(--t3)" }}>
                Brief mode: full personalization will load when the coach is available.
              </p>
            ) : null}
            <section className={`${cardBase} mt-2`} style={{ ...cardStyle, borderLeft: "4px solid var(--te-gold)" }}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--t2)" }}>
                {data.opening}
              </p>
            </section>
            <section className={cardBase} style={cardStyle}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--te-gold)" }}>
                How recruiters read your cohort
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--t2)" }}>
                {data.cohort_lens}
              </p>
            </section>
            {data.resume_signals?.length ? (
              <section className={cardBase} style={cardStyle}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--te-gold)" }}>
                  Signals in your materials
                </p>
                <ul className="space-y-3 list-none p-0 m-0">
                  {data.resume_signals.map((s, i) => (
                    <li key={i} className="border-t first:border-t-0 first:pt-0 pt-3" style={{ borderColor: "var(--b1)" }}>
                      <p className="text-[13px] font-semibold" style={{ color: "var(--t1)" }}>
                        {s.signal}
                      </p>
                      {s.from_resume ? (
                        <p
                          className="text-xs mt-1.5 pl-3 border-l-2 italic leading-relaxed"
                          style={{ borderColor: "var(--te-gold)", color: "var(--t3)" }}
                        >
                          {s.from_resume}
                        </p>
                      ) : null}
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--t2)" }}>
                        {s.why}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className={cardBase} style={cardStyle}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--te-gold)" }}>
                Your playbook, expanded
              </p>
              <ul className="space-y-4 list-none p-0 m-0">
                {(data.deep_dive ?? []).map((d, i) => (
                  <li key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <p className="text-[13px] font-semibold mb-2" style={{ color: "var(--t1)" }}>
                      {d.theme}
                    </p>
                    {d.for_you ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--t2)" }}>
                        {d.for_you}
                      </p>
                    ) : null}
                    {d.this_week ? (
                      <p className="text-xs mt-2 font-medium leading-snug" style={{ color: "var(--te-gold)" }}>
                        This week: {d.this_week}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
            {data.gaps_to_close?.length ? (
              <section className={cardBase} style={cardStyle}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--coral)" }}>
                  Gaps to close
                </p>
                <ul className="space-y-2 list-none p-0 m-0">
                  {data.gaps_to_close.map((g, i) => (
                    <li key={i} className="text-sm flex gap-2 leading-snug" style={{ color: "var(--t2)" }}>
                      <span style={{ color: "var(--t3)" }}>•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className={cardBase} style={{ ...cardStyle, borderLeft: "4px solid var(--indigo)" }}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--t2)" }}>
                {data.closer}
              </p>
              <button
                type="button"
                onClick={openDilly}
                className="mt-4 w-full min-h-[48px] rounded-xl font-semibold text-sm"
                style={{ background: "var(--idim)", color: "var(--indigo)", border: "1px solid rgba(94,92,230,0.35)" }}
              >
                Talk to Dilly about this
              </button>
            </section>
            <p className="text-[10px] text-center px-2 pb-2" style={{ color: "var(--t3)" }}>
              Built from your latest audit and profile. Re-run an audit after big resume changes, then open this page again.
            </p>
          </>
        ) : null}
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
          {
            key: "center",
            label: "Career Center",
            icon: <CareerCenterTabIcon />,
          },
          { key: "rank", label: "Rank", icon: <RankTabIcon /> },
          {
            key: "voice",
            label: "Dilly AI",
            icon:
              getVoiceAvatarUrl(DEFAULT_VOICE_AVATAR_INDEX) ? (
                <img
                  src={getVoiceAvatarUrl(DEFAULT_VOICE_AVATAR_INDEX)!}
                  alt=""
                  className="w-[14px] h-[14px] object-contain"
                  style={{ filter: "brightness(1.15) contrast(1.1)" }}
                />
              ) : (
                <span className="w-[14px] h-[14px] text-white" aria-hidden>
                  ✦
                </span>
              ),
          },
          { key: "resources", label: "Get Hired", icon: <JobsTabIcon /> },
        ]}
      />
    </div>
  );
}

export default function CareerPlaybookPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CareerPlaybookInner />
    </Suspense>
  );
}
