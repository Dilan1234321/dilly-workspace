"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";

const BAR_HEIGHTS = [18, 30, 50, 72, 100, 85, 60, 38, 20, 10];
const BAR_COLORS = [
  "var(--s3)", "var(--s3)",
  "rgba(201,168,76,0.25)",
  "rgba(201,168,76,0.35)",
  "var(--gold)",
  "rgba(201,168,76,0.35)",
  "rgba(201,168,76,0.25)",
  "var(--s3)", "var(--s3)", "var(--s3)",
];

function StarIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--green)">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export default function YouAreInPage() {
  const router = useRouter();
  const [mounted,    setMounted]    = useState(false);
  const [barsReady,  setBarsReady]  = useState(false);
  const [firstName,  setFirstName]  = useState("");
  const [cohort,     setCohort]     = useState("");
  const [cohortLabel, setCohortLabel] = useState("");
  const [goalLabel,  setGoalLabel]  = useState("");

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }

    const name   = sessionStorage.getItem("dilly_onboarding_name") || "";
    const c      = sessionStorage.getItem("dilly_onboarding_cohort") || sessionStorage.getItem("dilly_onboarding_track") || "";
    const label  = sessionStorage.getItem("dilly_onboarding_target_label") || "";
    const fn     = name.trim().split(/\s+/)[0] || "";

    if (!fn || !c) { router.replace("/onboarding/profile"); return; }

    setFirstName(fn);
    setCohort(c);

    // Pre-professional → show "Pre-Med track" / "Pre-Law track"; others → "X cohort"
    const preProfLabels: Record<string, string> = {
      "Pre-Health": "Pre-Health track",
      "Pre-Law": "Pre-Law track",
    };
    setCohortLabel(preProfLabels[c] ?? `${c} cohort`);

    setGoalLabel(label || "Internship · Summer 2026");

    requestAnimationFrame(() => {
      setMounted(true);
      setTimeout(() => setBarsReady(true), 80);
    });
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 22px 28px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Radial green glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "35%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "260px", height: "260px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(52,199,89,0.07) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      {/* Badge tile */}
      <div
        style={{
          width: "60px", height: "60px", borderRadius: "18px",
          background: "var(--gdim)", border: "1px solid var(--gbdr)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "14px",
          transform: mounted ? "scale(1)" : "scale(0.7)",
          opacity: mounted ? 1 : 0,
          transition: "transform 400ms cubic-bezier(0.34,1.4,0.64,1), opacity 400ms cubic-bezier(0.34,1.4,0.64,1)",
        }}
      >
        <StarIcon />
      </div>

      {/* Eyebrow */}
      <p style={{
        fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.14em", color: "var(--green)", marginBottom: "8px",
      }}>
        Dilly for UTampa
      </p>

      {/* Hero title */}
      <h1
        className="font-playfair"
        style={{
          fontSize: "36px", fontWeight: 900, color: "var(--t1)",
          textAlign: "center", letterSpacing: "-0.03em",
          whiteSpace: "pre-line", marginBottom: "6px",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 350ms cubic-bezier(0.16,1,0.3,1) 150ms, transform 350ms cubic-bezier(0.16,1,0.3,1) 150ms",
        }}
      >
        {firstName ? `${firstName},\nyou're in.` : "You're in."}
      </h1>

      {/* Pills */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center", marginBottom: "10px" }}>
        {cohortLabel && (
          <span style={{
            background: "var(--gdim)", border: "1px solid var(--gbdr)",
            borderRadius: "999px", padding: "3px 10px",
            fontSize: "10px", fontWeight: 600, color: "var(--green)",
          }}>
            {cohortLabel}
          </span>
        )}
        {goalLabel && (
          <span style={{
            background: "var(--golddim)", border: "1px solid var(--goldbdr)",
            borderRadius: "999px", padding: "3px 10px",
            fontSize: "10px", fontWeight: 600, color: "var(--gold)",
          }}>
            {goalLabel}
          </span>
        )}
      </div>

      {/* Sub text */}
      <p style={{ fontSize: "12px", color: "var(--t2)", textAlign: "center", lineHeight: 1.6, marginBottom: "16px" }}>
        {`Here's where ${cohort} students at UTampa land.\nYour score goes here next.`}
      </p>

      {/* Benchmark chart */}
      <div style={{
        width: "100%", background: "var(--s2)", border: "1px solid var(--b1)",
        borderRadius: "14px", padding: "12px", marginBottom: "18px",
      }}>
        <p style={{
          fontSize: "8px", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.10em", color: "var(--t3)", marginBottom: "8px",
        }}>
          Dilly score distribution · UTampa {cohortLabel} peers
        </p>

        {/* Bars */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "40px" }}>
          {BAR_HEIGHTS.map((pct, i) => (
            <div
              key={i}
              style={{
                flex: 1, borderRadius: "2px 2px 0 0",
                background: BAR_COLORS[i],
                height: barsReady ? `${pct}%` : "0%",
                transition: `height 600ms ease-out ${i * 40}ms`,
              }}
            />
          ))}
        </div>

        {/* Scale labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
          <span style={{ fontSize: "8px", color: "var(--t3)" }}>0</span>
          <span style={{ fontSize: "8px", fontWeight: 700, color: "var(--gold)" }}>Top 25% ←</span>
          <span style={{ fontSize: "8px", color: "var(--t3)" }}>100</span>
        </div>

        {/* Pulsing dot row */}
        <div style={{
          marginTop: "8px", background: "var(--golddim)", border: "1px solid var(--goldbdr)",
          borderRadius: "8px", padding: "6px 9px",
          display: "flex", alignItems: "center", gap: "6px",
        }}>
          <div className="pulse-dot" style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: "var(--gold)", flexShrink: 0,
          }} />
          <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--gold)" }}>
            Your score lands here in 2 steps
          </p>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => router.push("/onboarding/anticipation")}
        style={{
          width: "100%", background: "var(--green)", color: "#051A0B",
          border: "none", borderRadius: "13px", padding: "13px",
          fontSize: "13px", fontWeight: 700, cursor: "pointer",
        }}
      >
        Show me where I stand →
      </button>
    </div>
  );
}
