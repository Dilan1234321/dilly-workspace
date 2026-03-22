"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { patchProfile, getToken } from "@/lib/auth";
import { APPROVED_MAJORS, APPROVED_MAJORS_SET } from "@/lib/majors";
import TagAutocomplete from "@/components/TagAutocomplete";

// ── Pre-professional options ──────────────────────────────────────────────────
const PRE_PROF_OPTIONS = [
  "Pre-Med",
  "Pre-Dental",
  "Pre-Pharmacy",
  "Pre-Veterinary",
  "Pre-Physical Therapy",
  "Pre-Occupational Therapy",
  "Pre-Physician Assistant",
  "Pre-Law",
  "None / Not applicable",
] as const;
type PreProf = (typeof PRE_PROF_OPTIONS)[number] | null;

// ── Major → cohort mapping ────────────────────────────────────────────────────
const MAJOR_TO_COHORT: Record<string, string> = {
  "Computer Science": "Tech",
  "Computer Information Systems": "Tech",
  "Software Engineering": "Tech",
  "Cybersecurity": "Tech",
  "Information Technology": "Tech",
  "Data Science": "Tech",
  "Finance": "Business",
  "Accounting": "Business",
  "Economics": "Business",
  "Business Administration": "Business",
  "International Business": "Business",
  "Management": "Business",
  "Marketing": "Business",
  "Advertising and Public Relations": "Business",
  "Biology": "Science",
  "Chemistry": "Science",
  "Biochemistry": "Science",
  "Physics": "Science",
  "Environmental Science": "Science",
  "Marine Science": "Science",
  "Forensic Science": "Science",
  "Mathematics": "Quantitative",
  "Statistics": "Quantitative",
  "Nursing": "Health",
  "Health Sciences": "Health",
  "Exercise Science": "Health",
  "Kinesiology": "Health",
  "Allied Health": "Health",
  "Public Health": "Health",
  "Psychology": "Social Science",
  "Sociology": "Social Science",
  "Political Science": "Social Science",
  "Criminal Justice": "Social Science",
  "Government and World Affairs": "Social Science",
  "Social Work": "Social Science",
  "History": "Social Science",
  "Philosophy": "Social Science",
  "English": "Humanities",
  "Journalism": "Humanities",
  "Communication": "Humanities",
  "Liberal Arts": "Humanities",
  "Education": "Humanities",
  "Theatre Arts": "Humanities",
  "Music": "Humanities",
  "Digital Arts and Design": "Humanities",
  "Sport Management": "Sport",
};

const PRE_PROF_TO_COHORT: Record<string, string> = {
  "Pre-Med": "Pre-Health",
  "Pre-Dental": "Pre-Health",
  "Pre-Pharmacy": "Pre-Health",
  "Pre-Veterinary": "Pre-Health",
  "Pre-Physical Therapy": "Pre-Health",
  "Pre-Occupational Therapy": "Pre-Health",
  "Pre-Physician Assistant": "Pre-Health",
  "Pre-Law": "Pre-Law",
};

// Returns cohort key (does not factor in industry_target — that happens in industry-target screen)
function detectCohort(majors: string[], preProfessional: PreProf): string {
  if (preProfessional && preProfessional !== "None / Not applicable") {
    const override = PRE_PROF_TO_COHORT[preProfessional];
    if (override) return override;
  }
  for (const major of majors) {
    const cohort = MAJOR_TO_COHORT[major];
    if (cohort) return cohort;
  }
  return "General";
}

// Whether this cohort needs the industry-target screen
function needsIndustryTarget(cohort: string, majors: string[]): boolean {
  if (cohort === "Quantitative") return true;
  if (majors.includes("Data Science") && cohort === "Tech") return true;
  return false;
}

