"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { scoreColor, PENDING_VOICE_KEY, getCareerCenterReturnPath } from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import { getSchoolFromEmail } from "@/lib/schools";
import { getCertificationsForTrack } from "@/lib/certificationsHub";
import type { TrackKey } from "@/lib/trackDefinitions";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Button } from "@/components/ui/button";

type RequiredScores = {
  min_smart?: number;
  min_grit?: number;
  min_build?: number;
  min_final_score?: number;
  track?: string;
} | null;

type CompanyBreakdown = {
  company: {
    slug: string;
    display_name: string;
    source: string;
    dilly_scores: RequiredScores extends infer R ? R : object;
    criteria_for_llm?: string;
    criteria_source?: string;
    confidence?: string;
    voice_friendly_bullets?: string[];
  };
  your_scores: { smart?: number; grit?: number; build?: number; final_score?: number; track?: string } | null;
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    job_type?: string;
    required_scores?: RequiredScores;
    match_tier?: "target" | "reach";
    to_land_this?: string | null;
    application_email?: string | null;
  }>;
  recruiter_advice: Array<{ text: string; created_at?: string; source?: string }>;
  certifications_track: string | null;
};

function capTrack(t: string | null | undefined): TrackKey | null {
  if (!t || typeof t !== "string") return null;
  const s = t.trim();
  if (!s) return null;
  return (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()) as TrackKey;
}

