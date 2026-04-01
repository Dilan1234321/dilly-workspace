"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { LoaderOne } from "@/components/ui/loader-one";
import { toPunchyFindings, scoreColor as scoreColorFromUtils } from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import type { AuditV2 } from "@/types/dilly";

type PublicProfile = {
  name?: string | null;
  track?: string | null;
  career_goal?: string | null;
  profile_slug?: string;
  profile_background_color?: string;
  profile_tagline?: string | null;
  profile_bio?: string | null;
  school_name?: string | null;
  school_short_name?: string | null;
  majors?: string[] | null;
  scores?: { smart: number; grit: number; build: number };
  final_score?: number;
  audit_findings?: string[];
  candidate_name?: string | null;
  detected_track?: string | null;
  peer_percentiles?: { smart: number; grit: number; build: number };
  dilly_take?: string | null;
  linkedin_url?: string | null;
  strongest_signal_sentence?: string | null;
  share_card_achievements?: string[] | null;
};

function scoreColor(score: number): string {
  return scoreColorFromUtils(score).color;
}

function buildTagline(data: PublicProfile): string {
  if (data.profile_tagline?.trim()) return data.profile_tagline.trim();
  const track = (data.track || data.detected_track || "").trim() || "Student";
  const percs = data.peer_percentiles;
  if (percs) {
    const keys = ["smart", "grit", "build"] as const;
    const best = keys.reduce<{ key: "smart" | "grit" | "build"; topPct: number }>(
      (acc, k) => {
        const topPct = Math.max(1, 100 - (percs[k] ?? 50));
        return topPct < acc.topPct ? { key: k, topPct } : acc;
      },
      { key: "smart", topPct: 100 }
    );
    const label = best.key.charAt(0).toUpperCase() + best.key.slice(1);
    return `${track} · Top ${best.topPct}% ${label}`;
  }
  return `${track} Track`;
}

function oneLineHook(data: PublicProfile): string {
  if ((data.dilly_take ?? data.dilly_take)?.trim()) return (data.dilly_take ?? data.dilly_take)!.trim();
  const track = (data.track || data.detected_track || "").trim() || "your field";
  const scores = data.scores ?? { smart: 0, grit: 0, build: 0 };
  const name = data.candidate_name || data.name || "Student";
  const audit: AuditV2 = {
    scores,
    audit_findings: data.audit_findings ?? [],
    recommendations: [],
    detected_track: track,
    candidate_name: name,
    major: "",
    final_score: (scores.smart + scores.grit + scores.build) / 3,
    evidence: {},
    raw_logs: [],
    dilly_take: data.dilly_take ?? data.dilly_take ?? undefined,
    peer_percentiles: data.peer_percentiles,
  };
  const keys = ["smart", "grit", "build"] as const;
  const low = keys.reduce<{ key: "smart" | "grit" | "build"; score: number }>(
    (acc, k) => (scores[k] < acc.score ? { key: k, score: scores[k] } : acc),
    { key: keys[0], score: scores[keys[0]] }
  );
  const high = keys.reduce<{ key: "smart" | "grit" | "build"; score: number }>(
    (acc, k) => (scores[k] > acc.score ? { key: k, score: scores[k] } : acc),
    { key: keys[0], score: scores[keys[0]] }
  );
  const dimLabel = high.key.charAt(0).toUpperCase() + high.key.slice(1);
  const topPct = data.peer_percentiles ? Math.max(1, 100 - (data.peer_percentiles[high.key] ?? 50)) : null;
  if (topPct && topPct <= 25) {
    return `Strong ${dimLabel} signal for ${track}${low.score < 55 ? ". Room to grow elsewhere." : "."}`;
  }
  return `Scored for ${track}. Smart ${Math.round(scores.smart)}, Grit ${Math.round(scores.grit)}, Build ${Math.round(scores.build)}.`;
}

export default function SixSecondProfilePageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ backgroundColor: "var(--dilly-bg)" }}>
        <LoaderOne color="#c9a882" size={12} />
      </div>
    }>
      <SixSecondProfilePage />
    </Suspense>
  );
}

function SixSecondProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = typeof params.slug === "string" ? params.slug : null;
  const isPreview = searchParams.get("preview") === "1";
  const [data, setData] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError("Invalid profile");
      return;
    }
    dilly.fetch(`/profile/public/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Profile not found");
        return res.json();
      })
      .then(setData)
      .catch(() => setError("Profile not found"))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleDownloadPdf = () => {
    window.print();
  };

  const handleDownloadImage = async () => {
    if (!profileRef.current) return;
    try {
      const canvas = await html2canvas(profileRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `dilly-profile-${(data?.name || "profile").replace(/\s+/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ backgroundColor: "var(--dilly-bg)" }}>
        <LoaderOne color="#c9a882" size={12} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--dilly-bg)" }}>
        <p className="text-slate-400">{error || "Profile not found"}</p>
      </div>
    );
  }

  const name = (data.name || data.candidate_name || "Student").trim();
  const tagline = buildTagline(data);
  const hook = oneLineHook(data);
  const scores = data.scores ?? { smart: 0, grit: 0, build: 0 };
  const fs = data.final_score ?? 0;
  const track = (data.track || data.detected_track || "").trim() || "Humanities";
  const schoolMajorLine = [
    data.school_name || data.school_short_name || "",
    (data.majors && data.majors.length > 0) ? data.majors.join(", ") : "",
  ].filter(Boolean).join(" · ");
  const auditForFindings: AuditV2 = {
    scores,
    audit_findings: data.audit_findings ?? [],
    recommendations: [],
    detected_track: track,
    candidate_name: name,
    major: "",
    final_score: fs,
    evidence: {},
    raw_logs: [],
    peer_percentiles: data.peer_percentiles,
  };
  const punchyFindings = toPunchyFindings(auditForFindings);
  const displayFindings = punchyFindings.length > 0 ? punchyFindings : ["Dilly Truth Standard · Your resume, scored."];
  const hasAudit = data.scores && (data.scores.smart + data.scores.grit + data.scores.build) > 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--dilly-bg)" }}>
      {/* Preview mode: banner so student sees what recruiters see */}
      {isPreview && (
        <div className="print:hidden sticky top-0 z-[60] w-full py-3 px-4 text-center text-sm font-medium text-slate-200 bg-amber-600/90 border-b border-amber-500/50">
          What a recruiter sees in 6 seconds. Add this link to your resume so they see you at your best.
        </div>
      )}
      <div className={`print:hidden fixed right-4 z-50 flex gap-2 ${isPreview ? "top-14" : "top-4"}`}>
        <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="bg-slate-800 border-slate-600 text-slate-200">
          Download PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownloadImage} className="border-[var(--dilly-border)] text-[var(--dilly-taupe-bright)]" style={{ backgroundColor: "var(--dilly-surface)" }}>
          Download Image
        </Button>
      </div>

      <div
        ref={profileRef}
        className="mx-auto max-w-[680px] min-h-[100vh] px-6 py-8 sm:px-10 sm:py-12 print:max-w-[8.5in] print:min-h-[11in] print:p-12 bg-white"
      >
        {/* ─── 0–1s: Who ─── */}
        <header className="flex gap-5 sm:gap-6 items-start mb-8">
          <div className="shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-slate-200 bg-slate-100 flex items-center justify-center">
            {slug && !photoError ? (
              <img
                src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/profile/public/${slug}/photo`}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setPhotoError(true)}
              />
            ) : (
              <span className="text-3xl sm:text-4xl font-bold text-slate-400" aria-hidden>{(name || "?")[0]}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">{name}</h1>
              {data?.linkedin_url && (
                <a
                  href={data.linkedin_url.startsWith("http") ? data.linkedin_url : `https://${data.linkedin_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-500 hover:text-[#0a66c2] hover:bg-slate-100 transition-colors"
                  title="View LinkedIn profile"
                  aria-label="View LinkedIn profile"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              )}
            </div>
            <p className="text-slate-600 text-sm sm:text-base mt-1">{tagline}</p>
            {schoolMajorLine && (
              <p className="text-slate-500 text-xs sm:text-sm mt-1">{schoolMajorLine}</p>
            )}
          </div>
        </header>

        {hasAudit ? (
          <>
            {/* ─── 1–3s: Why this candidate (hook + strongest signal) ─── */}
            <section className="mb-6">
              <p className="text-slate-800 text-lg sm:text-xl leading-snug font-medium">{hook}</p>
              {data.strongest_signal_sentence?.trim() && (
                <div className="mt-3 pl-3 border-l-2 border-slate-300">
                  <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">Proof</p>
                  <p className="text-slate-700 text-sm sm:text-base mt-0.5 leading-snug">{data.strongest_signal_sentence.trim()}</p>
                </div>
              )}
            </section>

            {/* ─── 3–4s: Dilly score + dimensions as button-like fields ─── */}
            <section className="mb-6">
              <div className="flex flex-wrap gap-3">
                {typeof fs === "number" && (
                  <div className="inline-flex flex-col items-center justify-center min-w-[72px] px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Score</span>
                    <span className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: scoreColor(fs) }}>{Math.round(fs)}</span>
                  </div>
                )}
                {(["smart", "grit", "build"] as const).map((key) => {
                  const s = scores[key] ?? 0;
                  const c = scoreColor(s);
                  const topPct = data.peer_percentiles?.[key] != null ? Math.max(1, 100 - (data.peer_percentiles[key] ?? 50)) : null;
                  const label = key.charAt(0).toUpperCase() + key.slice(1);
                  return (
                    <div
                      key={key}
                      className="inline-flex flex-col items-center justify-center min-w-[72px] px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
                      <span className="text-xl font-bold tabular-nums mt-0.5" style={{ color: c }}>{Math.round(s)}</span>
                      {topPct != null && (
                        <span className="text-[10px] text-slate-500 mt-0.5">Top {topPct}%</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ─── 4–5s: Key findings ─── */}
            <section className="mb-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">What Dilly sees</p>
              <ul className="space-y-1.5">
                {displayFindings.slice(0, 3).map((line, i) => (
                  <li key={i} className="text-slate-700 text-sm flex gap-2">
                    <span className="text-slate-500 shrink-0">•</span>
                    <span className="leading-snug">{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <section className="mb-6">
            <p className="text-slate-500 text-sm">
              Scores and key findings will appear here after the candidate runs their first Dilly audit.
            </p>
          </section>
        )}

        {/* ─── 5–6s: Goal + optional bio ─── */}
        <section className="pt-4 border-t border-slate-200">
          {data.career_goal?.trim() && (
            <p className="text-slate-600 text-sm">
              <span className="font-semibold text-slate-500">Targeting:</span> {data.career_goal.trim()}
            </p>
          )}
          {data.profile_bio?.trim() && (
            <p className="text-slate-500 text-sm mt-2 italic leading-relaxed">&ldquo;{data.profile_bio.trim()}&rdquo;</p>
          )}
        </section>

        {/* Footer — signal that this is the candidate's curated profile */}
        <footer className="mt-10 pt-6 border-t border-slate-200">
          <p className="text-[10px] text-slate-500">
            {typeof window !== "undefined" ? `${window.location.origin}/p/${data.profile_slug}` : `trydilly.com/p/${data.profile_slug}`}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Curated by {name}. Dilly — your story in 6 seconds.
          </p>
        </footer>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
