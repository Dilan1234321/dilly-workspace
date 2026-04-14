"use client";

/**
 * PublicProfile - the public-facing Dilly profile page.
 *
 * Clean, light mode, premium typography. No clutter.
 * Shows: name, photo, school/company, major, class year, cities,
 *        tagline, skills, career interests, experience, goals.
 *
 * This is NOT a resume. It is not LinkedIn. It is the page that makes
 * someone say "I want to hire this person" in under 10 seconds.
 */

import { useEffect, useState } from "react";
import Image from "next/image";

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.trydilly.com";

interface ProfileData {
  name: string;
  slug: string;
  user_type: string;
  is_student: boolean;
  tagline: string | null;
  school: string | null;
  majors: string[];
  minors: string[];
  class_year: string | null;
  cities: string[];
  career_fields: string[];
  career_interests: string[];
  skills: { label: string; confidence: string }[];
  impact_statements: { label: string; value: string }[];
  experience: { role: string; organization: string; skills: string[] }[];
  photo_url: string;
  has_photo: boolean;
}

function SkillPill({ label, confidence }: { label: string; confidence: string }) {
  const size = confidence === "high" ? "text-sm font-semibold" : "text-xs font-medium";
  const opacity = confidence === "high" ? "opacity-100" : "opacity-75";
  return (
    <span
      className={`inline-block px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 ${size} ${opacity}`}
    >
      {label}
    </span>
  );
}

function ExperienceCard({ role, organization, skills }: { role: string; organization: string; skills: string[] }) {
  return (
    <div className="border-l-2 border-indigo-300 pl-4 py-1">
      <p className="text-sm font-semibold text-slate-800">{role}</p>
      {organization && <p className="text-xs text-slate-500">{organization}</p>}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {skills.map((s, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ImpactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
      {label && <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">{label}</p>}
      <p className="text-sm text-slate-700 leading-relaxed">{value}</p>
    </div>
  );
}

export default function PublicProfile({ slug, prefix }: { slug: string; prefix: "s" | "p" }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API}/profile/web/${slug}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-full bg-slate-200" />
          <div className="w-48 h-4 rounded bg-slate-200" />
          <div className="w-32 h-3 rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <p className="text-slate-400 text-lg">Profile not found</p>
        <a href="https://hellodilly.com" className="text-indigo-500 text-sm hover:underline">
          hellodilly.com
        </a>
      </div>
    );
  }

  const p = profile;
  const photoUrl = `${API}/profile/web/${slug}/photo`;
  const initial = p.name ? p.name[0].toUpperCase() : "?";
  const subtitle = p.is_student
    ? [p.majors?.[0], p.school, p.class_year ? `Class of ${p.class_year}` : null].filter(Boolean).join(" | ")
    : [p.career_fields?.[0], p.cities?.[0]].filter(Boolean).join(" | ");

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="max-w-2xl mx-auto px-6 pt-16 pb-8">
        {/* Photo + Name */}
        <div className="flex flex-col items-center text-center">
          {p.has_photo ? (
            <img
              src={photoUrl}
              alt={p.name}
              className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-lg"
            />
          ) : (
            <div className="w-28 h-28 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-4xl font-bold text-white">{initial}</span>
            </div>
          )}

          <h1 className="text-3xl font-bold text-slate-900 mt-6 tracking-tight">
            {p.name}
          </h1>

          {subtitle && (
            <p className="text-sm text-slate-500 mt-2 max-w-md">{subtitle}</p>
          )}

          {p.tagline && (
            <p className="text-base text-slate-600 mt-3 italic max-w-lg leading-relaxed">
              {p.tagline}
            </p>
          )}

          {/* Cities */}
          {p.cities.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {p.cities.map((city, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  {city}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="h-px bg-slate-200" />
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">

        {/* Impact Statements */}
        {p.impact_statements.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              What I Bring
            </h2>
            <div className="space-y-3">
              {p.impact_statements.map((s, i) => (
                <ImpactCard key={i} label={s.label} value={s.value} />
              ))}
            </div>
          </section>
        )}

        {/* Skills */}
        {p.skills.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              Skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {p.skills.map((s, i) => (
                <SkillPill key={i} label={s.label} confidence={s.confidence} />
              ))}
            </div>
          </section>
        )}

        {/* Career Interests */}
        {p.career_interests.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              Interested In
            </h2>
            <div className="flex flex-wrap gap-2">
              {p.career_interests.map((interest, i) => (
                <span key={i} className="text-sm px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-medium">
                  {interest}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Experience */}
        {p.experience.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              Experience
            </h2>
            <div className="space-y-4">
              {p.experience.map((exp, i) => (
                <ExperienceCard key={i} {...exp} />
              ))}
            </div>
          </section>
        )}

        {/* Education details for students */}
        {p.is_student && (p.majors.length > 0 || p.minors.length > 0) && (
          <section>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              Education
            </h2>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              {p.school && <p className="text-sm font-semibold text-slate-800">{p.school}</p>}
              {p.majors.length > 0 && (
                <p className="text-sm text-slate-600 mt-1">
                  {p.majors.length === 1 ? "Major" : "Majors"}: {p.majors.join(", ")}
                </p>
              )}
              {p.minors.length > 0 && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {p.minors.length === 1 ? "Minor" : "Minors"}: {p.minors.join(", ")}
                </p>
              )}
              {p.class_year && (
                <p className="text-xs text-slate-400 mt-1">Class of {p.class_year}</p>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-2xl mx-auto px-6 pb-16 pt-4">
        <div className="h-px bg-slate-200 mb-6" />
        <div className="flex justify-center">
          <a href="https://hellodilly.com" className="opacity-40 hover:opacity-60 transition-opacity">
            <img src="/dilly-wordmark.png" alt="Dilly" className="h-5" />
          </a>
        </div>
      </div>
    </div>
  );
}
