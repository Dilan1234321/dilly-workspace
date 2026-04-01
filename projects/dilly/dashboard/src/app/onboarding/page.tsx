"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  APPROVED_MAJORS,
  PRE_PROF_OPTIONS,
  TARGET_OPTIONS,
  INTERESTS_LIST,
  INDUSTRY_TARGET_OPTIONS_QUANT,
  INDUSTRY_TARGET_OPTIONS_DATA,
  COHORT_COPY,
  detectCohort,
  needsIndustryTarget,
} from "@/lib/onboardingConstants";
import { ONBOARDING_STEP_KEY } from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";

/* ═══════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */

type StepId =
  | "welcome"
  | "verify"
  | "profile"
  | "interests"
  | "industry"
  | "youarein"
  | "anticipation"
  | "upload"
  | "scanning"
  | "results";

/* ═══════════════════════════════════════════════════════════════════════
   SHARED UI ATOMS
   ═══════════════════════════════════════════════════════════════════════ */

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <div style={{ height: 3, background: "var(--m-border)", flexShrink: 0 }}>
      <div
        style={{
          height: "100%",
          background: "var(--m-accent)",
          width: `${pct}%`,
          transition: "width 400ms cubic-bezier(0.16,1,0.3,1)",
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}

function StepDots({ steps, current }: { steps: number; current: number }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {Array.from({ length: steps }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background:
              i === current
                ? "var(--m-accent)"
                : i < current
                  ? "rgba(201,168,130,0.3)"
                  : "var(--m-border)",
            transition: "all 300ms ease",
          }}
        />
      ))}
    </div>
  );
}

function Pill({
  label,
  selected,
  onClick,
  color = "var(--m-accent)",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        border: "1px solid",
        transition: "all 150ms ease",
        background: selected ? `color-mix(in srgb, ${color} 10%, transparent)` : "transparent",
        borderColor: selected ? color : "var(--m-border)",
        color: selected ? color : "var(--m-text-2)",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}
    >
      {label}
    </button>
  );
}