export default function CompanyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<{ email: string; subscribed: boolean } | null>(null);
  const [school, setSchool] = useState<ReturnType<typeof getSchoolFromEmail>>(null);
  const [data, setData] = useState<CompanyBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const theme = { primary: school?.theme?.primary ?? "#C8102E" };

  useEffect(() => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("dilly_auth_token") : null;
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional
      setAuthLoading(false);
      router.replace("/");
      return;
    }
    dilly.fetch("/auth/me")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((d) => {
        const u = { email: d?.email ?? "", subscribed: !!d?.subscribed };
        setUser(u);
        if (!u.subscribed) router.replace("/");
        setSchool(getSchoolFromEmail(u.email));
      })
      .catch(() => router.replace("/"))
      .finally(() => setAuthLoading(false));
  }, [router]);

  useEffect(() => {
    if (!slug || !user?.subscribed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional
    setLoading(true);
    setError(null);
    dilly.fetch(`/companies/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) setError("Company not found.");
          else setError("Could not load company.");
          return null;
        }
        return res.json();
      })
      .then((d) => {
        setData(d ?? null);
      })
      .catch(() => setError("Could not load company."))
      .finally(() => setLoading(false));
  }, [slug, user?.subscribed]);

  if (authLoading || !user?.subscribed) {
    return (
      <LoadingScreen message="Loading…" className="m-app app-talent" />
    );
  }

  if (loading && !data) {
    return (
      <LoadingScreen message="Loading company…" className="m-app app-talent" />
    );
  }

  if (error || !data) {
    return (
      <div className="m-app app-talent min-h-screen flex flex-col p-4">
        <Link href="/companies" className="cc-btn cc-btn-ghost text-sm mb-4 inline-flex">
          ← Companies
        </Link>
        <p className="cc-text-muted">{error ?? "Company not found."}</p>
      </div>
    );
  }

  const { company, your_scores, jobs, recruiter_advice, certifications_track } = data;
  const req = company.dilly_scores as RequiredScores;
  const trackKey = capTrack(certifications_track ?? req?.track);
  const certs = trackKey ? getCertificationsForTrack(trackKey) : [];

  return (
    <div
      className={`m-app app-talent min-h-screen ${school?.id === "utampa" ? "school-theme-ut" : ""}`}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <header className="m-header shrink-0">
        <div className="m-header-inner">
          <Link href="/companies" className="cc-btn cc-btn-ghost flex items-center gap-2 min-h-[44px] min-w-[44px] -ml-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Companies</span>
          </Link>
          <h1 className="te-hero-title text-base truncate">{company.display_name}</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="flex-1 overflow-auto pt-0 px-4 pb-24 space-y-6">
        {/* Score requirements + your scores */}
        <section className="cc-card rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Score bar</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {req?.min_smart != null && (
              <div>
                <span className="text-slate-500">Smart</span>
                <span className="ml-2 font-medium text-slate-200">{Math.round(req.min_smart)}</span>
                {your_scores?.smart != null && (
                  <span className="ml-1.5 text-xs" style={{ color: scoreColor(your_scores.smart).color }}>
                    (you: {Math.round(your_scores.smart)})
                  </span>
                )}
              </div>
            )}
            {req?.min_grit != null && (
              <div>
                <span className="text-slate-500">Grit</span>
                <span className="ml-2 font-medium text-slate-200">{Math.round(req.min_grit)}</span>
                {your_scores?.grit != null && (
                  <span className="ml-1.5 text-xs" style={{ color: scoreColor(your_scores.grit).color }}>
                    (you: {Math.round(your_scores.grit)})
                  </span>
                )}
              </div>
            )}
            {req?.min_build != null && (
              <div>
                <span className="text-slate-500">Build</span>
                <span className="ml-2 font-medium text-slate-200">{Math.round(req.min_build)}</span>
                {your_scores?.build != null && (
                  <span className="ml-1.5 text-xs" style={{ color: scoreColor(your_scores.build).color }}>
                    (you: {Math.round(your_scores.build)})
                  </span>
                )}
              </div>
            )}
            {req?.min_final_score != null && (
              <div>
                <span className="text-slate-500">Overall</span>
                <span className="ml-2 font-medium text-slate-200">{Math.round(req.min_final_score)}</span>
                {your_scores?.final_score != null && (
                  <span className="ml-1.5 text-xs" style={{ color: scoreColor(your_scores.final_score).color }}>
                    (you: {Math.round(your_scores.final_score)})
                  </span>
                )}
              </div>
            )}
          </div>
          {!your_scores && (
            <p className="text-xs text-slate-500 mt-2">Your scores vs this bar appear when they&apos;re on your profile.</p>
          )}
        </section>

        {/* What they look for — voice-friendly bullets when available */}
        {(company.voice_friendly_bullets?.length || company.criteria_for_llm || company.criteria_source) ? (
          <section className="rounded-xl border p-4" style={{ backgroundColor: "var(--ut-surface-raised)", borderColor: "var(--ut-border)" }}>
            <h2 className="text-sm font-semibold text-slate-200 mb-2">What they look for</h2>
            {company.voice_friendly_bullets?.length ? (
              <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-300 mb-3">
                {company.voice_friendly_bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{company.criteria_for_llm || company.criteria_source}</p>
            )}
            {company.criteria_source && (
              <p className="text-xs text-slate-500 mt-2">Source: {company.criteria_source}</p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 min-h-[44px] m-rounded-tight border-[var(--ut-border)] text-slate-200 text-xs w-full"
              onClick={() => {
                const bullets = company.voice_friendly_bullets?.length
                  ? company.voice_friendly_bullets.join(" ")
                  : (company.criteria_for_llm || "").trim();
                const prompt = bullets
                  ? `Read me the hiring guidelines for ${company.display_name}: ${bullets}`
                  : `What does ${company.display_name} look for in candidates?`;
                try {
                  sessionStorage.setItem(PENDING_VOICE_KEY, prompt);
                } catch {
                  /* ignore */
                }
                router.push(getCareerCenterReturnPath());
              }}
            >
              Listen with Dilly
            </Button>
          </section>
        ) : null}

        {/* Jobs & internships */}
        <section className="rounded-xl border p-4" style={{ backgroundColor: "var(--ut-surface-raised)", borderColor: "var(--ut-border)" }}>
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Open roles</h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-slate-500">No open roles right now. Check back later.</p>
          ) : (
            <ul className="space-y-2">
              {jobs.slice(0, 15).map((j) => (
                <li key={j.id}>
                  <a
                    href={j.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-lg border border-[var(--ut-border)] hover:bg-slate-800/40 transition-colors"
                  >
                    <p className="font-medium text-slate-200 text-sm">{j.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{j.location || j.job_type || ""}</p>
                    {j.match_tier === "reach" && j.to_land_this && (
                      <p className="text-xs mt-1" style={{ color: theme.primary }}>Reach — {j.to_land_this}</p>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {jobs.length > 15 && (
            <p className="text-xs text-slate-500 mt-2">+{jobs.length - 15} more. See Jobs for full list.</p>
          )}
          <Link href="/?tab=resources&view=jobs" className="inline-block mt-3">
            <Button variant="outline" size="sm" className="min-h-[44px] m-rounded-tight border-[var(--ut-border)] text-slate-200 text-xs">
              View all jobs
            </Button>
          </Link>
        </section>

        {/* Certifications that help */}
        {certs.length > 0 && (
          <section className="rounded-xl border p-4" style={{ backgroundColor: "var(--ut-surface-raised)", borderColor: "var(--ut-border)" }}>
            <h2 className="text-sm font-semibold text-slate-200 mb-2">Certs that help</h2>
            <p className="text-xs text-slate-500 mb-3">Relevant to {company.display_name}&apos;s track.</p>
            <ul className="space-y-2">
              {certs.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--m-accent)] hover:underline"
                  >
                    {c.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recruiter advice */}
        {recruiter_advice.length > 0 && (
          <section className="rounded-xl border p-4" style={{ backgroundColor: "var(--ut-surface-raised)", borderColor: "var(--ut-border)" }}>
            <h2 className="text-sm font-semibold text-slate-200 mb-2">Recruiter advice</h2>
            <p className="text-xs text-slate-500 mb-3">Tips from recruiters who work with Dilly students.</p>
            <ul className="space-y-3">
              {recruiter_advice.map((a, i) => (
                <li key={i} className="text-sm text-slate-300 border-l-2 pl-3" style={{ borderColor: theme.primary }}>
                  {a.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="pt-4">
          <Link href="/companies">
            <Button variant="outline" size="sm" className="min-h-[44px] m-rounded-tight border-[var(--ut-border)] text-slate-200 text-xs">
              ← All companies
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
