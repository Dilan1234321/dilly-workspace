"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "@/lib/dillyUtils";
import { LoadingScreen } from "@/components/ui/loading-screen";

type DillyProfile = {
  profile_slug?: string;
  name?: string;
  linkedin_url?: string | null;
  message?: string;
  school_name?: string;
  school_short_name?: string;
  major?: string;
  majors?: string[];
  minors?: string[];
  track?: string;
  career_goal?: string;
  application_target?: string;
  job_locations?: string[];
  scores?: { smart?: number; grit?: number; build?: number };
  final_score?: number;
  dilly_take?: string;
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  audit_count?: number;
  applications_summary?: { count: number; applied: number; interviewing: number; offer: number; rejected: number };
  achievements?: string[];
  voice_topics_count?: number;
  structured_experience?: Array<{ company?: string; role?: string; date?: string; bullets?: string[] }>;
  skills?: string[];
};

export default function PublicDillyProfilePage() {
  const params = useParams();
  const slug = (params?.slug as string) || "";
  const [profile, setProfile] = useState<DillyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/profile/public/${slug}/dilly`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setProfile(p ?? null))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <LoadingScreen />;
  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center justify-center">
        <p className="text-slate-400">Profile not found.</p>
      </div>
    );
  }

  if (profile.message) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center justify-center">
        <p className="text-slate-400">{profile.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-amber-400/90">{profile.name || "Dilly Profile"}</h1>
            {profile.linkedin_url && (
              <a
                href={profile.linkedin_url.startsWith("http") ? profile.linkedin_url : `https://${profile.linkedin_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-400 hover:text-[#0a66c2] hover:bg-slate-800 transition-colors"
                title="View LinkedIn profile"
                aria-label="View LinkedIn profile"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-1">
            {profile.school_name || profile.school_short_name || ""} · {profile.track || ""}
          </p>
        </header>

        {/* Identity */}
        <section className="mb-8">
          <h2 className="text-lg font-medium text-slate-200 mb-4">About</h2>
          <div className="space-y-2 text-slate-300">
            <p><span className="text-slate-500">Major(s):</span> {(profile.majors || profile.major ? [...(profile.majors || []), profile.major].filter(Boolean).join(", ") : "—") || "—"}</p>
            {(() => {
              const minors = (profile.minors ?? []).filter((m) => m && !/^(N\/A|NA|N|A)$/i.test(String(m).trim()));
              return minors.length ? <p><span className="text-slate-500">Minor(s):</span> {minors.join(", ")}</p> : null;
            })()}
            <p><span className="text-slate-500">Career goal:</span> {profile.career_goal || "—"}</p>
            {profile.job_locations?.length ? <p><span className="text-slate-500">Locations:</span> {profile.job_locations.join(", ")}</p> : null}
          </div>
        </section>

        {/* Scores */}
        {profile.scores && (
          <section className="mb-8">
            <h2 className="text-lg font-medium text-slate-200 mb-4">Scores</h2>
            <div className="flex gap-4 flex-wrap">
              {profile.scores.smart != null && <span className="px-3 py-1 rounded-full bg-slate-700 text-amber-400">Smart {Math.round(profile.scores.smart)}</span>}
              {profile.scores.grit != null && <span className="px-3 py-1 rounded-full bg-slate-700 text-amber-400">Grit {Math.round(profile.scores.grit)}</span>}
              {profile.scores.build != null && <span className="px-3 py-1 rounded-full bg-slate-700 text-amber-400">Build {Math.round(profile.scores.build)}</span>}
            </div>
            {profile.final_score != null && <p className="text-slate-400 text-sm mt-2">Final: {Math.round(profile.final_score)}</p>}
            {profile.dilly_take && <p className="text-slate-300 mt-2 italic">&quot;{profile.dilly_take}&quot;</p>}
          </section>
        )}

        {/* Applications summary */}
        {profile.applications_summary && profile.applications_summary.count > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-medium text-slate-200 mb-4">Applications</h2>
            <div className="flex gap-4 flex-wrap text-slate-300">
              <span>{profile.applications_summary.count} total</span>
              <span>{profile.applications_summary.applied} applied</span>
              {profile.applications_summary.interviewing > 0 && <span>{profile.applications_summary.interviewing} interviewing</span>}
              {profile.applications_summary.offer > 0 && <span className="text-emerald-400">{profile.applications_summary.offer} offer(s)</span>}
            </div>
          </section>
        )}

        {/* Achievements */}
        {profile.achievements && profile.achievements.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-medium text-slate-200 mb-4">Achievements</h2>
            <div className="flex flex-wrap gap-2">
              {profile.achievements.map((a) => (
                <span key={a} className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm">
                  {a.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Skills */}
        {profile.skills && profile.skills.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-medium text-slate-200 mb-4">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s) => (
                <span key={s} className="px-3 py-1 rounded-full bg-slate-700 text-slate-300 text-sm">
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-12 pt-6 border-t border-slate-700 text-center">
          <Link href="/" className="text-amber-400/80 text-sm">
            Dilly
          </Link>
        </footer>
      </div>
    </div>
  );
}
