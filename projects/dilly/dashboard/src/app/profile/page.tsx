"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AUTH_TOKEN_KEY, API_BASE } from "@/lib/dillyUtils";
import { AppProfileHeader } from "@/components/career-center";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Button } from "@/components/ui/button";

type DillyProfile = {
  profile_slug?: string;
  name?: string;
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
  privacy?: Record<string, boolean>;
  dilly_profile_visible_to_recruiters?: boolean;
};

export default function DillyProfilePage() {
  const [profile, setProfile] = useState<DillyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/profile/dilly`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setProfile(p ?? null))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen />;
  if (!profile || !profile.profile_slug) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center justify-center">
        <p className="text-slate-400 mb-4">Sign in to view your Dilly profile.</p>
        <Link href="/">
          <Button variant="outline">Go to Dilly</Button>
        </Link>
      </div>
    );
  }

  const slug = profile.profile_slug;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${slug}/full` : `/p/${slug}/full`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 career-center-talent">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <AppProfileHeader back="/" className="mb-4" />
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-amber-400/90">My Dilly Profile</h1>
          <p className="text-slate-400 text-sm mt-1">
            Everything you&apos;ve done in Dilly — for your reflection. Share with recruiters if you choose.
          </p>
        </header>

        {/* Share */}
        <section className="mb-8 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
          <h2 className="text-sm font-medium text-slate-300 mb-2">Share your full profile</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-300"
            />
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500/50 text-amber-400"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
              }}
            >
              Copy link
            </Button>
            <Link href={`/p/${slug}/full`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline">
                View as recruiter
              </Button>
            </Link>
          </div>
          <Link href="/settings#trust" className="text-amber-400/80 text-sm mt-2 inline-block">
            Privacy settings →
          </Link>
        </section>

        {/* Identity */}
        <section className="mb-8">
          <h2 className="text-lg font-medium text-slate-200 mb-4">Identity</h2>
          <div className="space-y-2 text-slate-300">
            <p><span className="text-slate-500">Name:</span> {profile.name || "—"}</p>
            <p><span className="text-slate-500">School:</span> {profile.school_name || profile.school_short_name || "—"}</p>
            <p><span className="text-slate-500">Major(s):</span> {(profile.majors || profile.major ? [...(profile.majors || []), profile.major].filter(Boolean).join(", ") : "—") || "—"}</p>
            {(() => {
              const minors = (profile.minors ?? []).filter((m) => m && !/^(N\/A|NA|N|A)$/i.test(String(m).trim()));
              return minors.length ? <p><span className="text-slate-500">Minor(s):</span> {minors.join(", ")}</p> : null;
            })()}
            <p><span className="text-slate-500">Track:</span> {profile.track || "—"}</p>
            <p><span className="text-slate-500">Career goal:</span> {profile.career_goal || "—"}</p>
            <p><span className="text-slate-500">Application target:</span> {profile.application_target?.replace("_", " ") || "—"}</p>
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
            {profile.audit_count != null && <p className="text-slate-500 text-sm mt-1">{profile.audit_count} audit{profile.audit_count !== 1 ? "s" : ""}</p>}
          </section>
        )}

        {/* Activity */}
        {profile.applications_summary && (
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

        <footer className="mt-12 pt-6 border-t border-slate-700">
          <Link href="/" className="text-amber-400/80 text-sm">
            ← Back to Dilly
          </Link>
        </footer>
      </div>
    </div>
  );
}