// ── Cohort reveal card copy ───────────────────────────────────────────────────
const COHORT_COPY: Record<string, { label: string; description: string; emphasis: string }> = {
  Tech: {
    label: "Tech cohort",
    description: "Dilly will score you against Google, Meta, and Amazon criteria.",
    emphasis: "Your Build score carries the most weight.",
  },
  Business: {
    label: "Business cohort",
    description: "Dilly will score you against Goldman Sachs, Deloitte, and JP Morgan criteria.",
    emphasis: "Your Grit score carries the most weight.",
  },
  Science: {
    label: "Science cohort",
    description: "Dilly will score you against NIH, top biotech, and research lab criteria.",
    emphasis: "Your Smart score carries the most weight.",
  },
  Quantitative: {
    label: "Quantitative cohort",
    description: "Dilly will score you against top quant and analytical employer criteria.",
    emphasis: "You'll choose your target industry next.",
  },
  Health: {
    label: "Health & Movement cohort",
    description: "Dilly will score you against top hospital and healthcare employer criteria.",
    emphasis: "Your Grit score carries the most weight.",
  },
  "Social Science": {
    label: "Social Science cohort",
    description: "Dilly will score you against top consulting, government, and nonprofit criteria.",
    emphasis: "Your Grit score carries the most weight.",
  },
  Humanities: {
    label: "Humanities & Communication cohort",
    description: "Dilly will score you against top media, publishing, and education employer criteria.",
    emphasis: "Your Build portfolio carries the most weight.",
  },
  Sport: {
    label: "Sport & Recreation cohort",
    description: "Dilly will score you against ESPN, top sports agencies, and league criteria.",
    emphasis: "Your Grit score carries the most weight.",
  },
  "Pre-Health": {
    label: "Pre-Health track",
    description: "Dilly will score you against Mayo Clinic, top med school, and clinical program criteria.",
    emphasis: "Your Smart score carries the most weight.",
  },
  "Pre-Law": {
    label: "Pre-Law track",
    description: "Dilly will score you against Skadden, top law school, and legal employer criteria.",
    emphasis: "Your Smart score carries the most weight.",
  },
  General: {
    label: "General cohort",
    description: "Dilly will score you against top employer criteria across industries.",
    emphasis: "All three dimensions are equally weighted.",
  },
};

