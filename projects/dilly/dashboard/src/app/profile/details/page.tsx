"use client";

import { useState, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { AppProfileHeader } from "@/components/career-center";
import { ProfilePhotoWithFrame } from "@/components/ProfilePhotoWithFrame";
import {
  AUTH_USER_CACHE_KEY,
  PROFILE_CACHE_KEY_BASE,
  SCHOOL_NAME_KEY,
  profilePhotoCacheKey,
  getCareerCenterReturnPath,
} from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import { getProfileFrame } from "@/lib/profileFrame";
import { getEffectiveCohortLabel, PRE_PROFESSIONAL_TRACKS } from "@/lib/trackDefinitions";

type DillyProfile = {
  profile_slug?: string;
  email?: string;
  name?: string;
  school_name?: string;
  school_short_name?: string;
  school_id?: string;
  major?: string;
  majors?: string[];
  minors?: string[];
  track?: string;
  career_goal?: string;
  application_target?: string;
  job_locations?: string[];
  job_location_scope?: string;
  profile_tagline?: string;
  profile_bio?: string;
  linkedin_url?: string;
  scores?: { smart?: number; grit?: number; build?: number };
  final_score?: number;
  dilly_take?: string;
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  audit_count?: number;
  audit_history?: { ts: number; final_score: number }[];
  applications_summary?: { count: number; applied: number; interviewing: number; offer: number; rejected: number };
  achievements?: string[];
  achievements_detail?: { id: string; name: string; unlockedAt: number }[];
  voice_topics_count?: number;
  structured_experience?: Array<{ company?: string; role?: string; date?: string; bullets?: string[] }>;
  skills?: string[];
  privacy?: Record<string, boolean>;
  dilly_profile_visible_to_recruiters?: boolean;
};

const DIM_META: { key: "smart" | "grit" | "build"; label: string; color: string; dim: string }[] = [
  { key: "smart", label: "Smart", color: "var(--blue)", dim: "var(--bdim)" },
  { key: "grit", label: "Grit", color: "var(--amber)", dim: "var(--adim)" },
  { key: "build", label: "Build", color: "var(--indigo)", dim: "var(--idim)" },
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] p-4" style={{ background: "var(--s2)" }}>
      <h2 className="text-[12px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--t3)", letterSpacing: "0.06em" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-[12px] shrink-0" style={{ color: "var(--t3)" }}>{label}</span>
      <span className="text-[13px] font-medium truncate" style={{ color: "var(--t1)" }}>{value}</span>
    </div>
  );
}

/** Email for profile/photo cache — do not require fresh auth cache (avoids full-page loading flash). */
function readEmailForCachedProfile(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_USER_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { email?: string };
      if (parsed?.email && typeof parsed.email === "string") {
        const e = parsed.email.trim();
        if (e) return e;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const lr = localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (lr) {
      const parsed = JSON.parse(lr) as { user?: { email?: string }; email?: string };
      const e = (parsed?.user?.email ?? parsed?.email)?.trim();
      if (e) return e;
    }
  } catch {
    /* ignore */
  }
  try {
    const token = localStorage.getItem("dilly_auth_token");
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64)) as { sub?: string; email?: string };
    const e = (payload.email ?? payload.sub ?? "").trim();
    if (e.includes("@")) return e;
  } catch {
    /* ignore */
  }
  return null;
}

