"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { patchProfile, getToken } from "@/lib/auth";

// ── Option definitions ────────────────────────────────────────────────────────

type IndustryOption = {
  value: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
};

function IconTile({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: "36px", height: "36px", borderRadius: "10px",
      background: bg, display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
    }}>
      {children}
    </div>
  );
}

const QUANT_OPTIONS: IndustryOption[] = [
  {
    value: "Finance & Quant Trading",
    label: "Finance & Quant Trading",
    sub: "Jane Street, Citadel, Two Sigma, quant funds",
    icon: <IconTile bg="rgba(201,168,76,0.18)"><span style={{ fontSize: "16px", color: "var(--gold)", fontWeight: 700 }}>$</span></IconTile>,
  },
  {
    value: "Tech & Data Science",
    label: "Tech & Data Science",
    sub: "Google, Meta, data science and ML roles",
    icon: <IconTile bg="rgba(59,130,246,0.15)"><span style={{ fontSize: "12px", color: "#60A5FA", fontWeight: 700, fontFamily: "monospace" }}>{"</>"}</span></IconTile>,
  },
  {
    value: "Actuarial & Insurance",
    label: "Actuarial & Insurance",
    sub: "Milliman, Aon, Towers Watson",
    icon: <IconTile bg="rgba(20,184,166,0.15)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    </IconTile>,
  },
  {
    value: "Research & Academia",
    label: "Research & Academia",
    sub: "PhD programs, NSF fellowships, research labs",
    icon: <IconTile bg="rgba(34,197,94,0.15)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
      </svg>
    </IconTile>,
  },
  {
    value: "Not sure yet",
    label: "Not sure yet",
    sub: "Dilly will use balanced scoring — you can update this later",
    icon: <IconTile bg="var(--s3)"><span style={{ fontSize: "16px", color: "var(--t3)", fontWeight: 700 }}>?</span></IconTile>,
  },
];

const DATA_SCIENCE_OPTIONS: IndustryOption[] = [
  {
    value: "Tech & Data Science",
    label: "Tech companies",
    sub: "Google, Meta, Amazon, Microsoft data science roles",
    icon: <IconTile bg="rgba(59,130,246,0.15)"><span style={{ fontSize: "12px", color: "#60A5FA", fontWeight: 700, fontFamily: "monospace" }}>{"</>"}</span></IconTile>,
  },
  {
    value: "Finance & Quant Trading",
    label: "Finance & Quant",
    sub: "Quant funds, investment banks, financial data roles",
    icon: <IconTile bg="rgba(201,168,76,0.18)"><span style={{ fontSize: "16px", color: "var(--gold)", fontWeight: 700 }}>$</span></IconTile>,
  },
  {
    value: "Healthcare & Biotech",
    label: "Healthcare & Biotech",
    sub: "Pharmaceutical companies, health data, clinical analytics",
    icon: <IconTile bg="rgba(20,184,166,0.15)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    </IconTile>,
  },
  {
    value: "Not sure yet",
    label: "Not sure yet",
    sub: "Dilly defaults to Tech cohort — update anytime",
    icon: <IconTile bg="var(--s3)"><span style={{ fontSize: "16px", color: "var(--t3)", fontWeight: 700 }}>?</span></IconTile>,
  },
];

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar() {
  return (
    <div style={{ display: "flex", gap: "3px", padding: "0 22px", marginTop: "34px" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1, height: "2.5px", borderRadius: "999px",
            background:
              i < 1 ? "var(--gold)"
              : i === 1 ? "rgba(201,168,76,0.4)"
              : "rgba(255,255,255,0.08)",
          }}
        />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IndustryTargetPage() {
  const router = useRouter();
  const [cohort, setCohort] = useState("");
  const [major, setMajor] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    const c = sessionStorage.getItem("dilly_onboarding_cohort") || "";
    const m = sessionStorage.getItem("dilly_onboarding_major") || "";
    if (!c) { router.replace("/onboarding/profile"); return; }
    setCohort(c);
    setMajor(m);
  }, [router]);

  const isDataScience = major === "Data Science" && cohort === "Tech";
  const options = isDataScience ? DATA_SCIENCE_OPTIONS : QUANT_OPTIONS;
  const cohortLabel = isDataScience ? "Tech cohort" : "Quantitative cohort";

  async function handleContinue() {
    if (loading) return;
    const finalSelection = selected || "Not sure yet";
    setLoading(true);
    try {
      sessionStorage.setItem("dilly_onboarding_industry_target", finalSelection);
      await patchProfile({ industry_target: finalSelection });
    } catch {
      // non-fatal — continue anyway
    } finally {
      setLoading(false);
    }
    router.push("/onboarding/you-are-in");
  }

  return (
    <div className="screen">
      <button
        onClick={() => router.push("/onboarding/profile")}
        style={{
          background: "none", border: "none", padding: "16px 22px 0",
          fontSize: "13px", fontWeight: 500, color: "var(--blue)",
          cursor: "pointer", alignSelf: "flex-start",
        }}
      >
        ← Back
      </button>

      <ProgressBar />

      <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 24px", display: "flex", flexDirection: "column" }}>

        {/* Cohort pill */}
        <div style={{ paddingTop: "40px", marginBottom: "14px" }}>
          <span style={{
            display: "inline-block",
            background: "var(--golddim)", border: "1px solid var(--goldbdr)",
            borderRadius: "999px", padding: "3px 12px",
            fontSize: "10px", fontWeight: 700, color: "var(--gold)",
            marginBottom: "14px",
          }}>
            {cohortLabel}
          </span>

          <h1
            className="font-playfair"
            style={{ fontSize: "22px", fontWeight: 700, color: "var(--t1)", lineHeight: 1.2, marginBottom: "6px" }}
          >
            Where are you headed?
          </h1>
          <p style={{ fontSize: "11px", color: "var(--t2)", lineHeight: 1.55, marginBottom: "22px" }}>
            Dilly scores you differently depending on your target industry.{" "}
            This makes your score much more accurate.
          </p>
        </div>

        {/* Option cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
          {options.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(isSelected ? null : opt.value)}
                style={{
                  background:   isSelected ? "var(--golddim)" : "var(--s2)",
                  border:       `1.5px solid ${isSelected ? "var(--goldbdr)" : "var(--b1)"}`,
                  borderRadius: "13px",
                  padding:      "13px 14px",
                  cursor:       "pointer",
                  display:      "flex",
                  alignItems:   "center",
                  gap:          "10px",
                  textAlign:    "left",
                  transition:   "background 0.12s, border-color 0.12s",
                }}
              >
                {opt.icon}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: isSelected ? "var(--gold)" : "var(--t1)", marginBottom: "2px" }}>
                    {opt.label}
                  </p>
                  <p style={{ fontSize: "10px", color: "var(--t2)", lineHeight: 1.4 }}>
                    {opt.sub}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minHeight: "8px" }} />

        <button
          onClick={handleContinue}
          disabled={loading}
          style={{
            width: "100%",
            background:   "var(--gold)",
            color:        "#1a1400",
            border:       "none",
            borderRadius: "13px",
            padding:      "13px",
            fontSize:     "13px",
            fontWeight:   700,
            cursor:       loading ? "default" : "pointer",
            letterSpacing: "-0.01em",
          }}
        >
          {loading ? "Saving…" : "This looks right →"}
        </button>
      </div>
    </div>
  );
}