// ── Application target options ────────────────────────────────────────────────
const TARGET_OPTIONS = [
  { label: "Internship · Summer 2026", value: "internship" },
  { label: "Full-time job",            value: "full_time"  },
  { label: "Graduate school",          value: "exploring"  },
  { label: "Just exploring",           value: "exploring"  },
] as const;

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: "3px", padding: "0 22px", marginTop: "34px" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1, height: "2.5px", borderRadius: "999px",
            background:
              i < step - 1  ? "var(--gold)"
              : i === step - 1 ? "rgba(201,168,76,0.4)"
              : "rgba(255,255,255,0.08)",
          }}
        />
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: "8px", fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.14em", color: "var(--t3)", marginBottom: "4px",
    }}>
      {children}
    </p>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--s3)",
  border: "1px solid var(--b2)",
  borderRadius: "11px",
  padding: "10px 13px",
  fontSize: "12px",
  color: "var(--t1)",
  outline: "none",
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();

  const [fullName,        setFullName]        = useState("");
  const [majors,          setMajors]          = useState<string[]>([]);
  const [majorError,      setMajorError]      = useState<string | null>(null);
  const [minors,          setMinors]          = useState<string[]>([]);
  const [minorError,      setMinorError]      = useState<string | null>(null);
  const [preProfessional, setPreProfessional] = useState<PreProf>(null);
  const [target,          setTarget]          = useState("internship");
  const [submitError,     setSubmitError]     = useState("");
  const [loading,         setLoading]         = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/");
  }, [router]);

  const firstName      = fullName.trim().split(/\s+/)[0] || "";
  const showMicroWin   = fullName.trim().length > 0;
  const cohort         = (majors.length > 0 || preProfessional)
    ? detectCohort(majors, preProfessional)
    : "";
  const showCohortCard = cohort.length > 0;
  const cohortCopy     = cohort ? COHORT_COPY[cohort] : null;
  const canContinue    = fullName.trim().length >= 2 && majors.length >= 1;

  function handleAddMajor(value: string) {
    if (value.startsWith("__INVALID__:")) {
      setMajorError("That major isn't in our list yet. Select from the dropdown.");
      return;
    }
    if (!APPROVED_MAJORS_SET.has(value)) return;
    if (majors.includes(value) || majors.length >= 3) return;
    setMajors((prev) => [...prev, value]);
    setMajorError(null);
  }

  function handleAddMinor(value: string) {
    if (value.startsWith("__INVALID__:")) {
      setMinorError("That major isn't in our list yet. Select from the dropdown.");
      return;
    }
    if (!APPROVED_MAJORS_SET.has(value)) return;
    if (minors.includes(value) || minors.length >= 2) return;
    setMinors((prev) => [...prev, value]);
    setMinorError(null);
  }

  async function handleContinue() {
    if (!canContinue || loading) return;
    setLoading(true);
    setSubmitError("");
    try {
      const resolvedCohort = cohort || "General";
      const targetLabel    = TARGET_OPTIONS.find((o) => o.value === target)?.label ?? "Internship · Summer 2026";
      const preProfToSend  = preProfessional === "None / Not applicable" ? null : preProfessional;

      await patchProfile({
        name:                   fullName.trim(),
        major:                  majors[0] || "",
        majors,
        minors,
        pre_professional_track: preProfToSend,
        application_target:     target,
        track:                  resolvedCohort,   // backward compat
        cohort:                 resolvedCohort,
        onboarding_complete:    false,
      });

      sessionStorage.setItem("dilly_onboarding_name",         fullName.trim());
      sessionStorage.setItem("dilly_onboarding_cohort",       resolvedCohort);
      sessionStorage.setItem("dilly_onboarding_track",        resolvedCohort); // compat
      sessionStorage.setItem("dilly_onboarding_major",        majors[0] || "");
      sessionStorage.setItem("dilly_onboarding_target",       target);
      sessionStorage.setItem("dilly_onboarding_target_label", targetLabel);

      // Quantitative cohort or Data Science → industry-target screen first
      if (needsIndustryTarget(resolvedCohort, majors)) {
        router.push("/onboarding/industry-target");
      } else {
        router.push("/onboarding/you-are-in");
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <button
        onClick={() => router.push("/onboarding/verify")}
        style={{
          background: "none", border: "none", padding: "16px 22px 0",
          fontSize: "13px", fontWeight: 500, color: "var(--blue)",
          cursor: "pointer", alignSelf: "flex-start",
        }}
      >
        ← Back
      </button>

      <ProgressBar step={2} total={6} />

      <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 24px", display: "flex", flexDirection: "column" }}>

        <div style={{ paddingTop: "40px", marginBottom: "14px" }}>
          <p style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--gold)", marginBottom: "7px" }}>
            Step 1 of 2 · Your profile
          </p>
          <h1
            className="font-playfair"
            style={{ fontSize: "22px", fontWeight: 700, color: "var(--t1)", lineHeight: 1.2, marginBottom: "5px" }}
          >
            Tell me about yourself.
          </h1>
          <p style={{ fontSize: "11px", color: "var(--t2)", lineHeight: 1.5 }}>
            Dilly scores you against the right cohort and peers — he needs this to do it right.
          </p>
        </div>

        {/* Field 1: Full name */}
        <div style={{ marginBottom: "14px" }}>
          <Label>Full name</Label>
          <input
            type="text"
            placeholder="e.g. Dilan Kochhar"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={inputStyle}
            autoComplete="name"
          />
          <div className={`slide-reveal${showMicroWin ? " open" : ""}`}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", paddingTop: "8px" }}>
              <div style={{
                width: "16px", height: "16px", borderRadius: "50%", flexShrink: 0,
                background: "var(--gdim)", border: "1px solid var(--gbdr)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <CheckIcon />
              </div>
              <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--green)" }}>
                Perfect, {firstName}. You&apos;re in the right place.
              </p>
            </div>
          </div>
        </div>

        {/* Field 2: Major(s) */}
        <div style={{ marginBottom: "14px" }}>
          <Label>
            Your major{majors.length > 0 ? ` (${majors.length}/3)` : ""}
          </Label>
          <TagAutocomplete
            tags={majors}
            maxTags={3}
            options={APPROVED_MAJORS}
            placeholder="e.g. Data Science"
            onAdd={handleAddMajor}
            onRemove={(v) => setMajors((prev) => prev.filter((m) => m !== v))}
            error={majorError}
            onClearError={() => setMajorError(null)}
          />

          {/* Cohort reveal card */}
          <div
            className={`slide-reveal${showCohortCard ? " open" : ""}`}
            style={{ maxHeight: showCohortCard ? "90px" : "0" }}
          >
            {cohortCopy && (
              <div style={{
                marginTop: "8px",
                background: "var(--golddim)", border: "1px solid var(--goldbdr)",
                borderRadius: "10px", padding: "8px 11px",
                display: "flex", gap: "7px",
              }}>
                <div style={{
                  width: "5px", height: "5px", borderRadius: "50%",
                  background: "var(--gold)", flexShrink: 0, marginTop: "5px",
                }} />
                <div>
                  <p style={{ fontSize: "10px", color: "var(--gold)", lineHeight: 1.5, fontWeight: 600, marginBottom: "2px" }}>
                    {cohortCopy.label} detected.
                  </p>
                  <p style={{ fontSize: "10px", color: "var(--gold)", lineHeight: 1.5, fontWeight: 400 }}>
                    {cohortCopy.description}{" "}
                    <strong>{cohortCopy.emphasis}</strong>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Field 3: Pre-professional track */}
        <div style={{ marginBottom: "14px" }}>
          <Label>Pre-professional track (optional)</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {PRE_PROF_OPTIONS.map((opt) => {
              const selected = preProfessional === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPreProfessional(selected ? null : opt)}
                  style={{
                    background:   selected ? "var(--golddim)" : "var(--s3)",
                    border:       `1px solid ${selected ? "var(--goldbdr)" : "var(--b2)"}`,
                    borderRadius: "999px",
                    padding:      "5px 12px",
                    fontSize:     "11px",
                    fontWeight:   selected ? 600 : 500,
                    color:        selected ? "var(--gold)" : "var(--t2)",
                    cursor:       "pointer",
                    transition:   "background 0.12s, border-color 0.12s, color 0.12s",
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Field 4: Minor(s) */}
        <div style={{ marginBottom: "14px" }}>
          <Label>
            Minor (optional){minors.length > 0 ? ` (${minors.length}/2)` : ""}
          </Label>
          <TagAutocomplete
            tags={minors}
            maxTags={2}
            options={APPROVED_MAJORS}
            placeholder="e.g. Mathematics"
            onAdd={handleAddMinor}
            onRemove={(v) => setMinors((prev) => prev.filter((m) => m !== v))}
            error={minorError}
            onClearError={() => setMinorError(null)}
          />
        </div>

        {/* Field 5: Application target */}
        <div style={{ marginBottom: "4px" }}>
          <Label>What are you aiming for?</Label>
          <div style={{ position: "relative" }}>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              style={{ ...inputStyle, appearance: "none", WebkitAppearance: "none", cursor: "pointer", paddingRight: "36px" }}
            >
              {TARGET_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div style={{ position: "absolute", right: "13px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <ChevronIcon />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: "12px" }} />

        {submitError && (
          <p style={{ fontSize: "11px", color: "var(--coral)", marginBottom: "8px", textAlign: "center" }}>
            {submitError}
          </p>
        )}

        <button
          onClick={handleContinue}
          disabled={!canContinue || loading}
          style={{
            width: "100%",
            background:    canContinue && !loading ? "var(--red)" : "var(--s3)",
            color:         canContinue && !loading ? "white"      : "var(--t3)",
            border:        "none",
            borderRadius:  "13px",
            padding:       "13px",
            fontSize:      "13px",
            fontWeight:    700,
            cursor:        canContinue && !loading ? "pointer" : "default",
            opacity:       canContinue || loading ? 1 : 0.5,
            transition:    "background 0.15s, color 0.15s, opacity 0.15s",
            pointerEvents: !canContinue || loading ? "none" : "auto",
            marginTop:     "12px",
          }}
        >
          {loading ? "Saving…" : "Continue →"}
        </button>
      </div>
    </div>
  );
}