function readCachedProfileFromDisk(): DillyProfile | null {
  const email = readEmailForCachedProfile();
  if (!email) return null;
  try {
    const cached = localStorage.getItem(`${PROFILE_CACHE_KEY_BASE}_${email}`);
    if (!cached) return null;
    const p = JSON.parse(cached) as Record<string, unknown>;
    if (!p || typeof p !== "object") return null;
    if (p.name || p.track || (Array.isArray(p.majors) && p.majors.length) || p.major) {
      return p as DillyProfile;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readCachedPhotoFromDisk(): string | null {
  const email = readEmailForCachedProfile();
  if (!email) return null;
  try {
    const photo = localStorage.getItem(profilePhotoCacheKey(email));
    if (photo?.startsWith("data:image/")) return photo;
  } catch {
    /* ignore */
  }
  return null;
}

export default function ProfileDetailsPage({ onBack, onOpenSettings }: { onBack?: () => void; onOpenSettings?: () => void } = {}) {
  const [profile, setProfile] = useState<DillyProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  /** Hydrate from localStorage before paint so we don’t flash full-screen loader when cache exists. */
  useLayoutEffect(() => {
    const token = localStorage.getItem("dilly_auth_token");
    if (!token) {
      setLoading(false);
      setError(true);
      return;
    }
    const cached = readCachedProfileFromDisk();
    const ph = readCachedPhotoFromDisk();
    if (cached) setProfile(cached);
    if (ph) setPhotoUrl(ph);
    if (cached) setLoading(false);
  }, []);

  useEffect(() => {
    dilly.fetch("/profile/dilly")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p) setProfile(p);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    dilly.fetch("/profile/photo")
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && blob.size > 0) {
          const reader = new FileReader();
          reader.onloadend = () => { if (typeof reader.result === "string") setPhotoUrl(reader.result); };
          reader.readAsDataURL(blob);
        }
      })
      .catch(() => { /* no photo */ });
  }, []);

  if (loading && !profile) {
    return (
      <div className="career-center-talent min-h-screen" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
        <div className="max-w-[390px] mx-auto px-4 pb-40">
          <AppProfileHeader
            back={onBack ?? getCareerCenterReturnPath()}
            photoUrl={photoUrl ?? undefined}
            className="mb-2"
          />
          <div className="flex flex-col items-center gap-4 py-10 px-2" aria-busy="true" aria-label="Loading profile">
            <div className="w-28 h-28 rounded-full shrink-0 animate-pulse" style={{ background: "var(--s2)" }} />
            <div className="h-5 w-44 rounded-lg animate-pulse" style={{ background: "var(--s2)" }} />
            <div className="h-4 w-56 rounded-lg animate-pulse" style={{ background: "var(--s2)" }} />
            <div className="w-full space-y-3 mt-4">
              <div className="h-24 rounded-[18px] animate-pulse" style={{ background: "var(--s2)" }} />
              <div className="h-24 rounded-[18px] animate-pulse" style={{ background: "var(--s2)" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="career-center-talent min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>
        <p className="text-sm mb-4" style={{ color: "var(--t3)" }}>Sign in to view your profile.</p>
        <Link href="/" className="text-sm font-medium px-5 py-2.5 rounded-xl" style={{ background: "var(--blue)", color: "#fff" }}>
          Go to Dilly
        </Link>
      </div>
    );
  }

  if (!profile) return null;

  const majors = [...new Set([...(profile.majors ?? []), profile.major].filter(Boolean))];
  const minors = (profile.minors ?? []).filter((m) => m && !/^(N\/A|NA|N|A|none)$/i.test(String(m).trim()));
  const scores = profile.scores;
  const final = profile.final_score != null ? Math.round(profile.final_score) : null;
  const peerPct = profile.peer_percentiles;
  const appSum = profile.applications_summary;
  const frame = peerPct ? getProfileFrame(peerPct) : null;
  const schoolName = profile.school_name || profile.school_short_name || localStorage.getItem(SCHOOL_NAME_KEY) || undefined;
  const cohortLabel = getEffectiveCohortLabel(profile.track, profile.track);

  return (
    <div className="career-center-talent min-h-screen" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
      <div className="max-w-[390px] mx-auto px-4 pb-40">
        <AppProfileHeader
          back={getCareerCenterReturnPath()}
          name={profile.name ?? undefined}
          track={cohortLabel || undefined}
          schoolName={schoolName}
          photoUrl={photoUrl}
          className="mb-2"
        />

        {/* Hero: large photo + name + edit button */}
        <div className="flex flex-col items-center gap-3 py-5">
          <ProfilePhotoWithFrame
            photoUrl={photoUrl}
            frame={frame}
            size="lg"
            fallbackLetter={profile.name?.charAt(0) || "?"}
          />
          <div className="text-center">
            <h1 className="text-xl font-semibold" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>
              {profile.name || "Your Profile"}
            </h1>
            {cohortLabel && (
              <p className="text-[12px] mt-0.5" style={{ color: "var(--t3)" }}>
                {cohortLabel}{schoolName ? ` · ${schoolName}` : ""}
              </p>
            )}
            {profile.linkedin_url && (
              <a
                href={profile.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] mt-1 inline-block transition-opacity hover:opacity-80"
                style={{ color: "var(--blue)" }}
              >
                LinkedIn
              </a>
            )}
          </div>
          <Link
            href="/?edit=profile&from=settings"
            className="mt-1 text-[12px] font-semibold px-5 py-2 rounded-xl transition-opacity hover:opacity-90 active:opacity-80"
            style={{ background: "var(--s3)", color: "var(--t1)", border: "1px solid var(--b2)" }}
          >
            Edit Profile
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          {/* Identity + Academics */}
          <SectionCard title="About">
            <div className="flex flex-col gap-2">
              <Field label="Major" value={majors.length ? majors.join(", ") : undefined} />
              {minors.length > 0 && <Field label="Minor" value={minors.join(", ")} />}
              <Field label="School" value={schoolName} />
              <Field label="Cohort" value={cohortLabel || undefined} />
              {profile.track && PRE_PROFESSIONAL_TRACKS.some((t) => t.value === profile.track) ? (
                <Field label="Pre-professional path" value={profile.track} />
              ) : null}
              <Field label="Career goal" value={profile.career_goal} />
              <Field
                label="Target"
                value={profile.application_target ? profile.application_target.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : undefined}
              />
              {profile.job_locations && profile.job_locations.length > 0 && (
                <Field label="Locations" value={profile.job_locations.join(", ")} />
              )}
            </div>
          </SectionCard>

          {/* Bio / Tagline */}
          <SectionCard title="Bio">
            {profile.profile_tagline ? (
              <p className="text-[13px] font-medium mb-1" style={{ color: "var(--t1)" }}>{profile.profile_tagline}</p>
            ) : (
              <p className="text-[12px] mb-1" style={{ color: "var(--t3)" }}>No tagline yet.</p>
            )}
            {profile.profile_bio ? (
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--t2)" }}>{profile.profile_bio}</p>
            ) : (
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--t3)" }}>
                Add a short bio in Edit Profile so recruiters and mentors can quickly understand your focus.
              </p>
            )}
          </SectionCard>

          {/* Scores */}
          <SectionCard title="Dilly Score">
              {final != null && (
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-light tabular-nums" style={{ color: "var(--t1)", letterSpacing: "-0.04em" }}>{final}</span>
                  <span className="text-[11px]" style={{ color: "var(--t3)" }}>overall</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {DIM_META.map(({ key, label, color, dim }) => {
                  const rawScore = scores?.[key];
                  const score = rawScore != null ? Math.round(rawScore) : null;
                  const pct = peerPct?.[key] != null ? Math.max(1, 100 - (peerPct[key] ?? 50)) : null;
                  if (score == null) return null;
                  return (
                    <div
                      key={key}
                      className="rounded-[14px] p-3 min-h-[92px] flex flex-col justify-between"
                      style={{ background: "var(--s3)", border: `1px solid ${dim}` }}
                    >
                      <span className="text-[11px] font-medium" style={{ color: "var(--t3)" }}>{label}</span>
                      <span className="text-2xl font-semibold tabular-nums leading-none" style={{ color }}>{score ?? "--"}</span>
                      {pct != null && (
                        <span className="text-[10px]" style={{ color: "var(--t3)" }}>Top {pct}%</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {!scores && (
                <p className="text-[12px] mb-3" style={{ color: "var(--t3)" }}>
                  No scores on file yet for Smart, Grit, and Build.
                </p>
              )}
              {(profile.dilly_take ?? profile.dilly_take) && (
                <p className="text-[12px] leading-relaxed italic" style={{ color: "var(--t2)" }}>
                  &quot;{(profile.dilly_take ?? profile.dilly_take)!.trim()}&quot;
                </p>
              )}
              {profile.audit_count != null && profile.audit_count > 0 && (
                <p className="text-[11px] mt-2" style={{ color: "var(--t3)" }}>
                  {profile.audit_count} audit{profile.audit_count !== 1 ? "s" : ""} completed
                </p>
              )}
            </SectionCard>

          {/* Applications */}
          <SectionCard title="Applications">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Total", value: appSum?.count ?? 0, color: "var(--t1)" },
                  { label: "Applied", value: appSum?.applied ?? 0, color: "var(--blue)" },
                  { label: "Interview", value: appSum?.interviewing ?? 0, color: "var(--amber)" },
                  { label: "Offers", value: appSum?.offer ?? 0, color: "var(--green)" },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col gap-0.5">
                    <span className="text-lg font-medium tabular-nums" style={{ color: item.color }}>{item.value}</span>
                    <span className="text-[10px]" style={{ color: "var(--t3)" }}>{item.label}</span>
                  </div>
                ))}
              </div>
              {(!appSum || appSum.count === 0) && (
                <p className="text-[11px] mt-2" style={{ color: "var(--t3)" }}>
                  No applications tracked yet.
                </p>
              )}
            </SectionCard>

          {/* Experience */}
          <SectionCard title="Experience">
              {profile.structured_experience && profile.structured_experience.length > 0 ? (
              <div className="flex flex-col gap-3">
                {profile.structured_experience.map((exp, i) => (
                  <div key={i} className="min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[13px] font-medium truncate" style={{ color: "var(--t1)" }}>
                        {exp.role || "Role"}{exp.company ? ` at ${exp.company}` : ""}
                      </span>
                    </div>
                    {exp.date && <p className="text-[11px]" style={{ color: "var(--t3)" }}>{exp.date}</p>}
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {exp.bullets.slice(0, 3).map((b, j) => (
                          <li key={j} className="text-[11px] leading-relaxed pl-3 relative" style={{ color: "var(--t2)" }}>
                            <span className="absolute left-0" style={{ color: "var(--t3)" }}>&#x2022;</span>
                            {b}
                          </li>
                        ))}
                        {exp.bullets.length > 3 && (
                          <li className="text-[10px] pl-3" style={{ color: "var(--t3)" }}>+{exp.bullets.length - 3} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              ) : (
                <p className="text-[12px]" style={{ color: "var(--t3)" }}>No structured experience extracted yet.</p>
              )}
            </SectionCard>

          {/* Skills */}
          <SectionCard title="Skills">
              {profile.skills && profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((s) => (
                  <span
                    key={s}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg"
                    style={{ background: "var(--s3)", color: "var(--t2)" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
              ) : (
                <p className="text-[12px]" style={{ color: "var(--t3)" }}>No skills tagged yet.</p>
              )}
            </SectionCard>

          {/* Achievements */}
          <SectionCard title="Achievements">
              {profile.achievements && profile.achievements.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.achievements.map((a) => (
                  <span
                    key={a}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg"
                    style={{ background: "var(--adim)", color: "var(--amber)" }}
                  >
                    {a.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
              ) : (
                <p className="text-[12px]" style={{ color: "var(--t3)" }}>No achievements unlocked yet.</p>
              )}
            </SectionCard>

          {/* Visibility + Share */}
          <SectionCard title="Sharing & Privacy">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: profile.dilly_profile_visible_to_recruiters ? "var(--green)" : "var(--t3)" }}
                />
                <span className="text-[12px]" style={{ color: "var(--t2)" }}>
                  {profile.dilly_profile_visible_to_recruiters ? "Visible to recruiters" : "Hidden from recruiters"}
                </span>
              </div>
              {profile.profile_slug && (
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: "var(--t3)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.02a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                  </svg>
                  <button
                    type="button"
                    className="text-[11px] truncate transition-opacity hover:opacity-80"
                    style={{ color: "var(--blue)" }}
                    onClick={() => {
                      const url = `${window.location.origin}/p/${profile.profile_slug}`;
                      navigator.clipboard.writeText(url).catch(() => {});
                    }}
                  >
                    Copy public profile link
                  </button>
                </div>
              )}
              {onOpenSettings ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-[11px] transition-opacity hover:opacity-80 mt-1 border-0 bg-transparent p-0 text-left"
                  style={{ color: "var(--t3)" }}
                >
                  Privacy settings &rarr;
                </button>
              ) : (
                <Link
                  href="/settings"
                  className="text-[11px] transition-opacity hover:opacity-80 mt-1"
                  style={{ color: "var(--t3)" }}
                >
                  Privacy settings &rarr;
                </Link>
              )}
            </div>
          </SectionCard>

          {/* Dilly activity */}
          <SectionCard title="Dilly Activity">
              <p className="text-[13px]" style={{ color: "var(--t2)" }}>
                {profile.voice_topics_count ?? 0} conversation{(profile.voice_topics_count ?? 0) !== 1 ? "s" : ""} with Dilly
              </p>
            </SectionCard>
        </div>
      </div>
    </div>
  );
}