function TagChip({
  label,
  onRemove,
  color = "var(--m-accent)",
}: {
  label: string;
  onRemove: () => void;
  color?: string;
}) {
  return (
    <span
      onClick={onRemove}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        padding: "5px 12px",
        borderRadius: 6,
        cursor: "pointer",
        border: `1px solid color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      {label} &times;
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export default function OnboardingPage() {
  const router = useRouter();

  // ── Step management ──
  const allSteps: StepId[] = useMemo(
    () => [
      "welcome",
      "verify",
      "profile",
      "interests",
      "industry",
      "youarein",
      "anticipation",
      "upload",
      "scanning",
      "results",
    ],
    [],
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const currentStep = allSteps[stepIdx];

  // ── Auth state ──
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // ── Profile state ──
  const [fullName, setFullName] = useState("");
  const [majors, setMajors] = useState<string[]>([]);
  const [majorQuery, setMajorQuery] = useState("");
  const [minors, setMinors] = useState<string[]>([]);
  const [minorQuery, setMinorQuery] = useState("");
  const [preProf, setPreProf] = useState<string | null>(null);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [industryTarget, setIndustryTarget] = useState<string | null>(null);

  // ── Upload + scan state ──
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanStep, setScanStep] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  const [scanError, setScanError] = useState("");

  // ── Results state ──
  const [auditResult, setAuditResult] = useState<{
    final_score: number;
    scores: { smart: number; grit: number; build: number };
    detected_track?: string;
  } | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);

  // ── Saving state ──
  const [saving, setSaving] = useState(false);

  // ── Derived ──
  const cohort = detectCohort(majors, preProf);
  const cohortInfo = COHORT_COPY[cohort] ?? COHORT_COPY.General;
  const showIndustry = needsIndustryTarget(cohort, majors);

  const majorSuggestions = useMemo(() => {
    if (!majorQuery.trim()) return [];
    const q = majorQuery.toLowerCase();
    return APPROVED_MAJORS.filter(
      (m) => m.toLowerCase().includes(q) && !majors.includes(m),
    ).slice(0, 6);
  }, [majorQuery, majors]);

  const minorSuggestions = useMemo(() => {
    if (!minorQuery.trim()) return [];
    const q = minorQuery.toLowerCase();
    return APPROVED_MAJORS.filter(
      (m) => m.toLowerCase().includes(q) && !minors.includes(m),
    ).slice(0, 6);
  }, [minorQuery, minors]);

  // ── Resend cooldown timer ──
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── Score count-up animation ──
  useEffect(() => {
    if (currentStep !== "results" || !auditResult) return;
    const target = auditResult.final_score;
    let frame = 0;
    const totalFrames = 40;
    const interval = setInterval(() => {
      frame++;
      setAnimatedScore(Math.round((frame / totalFrames) * target));
      if (frame >= totalFrames) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [currentStep, auditResult]);

  // ── Navigation helpers ──
  function goNext() {
    setDirection(1);
    let nextIdx = stepIdx + 1;
    // Skip industry step if not needed
    if (allSteps[nextIdx] === "industry" && !showIndustry) nextIdx++;
    setStepIdx(nextIdx);
  }

  function goPrev() {
    setDirection(-1);
    let prevIdx = stepIdx - 1;
    // Skip industry step backwards if not needed
    if (allSteps[prevIdx] === "industry" && !showIndustry) prevIdx--;
    if (prevIdx >= 0) setStepIdx(prevIdx);
  }

  // ── Visible step count (for progress, excluding skipped) ──
  const visibleSteps = allSteps.filter((s) => s !== "industry" || showIndustry);
  const visibleIdx = visibleSteps.indexOf(currentStep);

  // ── API helpers ──
  async function sendVerificationCode() {
    setSendingCode(true);
    try {
      const res = await dilly.fetch("/auth/send-verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed to send code");
      setResendCooldown(30);
      goNext();
    } catch {
      /* ignore — user can retry */
    } finally {
      setSendingCode(false);
    }
  }

  async function verifyCode() {
    setVerifying(true);
    setCodeError("");
    try {
      const res = await dilly.fetch("/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        setCodeError("Invalid code. Please try again.");
        setVerifying(false);
        return;
      }
      const data = await res.json();
      const sessionToken = data?.token;
      if (sessionToken) {
        localStorage.setItem("dilly_auth_token", sessionToken);
        setToken(sessionToken);
      }
      if (data?.is_new_user === false) {
        // Returning user — skip onboarding
        router.replace("/");
        return;
      }
      goNext();
    } catch {
      setCodeError("Something went wrong. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function resendCode() {
    if (resendCooldown > 0) return;
    setResendCooldown(30);
    try {
      await dilly.fetch("/auth/send-verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* ignore */
    }
  }

  async function saveProfile() {
    setSaving(true);
    const target = TARGET_OPTIONS.find((t) => t.key === targetKey);
    try {
      await dilly.patch("/profile", {
        name: fullName,
        majors,
        minors,
        pre_professional: preProf && preProf !== "None / Not applicable" ? preProf : null,
        application_target: target?.apiValue ?? "exploring",
        goals: interests,
      });
    } catch {
      /* continue anyway */
    } finally {
      setSaving(false);
    }
    goNext();
  }

  async function saveIndustryTarget() {
    setSaving(true);
    try {
      await dilly.patch("/profile", { industry_target: industryTarget ?? "not_sure" });
    } catch {
      /* continue */
    } finally {
      setSaving(false);
    }
    goNext();
  }

  async function runFirstAudit() {
    setScanStep(0);
    setScanDone(false);
    setScanError("");

    // Animate the steps on a timer
    const stepTimers = [1200, 2400, 3600, 4800];
    stepTimers.forEach((ms, i) => {
      setTimeout(() => setScanStep(i + 1), ms);
    });

    try {
      const fd = new FormData();
      if (resumeFile) fd.append("file", resumeFile);
      fd.append("name", fullName);
      fd.append("majors", JSON.stringify(majors));
      fd.append("track", cohort);
      fd.append("application_target", TARGET_OPTIONS.find((o) => o.key === targetKey)?.apiValue ?? "exploring");

      const res = await dilly.fetch("/audit/first-run", { method: "POST", body: fd });

      if (!res.ok) throw new Error("Audit failed");
      const data = await res.json();
      setAuditResult({
        final_score: data.final_score ?? 0,
        scores: data.scores ?? { smart: 0, grit: 0, build: 0 },
        detected_track: data.detected_track,
      });
    } catch {
      setScanError("Something went wrong. You can retry from the dashboard.");
    }

    // Wait for animation to finish
    await new Promise((r) => setTimeout(r, 6000));
    setScanDone(true);
    setTimeout(() => goNext(), 600);
  }

  async function finishOnboarding() {
    setSaving(true);
    try {
      await dilly.patch("/profile", { onboarding_complete: true });
    } catch {
      /* proceed anyway */
    }
    localStorage.removeItem(ONBOARDING_STEP_KEY);
    router.replace("/");
  }

  // ── Step validation ──
  const canContinue: Record<StepId, boolean> = {
    welcome: email.includes(".edu") && !sendingCode,
    verify: code.length === 6 && !verifying,
    profile: fullName.trim().length > 0 && majors.length > 0 && targetKey !== null,
    interests: true, // interests are encouraged but not required
    industry: industryTarget !== null,
    youarein: true,
    anticipation: true,
    upload: true, // resume optional but encouraged
    scanning: false,
    results: true,
  };

  // ── Should show back button? ──
  const showBack =
    stepIdx > 0 &&
    currentStep !== "scanning" &&
    currentStep !== "results" &&
    currentStep !== "youarein";

  // ── Should show footer? ──
  const showFooter = currentStep !== "scanning";

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER STEPS
     ═══════════════════════════════════════════════════════════════════════ */

  function renderStep() {
    switch (currentStep) {
      /* ── WELCOME ── */
      case "welcome":
        return (
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--m-accent)",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              74% of Tech resumes are missing a GitHub link
            </p>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--m-text)", margin: "0 0 8px" }}>
              Welcome to Dilly
            </h1>
            <p style={{ fontSize: 15, color: "var(--m-text-2)", margin: "0 0 32px", lineHeight: 1.6 }}>
              Enter your .edu email to get started. We&apos;ll send you a verification code.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canContinue.welcome) sendVerificationCode();
              }}
              autoFocus
              style={{
                width: "100%",
                padding: "14px 16px",
                fontSize: 15,
                borderRadius: 6,
                border: "1px solid var(--m-border)",
                background: "var(--m-surface)",
                color: "var(--m-text)",
                outline: "none",
                fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              }}
            />
            {email && !email.includes(".edu") && (
              <p style={{ fontSize: 12, color: "var(--coral, #FF453A)", marginTop: 8 }}>
                Please use a .edu email address
              </p>
            )}
          </div>
        );

      /* ── VERIFY ── */
      case "verify":
        return (
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--m-text)", margin: "0 0 8px" }}>
              Check your inbox
            </h1>
            <p style={{ fontSize: 15, color: "var(--m-text-2)", margin: "0 0 8px", lineHeight: 1.6 }}>
              We sent a 6-digit code to <strong style={{ color: "var(--m-text)" }}>{email}</strong>
            </p>
            <p style={{ fontSize: 12, color: "var(--m-text-3)", margin: "0 0 32px" }}>
              Check spam if you don&apos;t see it
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                setCodeError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canContinue.verify) verifyCode();
              }}
              placeholder="000000"
              autoFocus
              style={{
                width: "100%",
                padding: "14px 16px",
                fontSize: 24,
                fontFamily: "var(--font-geist-mono), monospace",
                letterSpacing: 8,
                textAlign: "center",
                borderRadius: 6,
                border: `1px solid ${codeError ? "var(--coral, #FF453A)" : "var(--m-border)"}`,
                background: "var(--m-surface)",
                color: "var(--m-text)",
                outline: "none",
              }}
            />
            {codeError && (
              <p style={{ fontSize: 12, color: "var(--coral, #FF453A)", marginTop: 8 }}>{codeError}</p>
            )}
            <button
              onClick={resendCode}
              disabled={resendCooldown > 0}
              style={{
                marginTop: 16,
                fontSize: 13,
                color: resendCooldown > 0 ? "var(--m-text-3)" : "var(--m-accent)",
                background: "none",
                border: "none",
                cursor: resendCooldown > 0 ? "default" : "pointer",
                fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              }}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
            </button>
          </div>
        );

      /* ── PROFILE ── */
      case "profile":
        return (
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--m-text)", margin: "0 0 8px" }}>
              Tell us about you
            </h1>
            <p style={{ fontSize: 15, color: "var(--m-text-2)", margin: "0 0 32px", lineHeight: 1.6 }}>
              This helps Dilly score you against the right benchmarks.
            </p>

            {/* Full Name */}
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--m-text-3)", letterSpacing: 1.5, textTransform: "uppercase" }}>
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              autoFocus
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 14,
                borderRadius: 6,
                border: "1px solid var(--m-border)",
                background: "var(--m-surface)",
                color: "var(--m-text)",
                outline: "none",
                marginTop: 6,
                marginBottom: 20,
                fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              }}
            />

            {/* Majors */}
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--m-accent)", letterSpacing: 1.5, textTransform: "uppercase" }}>
              Major(s)
            </label>
            <div style={{ position: "relative", marginTop: 6, marginBottom: 8 }}>
              <input
                type="text"
                value={majorQuery}
                onChange={(e) => setMajorQuery(e.target.value)}
                placeholder="Search majors..."
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: 14,
                  borderRadius: 6,
                  border: "1px solid var(--m-border)",
                  background: "var(--m-surface)",
                  color: "var(--m-text)",
                  outline: "none",
                  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                }}
              />
              {majorSuggestions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "var(--m-surface-2)",
                    border: "1px solid var(--m-border)",
                    borderRadius: 6,
                    marginTop: 4,
                    zIndex: 10,
                    overflow: "hidden",
                  }}
                >
                  {majorSuggestions.map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setMajors((prev) => [...prev, m]);
                        setMajorQuery("");
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 13,
                        color: "var(--m-text)",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--m-border)",
                        cursor: "pointer",
                        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                      }}
                      onMouseOver={(e) => {
                        (e.target as HTMLElement).style.background = "var(--m-surface-3)";
                      }}
                      onMouseOut={(e) => {
                        (e.target as HTMLElement).style.background = "transparent";
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {majors.map((m) => (
                <TagChip key={m} label={m} onRemove={() => setMajors(majors.filter((x) => x !== m))} />
              ))}
            </div>

            {/* Pre-professional track */}
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--m-text-3)", letterSpacing: 1.5, textTransform: "uppercase" }}>
              Pre-professional track
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, marginBottom: 20 }}>
              {PRE_PROF_OPTIONS.map((p) => (
                <Pill key={p} label={p} selected={preProf === p} onClick={() => setPreProf(preProf === p ? null : p)} />
              ))}
            </div>

            {/* Minors */}
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--m-text-3)", letterSpacing: 1.5, textTransform: "uppercase" }}>
              Minor(s) <span style={{ fontWeight: 400, opacity: 0.5 }}>optional</span>
            </label>
            <div style={{ position: "relative", marginTop: 6, marginBottom: 8 }}>
              <input
                type="text"
                value={minorQuery}
                onChange={(e) => setMinorQuery(e.target.value)}
                placeholder="Search minors..."
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: 14,
                  borderRadius: 6,
                  border: "1px solid var(--m-border)",
                  background: "var(--m-surface)",
                  color: "var(--m-text)",
                  outline: "none",
                  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                }}
              />
              {minorSuggestions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "var(--m-surface-2)",
                    border: "1px solid var(--m-border)",
                    borderRadius: 6,
                    marginTop: 4,
                    zIndex: 10,
                    overflow: "hidden",
                  }}
                >
                  {minorSuggestions.map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setMinors((prev) => [...prev, m]);
                        setMinorQuery("");
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 13,
                        color: "var(--m-text)",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--m-border)",
                        cursor: "pointer",
                        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                      }}
                      onMouseOver={(e) => {
                        (e.target as HTMLElement).style.background = "var(--m-surface-3)";
                      }}
                      onMouseOut={(e) => {
                        (e.target as HTMLElement).style.background = "transparent";
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {minors.map((m) => (
                <TagChip key={m} label={m} color="#C9A84C" onRemove={() => setMinors(minors.filter((x) => x !== m))} />
              ))}
            </div>

            {/* Application target */}
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--m-text-3)", letterSpacing: 1.5, textTransform: "uppercase" }}>
              What are you looking for?
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {TARGET_OPTIONS.map((t) => (
                <Pill key={t.key} label={t.label} selected={targetKey === t.key} onClick={() => setTargetKey(targetKey === t.key ? null : t.key)} />
              ))}
            </div>

            {/* Cohort card */}
            {majors.length > 0 && (
              <div
                style={{
                  marginTop: 24,
                  padding: 16,
                  borderRadius: 8,
                  background: "var(--m-accent-dim)",
                  border: "1px solid var(--m-border-accent)",
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--m-accent)", marginBottom: 4 }}>
                  {cohortInfo.label}
                </p>
                <p style={{ fontSize: 12, color: "var(--m-text-2)", lineHeight: 1.5 }}>
                  {cohortInfo.description}
                </p>
                <p style={{ fontSize: 11, color: "var(--m-text-3)", marginTop: 4 }}>{cohortInfo.emphasis}</p>
              </div>
            )}
          </div>
        );

      /* ── INTERESTS ── */
      case "interests":
        return (
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--m-text)", margin: "0 0 8px" }}>
              What interests you?
            </h1>
            <p style={{ fontSize: 15, color: "var(--m-text-2)", margin: "0 0 8px", lineHeight: 1.6 }}>
              Select fields you&apos;re curious about, even if they&apos;re not your major. Each interest adds a
              cohort you&apos;ll be scored in.
            </p>
            <p style={{ fontSize: 12, color: "var(--m-accent)", margin: "0 0 24px" }}>
              Pick as many as you want — the more you add, the more cohorts you unlock.
              {interests.length > 0 && (
                <span style={{ marginLeft: 8, color: "var(--m-text-3)" }}>
                  {interests.length} selected
                </span>
              )}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {INTERESTS_LIST.map((interest) => {
                const selected = interests.includes(interest);
                return (
                  <Pill
                    key={interest}
                    label={interest}
                    selected={selected}
                    onClick={() =>
                      setInterests((prev) =>
                        prev.includes(interest) ? prev.filter((x) => x !== interest) : [...prev, interest],
                      )
                    }
                  />
                );
              })}
            </div>
          </div>
        );

      /* ── INDUSTRY TARGET ── */
      case "industry":
        const isDataScience = majors.includes("Data Science");
        const options = isDataScience ? INDUSTRY_TARGET_OPTIONS_DATA : INDUSTRY_TARGET_OPTIONS_QUANT;
        return (
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--m-text)", margin: "0 0 8px" }}>
              {isDataScience ? "Where do you want to apply Data Science?" : "Pick your target industry"}
            </h1>
            <p style={{ fontSize: 15, color: "var(--m-text-2)", margin: "0 0 32px", lineHeight: 1.6 }}>
              This helps Dilly weigh your scores toward the right employers.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {options.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setIndustryTarget(o.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "16px 20px",
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: "pointer",
                    border: "1px solid",
                    transition: "all 150ms ease",
                    background:
                      industryTarget === o.key ? "var(--m-accent-dim)" : "var(--m-surface)",
                    borderColor:
                      industryTarget === o.key ? "var(--m-border-accent)" : "var(--m-border)",
                    color: industryTarget === o.key ? "var(--m-accent)" : "var(--m-text-2)",
                    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                  }}
                >
                  <span style={{ fontSize: 20 }}>{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        );

      /* ── YOU ARE IN ── */
      case "youarein":
        return (
          <div style={{ textAlign: "center" }}>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                background: "linear-gradient(135deg, var(--m-accent), #C9A84C)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
                fontSize: 36,
              }}
            >
              &#9733;
            </motion.div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--m-text)", margin: "0 0 8px" }}>
              You&apos;re in, {fullName.split(" ")[0]}!
            </h1>
            <p style={{ fontSize: 15, color: "var(--m-text-2)", margin: "0 0 16px", lineHeight: 1.6 }}>
              Welcome to the <strong style={{ color: "var(--m-accent)" }}>{cohortInfo.label}</strong>.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: 9999,
                  background: "var(--m-accent-dim)",
                  color: "var(--m-accent)",
                  border: "1px solid var(--m-border-accent)",
                }}
              >
                {cohortInfo.label}
              </span>
              {interests.length > 0 && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 9999,
                    background: "rgba(52,199,89,0.08)",
                    color: "var(--green, #34C759)",
                    border: "1px solid rgba(52,199,89,0.2)",
                  }}
                >
                  +{interests.length} interest cohort{interests.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div
              style={{
                padding: 20,
                borderRadius: 8,
                background: "var(--m-surface)",
                border: "1px solid var(--m-border)",
                textAlign: "left",
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--m-text)", marginBottom: 8 }}>
                How Dilly scores you
              </p>
              <p style={{ fontSize: 12, color: "var(--m-text-2)", lineHeight: 1.6, marginBottom: 12 }}>
                {cohortInfo.description}
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                {["Smart", "Grit", "Build"].map((dim) => (
                  <div
                    key={dim}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      textAlign: "center",
                      borderRadius: 6,
                      background: "var(--m-surface-2)",
                    }}
                  >
                    <p style={{ fontSize: 11, color: "var(--m-text-3)", marginBottom: 2 }}>{dim}</p>
                    <div
                      style={{
                        height: 4,
                        width: "60%",
                        margin: "0 auto",
                        borderRadius: 2,
                        background: "var(--m-accent)",
                        opacity: 0.5,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      /* ── ANTICIPATION ── */
      case "anticipation":
        return (
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--m-text)", margin: "0 0 8px" }}>
              Here&apos;s what happens next
            </h1>
            <p style={{ fontSize: 15, color: "var(--m-text-2)", margin: "0 0 32px", lineHeight: 1.6 }}>
              Upload your resume and Dilly will score it in under 15 seconds.
            </p>

            {[
              { num: "1", text: "We parse every bullet, skill, and date on your resume" },
              { num: "2", text: "We score you on Smart, Grit, and Build dimensions" },
              { num: "3", text: "We show exactly where you stand vs. your peers" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: "var(--m-accent-dim)",
                    color: "var(--m-accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {item.num}
                </div>
                <p style={{ fontSize: 14, color: "var(--m-text)", lineHeight: 1.5, margin: 0 }}>
                  {item.text}
                </p>
              </motion.div>
            ))}

            {/* Recruiter funnel card */}
            <div
              style={{
                marginTop: 24,
                padding: 16,
                borderRadius: 8,
                background: "var(--m-surface)",
                border: "1px solid var(--m-border)",
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--m-text-3)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
                The recruiter funnel
              </p>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {["ATS", "Recruiter (7s)", "Hiring Mgr", "Interview"].map((stage, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "4px 8px",
                        borderRadius: 4,
                        background: i === 0 ? "var(--m-accent-dim)" : "var(--m-surface-2)",
                        color: i === 0 ? "var(--m-accent)" : "var(--m-text-3)",
                      }}
                    >
                      {stage}
                    </span>
                    {i < 3 && (
                      <span style={{ color: "var(--m-text-3)", fontSize: 10 }}>&rarr;</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      /* ── UPLOAD ── */
      case "upload":
        return (
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--m-text)", margin: "0 0 8px" }}>
              Upload your resume
            </h1>
            <p style={{ fontSize: 15, color: "var(--m-text-2)", margin: "0 0 32px", lineHeight: 1.6 }}>
              PDF or DOCX, max 10 MB. This is how Dilly scores you.
            </p>
            <input
              type="file"
              ref={fileRef}
              accept=".pdf,.doc,.docx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size <= 10 * 1024 * 1024) setResumeFile(f);
              }}
              style={{ display: "none" }}
            />
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f && f.size <= 10 * 1024 * 1024) setResumeFile(f);
              }}
              style={{
                padding: "48px 32px",
                borderRadius: 8,
                margin: "0 auto 24px",
                background: dragOver ? "var(--m-accent-faint)" : "var(--m-surface)",
                border: `2px dashed ${dragOver ? "var(--m-accent)" : resumeFile ? "var(--green, #34C759)" : "var(--m-border)"}`,
                cursor: "pointer",
                transition: "all 200ms ease",
                maxWidth: 400,
              }}
            >
              {resumeFile ? (
                <div>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--green, #34C759)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px", display: "block" }}>
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--m-text)" }}>{resumeFile.name}</p>
                  <p style={{ fontSize: 12, color: "var(--m-text-3)", marginTop: 4 }}>
                    {(resumeFile.size / 1024).toFixed(0)} KB &middot; Click to replace
                  </p>
                </div>
              ) : (
                <div>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--m-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px", display: "block" }}>
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--m-text-2)" }}>
                    Drag &amp; drop or click to upload
                  </p>
                  <p style={{ fontSize: 12, color: "var(--m-text-3)", marginTop: 4 }}>PDF or DOCX</p>
                </div>
              )}
            </div>
            <p style={{ fontSize: 12, color: "var(--m-text-3)" }}>
              You can skip this and upload later
            </p>
          </div>
        );

      /* ── SCANNING ── */
      case "scanning":
        const scanSteps = [
          "Extracting your experience",
          "Cohort confirmed",
          "Measuring Grit score",
          "Comparing to peers",
          "Building recommendations",
        ];
        return (
          <div style={{ textAlign: "center" }}>
            {/* Animated Orb */}
            <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 40px" }}>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                style={{
                  position: "absolute",
                  inset: -20,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, var(--m-accent-dim), transparent 70%)",
                }}
              />
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--m-accent), #C9A84C)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 48,
                  position: "relative",
                }}
              >
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                >
                  &#10043;
                </motion.span>
              </div>
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--m-text)", margin: "0 0 32px" }}>
              Analyzing your resume...
            </h1>

            <div style={{ maxWidth: 320, margin: "0 auto", textAlign: "left" }}>
              {scanSteps.map((label, i) => {
                const state = i < scanStep ? "done" : i === scanStep ? "active" : "pending";
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 0",
                      borderBottom: i < scanSteps.length - 1 ? "1px solid var(--m-border)" : undefined,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        flexShrink: 0,
                        background:
                          state === "done"
                            ? "rgba(52,199,89,0.15)"
                            : state === "active"
                              ? "var(--m-accent-dim)"
                              : "var(--m-surface-2)",
                        color:
                          state === "done"
                            ? "var(--green, #34C759)"
                            : state === "active"
                              ? "var(--m-accent)"
                              : "var(--m-text-3)",
                      }}
                    >
                      {state === "done" ? "\u2713" : state === "active" ? "\u25CF" : ""}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        color:
                          state === "done"
                            ? "var(--m-text-2)"
                            : state === "active"
                              ? "var(--m-text)"
                              : "var(--m-text-3)",
                        fontWeight: state === "active" ? 600 : 400,
                      }}
                    >
                      {label}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {scanError && (
              <p style={{ fontSize: 13, color: "var(--coral, #FF453A)", marginTop: 24 }}>{scanError}</p>
            )}
          </div>
        );

      /* ── RESULTS ── */
      case "results":
        const score = auditResult?.final_score ?? 0;
        const scores = auditResult?.scores ?? { smart: 0, grit: 0, build: 0 };
        return (
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--m-text-3)",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Your Dilly Score
            </p>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
              <span
                style={{
                  fontSize: 72,
                  fontWeight: 800,
                  color: "var(--m-text)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  lineHeight: 1,
                }}
              >
                {animatedScore}
              </span>
              <span style={{ fontSize: 24, color: "var(--m-text-3)", marginLeft: 4 }}>/100</span>
            </motion.div>

            {/* Dimension breakdown */}
            <div
              style={{
                display: "flex",
                gap: 16,
                justifyContent: "center",
                margin: "32px 0",
              }}
            >
              {(["smart", "grit", "build"] as const).map((dim) => (
                <div
                  key={dim}
                  style={{
                    padding: "16px 24px",
                    borderRadius: 8,
                    background: "var(--m-surface)",
                    border: "1px solid var(--m-border)",
                    minWidth: 100,
                  }}
                >
                  <p style={{ fontSize: 11, color: "var(--m-text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                    {dim}
                  </p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: "var(--m-text)", fontFamily: "var(--font-geist-mono), monospace" }}>
                    {scores[dim]}
                  </p>
                </div>
              ))}
            </div>

            {/* Cohort badge */}
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                background: "var(--m-surface)",
                border: "1px solid var(--m-border)",
                marginBottom: 24,
              }}
            >
              <p style={{ fontSize: 13, color: "var(--m-text-2)", lineHeight: 1.6 }}>
                Scored in the{" "}
                <strong style={{ color: "var(--m-accent)" }}>{cohortInfo.label}</strong>
                {interests.length > 0 && (
                  <> and <strong style={{ color: "var(--m-accent)" }}>{interests.length} interest cohort{interests.length !== 1 ? "s" : ""}</strong></>
                )}
              </p>
            </div>

            {/* Teaser card */}
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                background: "var(--m-surface)",
                border: "1px solid var(--m-border)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ filter: "blur(4px)", opacity: 0.4 }}>
                <p style={{ fontSize: 13, color: "var(--m-text-2)" }}>
                  Dilly found 4 specific improvements that could raise your score by 12+ points...
                </p>
              </div>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 16 }}>&#128274;</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--m-accent)" }}>
                  Unlock in the Career Center
                </span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LAYOUT
     ═══════════════════════════════════════════════════════════════════════ */

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--m-bg)",
        overflow: "hidden",
      }}
    >
      {/* Progress bar */}
      <ProgressBar current={visibleIdx} total={visibleSteps.length} />

      {/* Header */}
      <div
        style={{
          padding: "20px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 800, color: "var(--m-accent)", letterSpacing: -0.5 }}>
          dilly
        </span>
        <span style={{ fontSize: 12, color: "var(--m-text-3)" }}>
          Step {visibleIdx + 1} of {visibleSteps.length}
        </span>
      </div>

      {/* Content area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
          padding: "0 24px",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: direction > 0 ? 40 : -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction > 0 ? -40 : 40 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: 560, maxWidth: "100%" }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      {showFooter && (
        <div
          style={{
            padding: "20px 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            borderTop: "1px solid var(--m-border)",
          }}
        >
          {showBack ? (
            <button
              onClick={goPrev}
              style={{
                padding: "10px 24px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                border: "1px solid var(--m-border)",
                background: "transparent",
                color: "var(--m-text-2)",
                cursor: "pointer",
                fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              }}
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <StepDots steps={visibleSteps.length} current={visibleIdx} />

          {/* CTA button logic */}
          {currentStep === "welcome" && (
            <button
              onClick={sendVerificationCode}
              disabled={!canContinue.welcome}
              style={ctaStyle(!canContinue.welcome)}
            >
              {sendingCode ? "Sending..." : "Continue"}
            </button>
          )}
          {currentStep === "verify" && (
            <button
              onClick={verifyCode}
              disabled={!canContinue.verify}
              style={ctaStyle(!canContinue.verify)}
            >
              {verifying ? "Verifying..." : "Verify"}
            </button>
          )}
          {currentStep === "profile" && (
            <button
              onClick={saveProfile}
              disabled={!canContinue.profile || saving}
              style={ctaStyle(!canContinue.profile || saving)}
            >
              {saving ? "Saving..." : "Continue"}
            </button>
          )}
          {currentStep === "interests" && (
            <button onClick={goNext} style={ctaStyle(false)}>
              {interests.length === 0 ? "Skip" : `Continue (${interests.length})`}
            </button>
          )}
          {currentStep === "industry" && (
            <button
              onClick={saveIndustryTarget}
              disabled={!canContinue.industry || saving}
              style={ctaStyle(!canContinue.industry || saving)}
            >
              {saving ? "Saving..." : "Continue"}
            </button>
          )}
          {currentStep === "youarein" && (
            <button onClick={goNext} style={ctaStyle(false)}>
              Continue
            </button>
          )}
          {currentStep === "anticipation" && (
            <button onClick={goNext} style={ctaStyle(false)}>
              Let&apos;s go
            </button>
          )}
          {currentStep === "upload" && (
            <button
              onClick={() => {
                goNext();
                // Start scanning after moving to next step
                setTimeout(runFirstAudit, 300);
              }}
              style={ctaStyle(false)}
            >
              {resumeFile ? "Scan my resume" : "Skip for now"}
            </button>
          )}
          {currentStep === "results" && (
            <button
              onClick={finishOnboarding}
              disabled={saving}
              style={ctaStyle(saving)}
            >
              {saving ? "Loading..." : "Enter the Career Center"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── CTA button style helper ── */
function ctaStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 32px",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    background: disabled ? "var(--m-surface-2)" : "var(--m-accent)",
    color: disabled ? "var(--m-text-3)" : "var(--m-bg)",
    cursor: disabled ? "default" : "pointer",
    transition: "all 200ms ease",
    opacity: disabled ? 0.7 : 1,
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  };
}
