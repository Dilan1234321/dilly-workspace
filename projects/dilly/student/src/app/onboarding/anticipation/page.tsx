"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";

export default function AnticipationPage() {
  const router = useRouter();
  const [cohort,   setCohort]   = useState("");
  const [industry, setIndustry] = useState("");
  const [visible,  setVisible]  = useState([false, false, false]);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }

    const c = sessionStorage.getItem("dilly_onboarding_cohort") || sessionStorage.getItem("dilly_onboarding_track") || "";
    const ind = sessionStorage.getItem("dilly_onboarding_industry_target") || "";
    if (!c) { router.replace("/onboarding/profile"); return; }
    setCohort(c);
    setIndustry(ind);

    [0, 80, 160].forEach((delay, i) => {
      setTimeout(() => {
        setVisible((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, delay + 120);
    });
  }, [router]);

  const cohortDimension: Record<string, string> = {
    Tech:            "Build score",
    Business:        "Grit score",
    Science:         "Smart score",
    Quantitative:    "Smart score",
    Health:          "Grit score",
    "Social Science": "Grit score",
    Humanities:      "Build score",
    Sport:           "Grit score",
    "Pre-Health":    "Smart score",
    "Pre-Law":       "Smart score",
    General:         "overall score",
    // compat
    Finance:         "Grit score",
  };

  const cohortPeers: Record<string, string> = {
    Tech:            "CS and Data Science",
    Business:        "Finance and Business",
    Science:         "Science and research",
    Quantitative:    "Math and Statistics",
    Health:          "Health Sciences",
    "Social Science": "Social Science and Policy",
    Humanities:      "Humanities and Communications",
    Sport:           "Sport Management",
    "Pre-Health":    "Pre-Med and Health Sciences",
    "Pre-Law":       "Pre-Law and Political Science",
    General:         "your major",
    Finance:         "Finance and Business",
  };

  // Cohort-specific company reference
  const cohortCompany: Record<string, string> = {
    Tech:            "Google",
    Business:        "Goldman Sachs",
    Science:         "a top research lab",
    Quantitative:    industry === "Finance & Quant Trading" ? "Jane Street" : "a top quantitative employer",
    Health:          "Tampa General Hospital",
    "Social Science": "a top employer",
    Humanities:      "NBCUniversal",
    Sport:           "ESPN",
    "Pre-Health":    "Mayo Clinic",
    "Pre-Law":       "Skadden",
    General:         "a Fortune 500 recruiter",
    Finance:         "Goldman Sachs",
  };

  const dimension  = cohort ? (cohortDimension[cohort] ?? "overall score")    : "overall score";
  const peers      = cohort ? (cohortPeers[cohort]     ?? "your major")       : "your major";
  const company    = cohort ? (cohortCompany[cohort]   ?? "a top recruiter")  : "a top recruiter";

  const items = [
    {
      num: "01",
      text: (
        <>
          Score every bullet against{" "}
          <span style={{ color: "var(--gold)" }}>{company} recruiter</span> benchmarks
        </>
      ),
    },
    {
      num: "02",
      text: (
        <>
          Calculate your <span style={{ color: "var(--gold)" }}>{dimension}</span> vs {peers} peers at UTampa
        </>
      ),
    },
    {
      num: "03",
      text: (
        <>
          Show you <span style={{ color: "var(--gold)" }}>exactly</span> what to fix to move up the leaderboard
        </>
      ),
    },
  ];

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Grid overlay */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(244,244,250,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(244,244,250,0.018) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          pointerEvents: "none",
        }}
      />

      <div
        className="screen"
        style={{ position: "relative", zIndex: 1, maxWidth: "430px", margin: "0 auto" }}
      >
        {/* Back button */}
        <button
          onClick={() => router.push("/onboarding/you-are-in")}
          style={{
            background: "none", border: "none", padding: "16px 22px 0",
            fontSize: "13px", fontWeight: 500, color: "var(--blue)",
            cursor: "pointer", alignSelf: "flex-start",
          }}
        >
          ← Back
        </button>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: "3px", padding: "10px 22px 0" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: "2.5px", borderRadius: "999px",
                background:
                  i < 2 ? "var(--gold)"
                  : i === 2 ? "rgba(201,168,76,0.4)"
                  : "rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1, overflowY: "auto", padding: "0 22px 28px",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Eyebrow */}
          <p
            style={{
              fontSize: "8px", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.14em", color: "var(--t3)",
              marginTop: "40px", marginBottom: "12px",
            }}
          >
            In the next 15 seconds, Dilly will:
          </p>

          {/* Hero */}
          <h1
            className="font-playfair"
            style={{
              fontSize: "26px", fontWeight: 900, color: "var(--t1)",
              lineHeight: 1.2, letterSpacing: "-0.02em",
              marginBottom: "28px",
            }}
          >
            Read your resume the way a{" "}
            <span style={{ color: "var(--gold)" }}>{company}</span> recruiter does.
          </h1>

          {/* Numbered items */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" }}>
            {items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex", gap: "13px", alignItems: "flex-start",
                  opacity: visible[i] ? 1 : 0,
                  transform: visible[i] ? "translateY(0)" : "translateY(6px)",
                  transition: "opacity 350ms cubic-bezier(0.16,1,0.3,1), transform 350ms cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <span
                  style={{
                    fontSize: "9px", fontWeight: 700, color: "var(--gold)",
                    letterSpacing: "0.06em", marginTop: "2px", flexShrink: 0,
                    fontFamily: "monospace",
                  }}
                >
                  {item.num}
                </span>
                <p style={{ fontSize: "13px", color: "var(--t1)", lineHeight: 1.55, fontWeight: 500 }}>
                  {item.text}
                </p>
              </div>
            ))}
          </div>

          {/* Identity statement */}
          <div
            style={{
              borderLeft: "2px solid var(--gold)",
              paddingLeft: "13px",
              marginBottom: "22px",
            }}
          >
            <p style={{ fontSize: "12px", color: "var(--t2)", lineHeight: 1.6 }}>
              Dilly doesn&apos;t guess. He reads the same signals recruiters use — and scores you
              on the things that actually move the needle.
            </p>
          </div>

          {/* Social proof block */}
          <div
            style={{
              background: "var(--s2)", border: "1px solid var(--b1)",
              borderRadius: "13px", padding: "13px",
              marginBottom: "24px",
            }}
          >
            <p style={{
              fontSize: "8px", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.12em", color: "var(--t3)", marginBottom: "10px",
            }}>
              What {cohort || peers} cohort students say
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { quote: "I had no idea my impact bullets were wrong until Dilly flagged every single one.", name: "A.R., Finance" },
                { quote: "Went from a 61 to an 84 in one session. Three Goldman interviews that week.", name: "T.K., Finance" },
              ].map((q, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <div style={{
                    width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0,
                    background: "var(--s3)", border: "1px solid var(--b2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "9px", fontWeight: 700, color: "var(--t2)",
                  }}>
                    {q.name[0]}
                  </div>
                  <div>
                    <p style={{ fontSize: "11px", color: "var(--t1)", lineHeight: 1.5, marginBottom: "2px" }}>
                      &ldquo;{q.quote}&rdquo;
                    </p>
                    <p style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600 }}>{q.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1, minHeight: "8px" }} />

          {/* CTA */}
          <button
            onClick={() => router.push("/onboarding/upload")}
            style={{
              width: "100%", background: "var(--gold)", color: "#1A1200",
              border: "none", borderRadius: "13px", padding: "13px",
              fontSize: "13px", fontWeight: 700, cursor: "pointer",
              letterSpacing: "-0.01em",
            }}
          >
            Upload my resume →
          </button>
        </div>
      </div>
    </div>
  );
}
