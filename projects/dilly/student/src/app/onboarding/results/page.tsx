"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { patchProfile, getToken } from "@/lib/auth";

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3000";
import DillyAvatar from "@/components/shared/DillyAvatar";

// ── Types ─────────────────────────────────────────────────────────────────────

// Mirrors AuditResponseV2 from schemas.py
interface AuditResult {
  final_score?:      number;
  scores?:           { smart?: number; grit?: number; build?: number };
  detected_track?:   string;
  major?:            string;
  dilly_take?:       string;
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  candidate_name?:   string;
  error?:            boolean;
}

// ── Track config ──────────────────────────────────────────────────────────────

const TRACK_CFG: Record<string, { bar: number; gapDim: string; company: string }> = {
  Tech:         { bar: 75, gapDim: "Build",  company: "Google"        },
  Finance:      { bar: 80, gapDim: "Grit",   company: "Goldman"       },
  "Pre-Health": { bar: 85, gapDim: "Smart",  company: "top schools"   },
  "Pre-Law":    { bar: 85, gapDim: "Smart",  company: "top schools"   },
  General:      { bar: 75, gapDim: "",        company: "top employers" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcPercentile(score: number): number {
  if (score >= 90) return 5;
  if (score >= 80) return 15;
  if (score >= 70) return 30;
  if (score >= 60) return 50;
  return 65;
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--green)";
  if (score >= 55) return "var(--amber)";
  return "var(--coral)";
}

function fmtPts(n: number): string {
  return n === 1 ? "1 point" : `${n} points`;
}

// ── RAF count-up hook ─────────────────────────────────────────────────────────

function useCountUp(target: number, duration: number, delay: number, go: boolean): number {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!go || target === 0) return;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const t     = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        setVal(Math.round(eased * target));
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay, go]);

  return val;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function WarnIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
      <path d="M6 2L10.5 10H1.5L6 2Z" stroke="var(--gold)" strokeWidth="1.3" strokeLinejoin="round" />
      <line x1="6" y1="5.5" x2="6" y2="7.5" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="6" cy="8.8" r="0.5" fill="var(--gold)" />
    </svg>
  );
}

function CheckSmIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="5" width="8" height="6" rx="1.5" stroke="var(--indigo)" strokeWidth="1.2" />
      <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="var(--indigo)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const router = useRouter();

  const [firstName,   setFirstName]   = useState("");
  const [track,       setTrack]       = useState("");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isError,     setIsError]     = useState(false);
  const [barFill,     setBarFill]     = useState(0);
  const [showCallout, setShowCallout] = useState(false);
  const [showTease,   setShowTease]   = useState(false);
  const [showButton,  setShowButton]  = useState(false);
  const [completing,  setCompleting]  = useState(false);

  // ── Mount ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }

    const name = sessionStorage.getItem("dilly_onboarding_name") || "";
    const t    = sessionStorage.getItem("dilly_onboarding_track") || "";
    setFirstName(name.trim().split(/\s+/)[0] || "");
    setTrack(t);

    // Parse audit result
    const raw = sessionStorage.getItem("dilly_audit_result");
    console.log("[results] raw audit result:", raw);

    let result: AuditResult | null = null;
    let err = false;
    if (!raw) {
      err = true;
    } else {
      try {
        result = JSON.parse(raw) as AuditResult;
        console.log("[results] parsed:", JSON.stringify({
          final_score:    result.final_score,
          scores:         result.scores,
          detected_track: result.detected_track,
          dilly_take:     result.dilly_take?.slice(0, 80),
          error:          result.error,
        }, null, 2));
        // Treat as error if: explicit error flag, no final_score at all, or API error shape
        if (result.error || result.final_score === undefined || (result as Record<string, unknown>).detail) err = true;
      } catch {
        err = true;
        console.log("[results] JSON.parse failed");
      }
    }
    setAuditResult(result);
    setIsError(err);

    const finalScore = Math.round(result?.final_score ?? 0);
    console.log("[results] finalScore for bar:", finalScore, "isError:", err);

    const t1 = setTimeout(() => setBarFill(finalScore), 400);
    const t2 = setTimeout(() => setShowCallout(true),   1800);
    const t3 = setTimeout(() => setShowTease(true),     2100);
    const t4 = setTimeout(() => setShowButton(true),    2400);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [router]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const finalScore = Math.round(auditResult?.final_score ?? 0);
  const smartScore = Math.round(auditResult?.scores?.smart ?? 0);
  const gritScore  = Math.round(auditResult?.scores?.grit  ?? 0);
  const buildScore = Math.round(auditResult?.scores?.build ?? 0);

  // peer_percentiles has keys smart/grit/build — no "overall". Derive from final_score.
  const percentile     = calcPercentile(finalScore);
  const resolvedTrack  = (auditResult?.detected_track || track || "General") as string;
  const cfg            = TRACK_CFG[resolvedTrack] ?? TRACK_CFG.General;

  const dims = [
    { name: "Smart", score: smartScore },
    { name: "Grit",  score: gritScore  },
    { name: "Build", score: buildScore },
  ];
  const weakest     = dims.reduce((a, b) => (a.score <= b.score ? a : b));
  const gapDimLabel = cfg.gapDim || weakest.name;
  const pointsAway  = Math.max(0, cfg.bar - finalScore);
  const aboveBar    = finalScore >= cfg.bar;

  const dillyTake = auditResult?.dilly_take
    || (isError
      ? "Upload a PDF resume and I'll tell you exactly what's holding you back."
      : `I know exactly what's keeping your ${weakest.name} at ${weakest.score} — and it's a 10-minute fix on two bullets.`);

  // ── Count-ups — go=true as soon as we have a non-error result ─────────────
  // Do NOT gate on finalScore > 0: if score is legitimately low the gate
  // would block the animation. Gate on isError only.

  const go       = !isError && auditResult !== null;
  const scoreVal = useCountUp(finalScore, 1200, 400, go);
  const smartVal = useCountUp(smartScore, 700,  400, go);
  const gritVal  = useCountUp(gritScore,  700,  600, go);
  const buildVal = useCountUp(buildScore, 700,  800, go);

  const dimVals   = [smartVal, gritVal, buildVal];
  const dimColors = ["var(--blue)", "var(--gold)", "var(--green)"];

  // ── CTA ────────────────────────────────────────────────────────────────────

  async function handleEnter() {
    if (completing) return;
    setCompleting(true);
    try {
      await patchProfile({ onboarding_complete: true });
    } catch {
      // Non-blocking — proceed regardless
    }
    sessionStorage.removeItem("dilly_audit_result");
    // Pass token in URL — localStorage is origin-scoped so port 3001 and 3000 don't share it.
    const token = getToken();
    window.location.href = token
      ? `${DASHBOARD_URL}/?token=${encodeURIComponent(token)}`
      : DASHBOARD_URL;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", position: "relative", overflowY: "auto" }}>

      {/* Radial gold glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "30%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "260px", height: "260px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative", zIndex: 1,
          maxWidth: "430px", margin: "0 auto",
          display: "flex", flexDirection: "column",
          minHeight: "100dvh",
          padding: "44px 22px 24px",
        }}
      >
        {/* Eyebrow */}
        <p style={{
          fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.14em", color: "var(--gold)", marginBottom: "4px",
        }}>
          {firstName ? `${firstName}'s Dilly score` : "Your Dilly score"}
        </p>

        {/* Title */}
        <h1
          className="font-playfair"
          style={{
            fontSize: "20px", fontWeight: 700, color: "var(--t1)",
            lineHeight: 1.2, marginBottom: "14px",
          }}
        >
          {firstName ? `${firstName}, here's where you stand.` : "Here's where you stand."}
        </h1>

        {/* ── Score card ───────────────────────────────────────────────────── */}
        <div style={{
          background: "var(--s2)", borderRadius: "15px",
          padding: "13px", marginBottom: "8px",
          border: "1px solid var(--b1)",
        }}>
          <p style={{
            fontSize: "8px", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.10em", color: "var(--t3)", marginBottom: "7px",
          }}>
            Career readiness · {resolvedTrack} track
          </p>

          {/* Score number */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", marginBottom: "4px" }}>
            <span style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: "46px", fontWeight: 300,
              letterSpacing: "-0.05em", lineHeight: 1,
              color: isError ? "var(--t3)" : scoreColor(finalScore),
            }}>
              {isError ? "—" : scoreVal}
            </span>
            <span style={{ fontSize: "14px", fontWeight: 300, color: "var(--t3)", paddingBottom: "5px" }}>
              /100
            </span>
          </div>

          {/* Percentile */}
          <p style={{
            fontSize: "11px", fontWeight: 700,
            color: isError ? "var(--t3)" : finalScore >= 70 ? "var(--green)" : "var(--amber)",
            marginBottom: "7px",
          }}>
            {isError ? "Score unavailable" : `Top ${percentile}% ${resolvedTrack} · UTampa`}
          </p>

          {/* Progress bar */}
          <div style={{
            height: "3px", background: "rgba(255,255,255,0.06)",
            borderRadius: "999px", overflow: "hidden", marginBottom: "9px",
          }}>
            <div style={{
              height: "100%", background: "var(--gold)",
              borderRadius: "999px",
              width: `${barFill}%`,
              transition: "width 800ms ease-out",
            }} />
          </div>

          {/* Dimension tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "5px" }}>
            {["Smart", "Grit", "Build"].map((name, i) => (
              <div key={name} style={{
                background: "var(--s3)", borderRadius: "8px",
                padding: "6px 4px", textAlign: "center",
              }}>
                <p style={{
                  fontSize: "15px", fontWeight: 300,
                  color: isError ? "var(--t3)" : dimColors[i],
                  lineHeight: 1, marginBottom: "3px",
                }}>
                  {isError ? "—" : dimVals[i]}
                </p>
                <p style={{
                  fontSize: "7px", fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.06em", color: "var(--t3)",
                }}>
                  {name}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Gap callout ──────────────────────────────────────────────────── */}
        <div style={{
          opacity: showCallout ? 1 : 0,
          transition: "opacity 300ms ease-out",
          marginBottom: "8px",
        }}>
          {isError ? (
            <div style={{
              background: "var(--s2)", border: "1px solid var(--b1)",
              borderRadius: "11px", padding: "9px 11px",
            }}>
              <p style={{ fontSize: "11px", color: "var(--t2)", lineHeight: 1.55 }}>
                Dilly couldn&apos;t score your resume fully this time. Upload a cleaner PDF and run another audit.
              </p>
            </div>
          ) : aboveBar ? (
            <div style={{
              background: "var(--gdim)", border: "1px solid var(--gbdr)",
              borderRadius: "11px", padding: "9px 11px",
              display: "flex", gap: "7px",
            }}>
              <div style={{
                width: "18px", height: "18px", borderRadius: "5px",
                background: "var(--gbdr)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: "1px",
              }}>
                <CheckSmIcon />
              </div>
              <p style={{ fontSize: "10px", color: "var(--green)", lineHeight: 1.5, fontWeight: 500 }}>
                You&apos;re above the recruiter bar.{" "}
                <strong>Top {percentile}%</strong> puts you in elite territory.
              </p>
            </div>
          ) : (
            <div style={{
              background: "var(--golddim)", border: "1px solid var(--goldbdr)",
              borderRadius: "11px", padding: "9px 11px",
              display: "flex", gap: "7px",
            }}>
              <div style={{
                width: "18px", height: "18px", borderRadius: "5px",
                background: "var(--goldbdr)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: "1px",
              }}>
                <WarnIcon />
              </div>
              <p style={{ fontSize: "10px", color: "var(--gold)", lineHeight: 1.5, fontWeight: 500 }}>
                Top 25% is the recruiter filter. You&apos;re{" "}
                <strong>{fmtPts(pointsAway)} away</strong>.{" "}
                <strong>{gapDimLabel}</strong> is the gap.
              </p>
            </div>
          )}
        </div>

        {/* ── Dilly tease card ─────────────────────────────────────────────── */}
        <div style={{
          opacity: showTease ? 1 : 0,
          transition: "opacity 300ms ease-out",
          marginBottom: "14px",
        }}>
          <div style={{
            background: "var(--s2)", border: "1px solid var(--bbdr)",
            borderRadius: "11px", padding: "9px 11px",
            display: "flex", gap: "8px",
          }}>
            {/* Avatar */}
            <div style={{
              width: "20px", height: "20px", borderRadius: "50%",
              background: "var(--bdim)", border: "1px solid var(--bbdr)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: "1px", overflow: "hidden",
            }}>
              <DillyAvatar size={20} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: "8px", fontWeight: 700, color: "var(--blue)",
                textTransform: "uppercase", letterSpacing: "0.07em",
                marginBottom: "2px",
              }}>
                DILLY
              </p>

              {/* Blurred tease */}
              <p style={{
                fontSize: "10px", color: "var(--t2)", lineHeight: 1.55,
                filter: "blur(1.8px)",
                userSelect: "none", pointerEvents: "none",
              }}>
                {dillyTake}
              </p>

              {/* Lock row */}
              <div
                onClick={() => router.push("/")}
                style={{
                  marginTop: "2px",
                  display: "flex", alignItems: "center", gap: "4px",
                  cursor: "pointer",
                }}
              >
                <LockIcon />
                <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--indigo)" }}>
                  Unlock Dilly to hear this
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <div style={{ opacity: showButton ? 1 : 0, transition: "opacity 300ms ease-out" }}>
          <button
            onClick={handleEnter}
            disabled={completing}
            style={{
              width: "100%",
              background: "var(--green)", color: "#051A0B",
              border: "none", borderRadius: "13px", padding: "13px",
              fontSize: "13px", fontWeight: 700,
              cursor: completing ? "default" : "pointer",
              opacity: completing ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {completing ? "Saving…" : "Enter my career center →"}
          </button>
        </div>
      </div>
    </div>
  );
}
