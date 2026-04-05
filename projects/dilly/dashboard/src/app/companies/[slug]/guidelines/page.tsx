"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { dilly } from "@/lib/dilly";
import { LoaderOne } from "@/components/ui/loader-one";


/**
 * Public company guidelines page (no auth).
 * Shows hiring guidelines in a voice-friendly, scannable format.
 * Used for "company pages on the website" and shareable links.
 */
export default function CompanyGuidelinesPage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  const [data, setData] = useState<{
    slug: string;
    display_name: string;
    criteria_source?: string;
    confidence?: string;
    dilly_scores?: { min_smart?: number; min_grit?: number; min_build?: number; min_final_score?: number };
    criteria_for_llm?: string;
    voice_friendly_bullets?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    dilly.fetch(`/companies/${encodeURIComponent(slug)}/guidelines`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) setError("Company not found.");
          else setError("Could not load guidelines.");
          return null;
        }
        return res.json();
      })
      .then((d) => setData(d ?? null))
      .catch(() => setError("Could not load guidelines."))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading && !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-900 p-4">
        <LoaderOne color="#C8102E" size={12} />
        <p className="text-sm text-slate-500">Loading guidelines…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 flex flex-col gap-4">
        <Link href="/" className="text-sm text-[var(--m-accent)] hover:underline">
          ← Dilly
        </Link>
        <p className="text-slate-500">{error ?? "Company not found."}</p>
      </div>
    );
  }

  const bullets = data.voice_friendly_bullets ?? [];
  const hasScores = data.dilly_scores && (
    data.dilly_scores.min_smart != null ||
    data.dilly_scores.min_grit != null ||
    data.dilly_scores.min_build != null ||
    data.dilly_scores.min_final_score != null
  );

  return (
    <div
      className="min-h-screen bg-slate-900 text-slate-200 p-4 pb-12"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-lg mx-auto">
        <Link href="/" className="text-sm text-[var(--m-accent)] hover:underline mb-4 inline-block">
          ← Dilly
        </Link>
        <h1 className="text-xl font-bold text-slate-100 mb-1">{data.display_name}</h1>
        <p className="text-xs text-slate-500 mb-6">
          Hiring guidelines from public sources. Dilly makes them easy to scan and use.
        </p>

        {hasScores && data.dilly_scores && (
          <section className="rounded-xl border p-4 mb-6 border-slate-600 bg-slate-800/40">
            <h2 className="text-sm font-semibold text-slate-200 mb-2">Score bar (typical bar for this employer)</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {data.dilly_scores.min_smart != null && (
                <div>
                  <span className="text-slate-500">Smart</span>
                  <span className="ml-2 font-medium">{Math.round(data.dilly_scores.min_smart)}</span>
                </div>
              )}
              {data.dilly_scores.min_grit != null && (
                <div>
                  <span className="text-slate-500">Grit</span>
                  <span className="ml-2 font-medium">{Math.round(data.dilly_scores.min_grit)}</span>
                </div>
              )}
              {data.dilly_scores.min_build != null && (
                <div>
                  <span className="text-slate-500">Build</span>
                  <span className="ml-2 font-medium">{Math.round(data.dilly_scores.min_build)}</span>
                </div>
              )}
              {data.dilly_scores.min_final_score != null && (
                <div>
                  <span className="text-slate-500">Overall</span>
                  <span className="ml-2 font-medium">{Math.round(data.dilly_scores.min_final_score)}</span>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="rounded-xl border p-4 border-slate-600 bg-slate-800/40">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">What they look for</h2>
          {bullets.length > 0 ? (
            <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-300">
              {bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{data.criteria_for_llm || "No guidelines available."}</p>
          )}
          {data.criteria_source && (
            <p className="text-xs text-slate-500 mt-3">Source: {data.criteria_source}</p>
          )}
          {data.confidence && (
            <p className="text-xs text-slate-500 mt-0.5">Confidence: {data.confidence}</p>
          )}
        </section>

        <p className="text-xs text-slate-500 mt-6">
          Dilly uses these guidelines to score resumes and match you to roles. Sign in to see your scores vs this bar and get personalized recommendations.
        </p>
      </div>
    </div>
  );
}
