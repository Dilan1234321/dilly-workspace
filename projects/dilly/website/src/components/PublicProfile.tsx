"use client";

/**
 * PublicProfile - redesigned two-column public web profile.
 *
 * Zero LLM cost per view. Every AI-derived field (skill_groups,
 * dilly_take) is either rule-based clustering on existing facts or
 * a cached/template string — no per-view LLM calls under any
 * circumstance.
 *
 * Layout:
 *   Desktop (>= 1024px): fixed two-column, no body scroll at
 *   maximized window size. Left (40%) = identity + mission + Dilly
 *   take. Right (60%) = skill-group podium + skill panel + projects.
 *
 *   Narrow (< 1024px): columns stack, body scrolls.
 *
 * Name fits on one line — measured via ref + useLayoutEffect so it
 * shrinks to fit between the photo and the right edge of the left
 * column, never wrapping.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.trydilly.com";

// ── Types ────────────────────────────────────────────────────────

interface SkillGroup {
  rank: number;                // 1 = winner
  name: string;                // "Frontend", "Backend", etc.
  evidence_count: number;
  top_skills: string[];        // up to 3
  all_skills: string[];        // up to 12
  experiences: {
    role: string;
    organization: string;
    skills: string[];
    description?: string | null;
  }[];
}

interface ProfileData {
  name: string;
  slug: string;
  user_type: string;
  is_student: boolean;
  tagline: string | null;
  bio: string | null;
  headline: string | null;
  school: string | null;
  majors: string[];
  minors: string[];
  class_year: string | null;
  cities: string[];
  career_fields: string[];
  career_interests: string[];
  current_role: string | null;
  current_company: string | null;
  identity_tag:    string | null;    // positive situation framing, null for sensitive paths
  identity_accent: string | null;
  skills_technical: { label: string; confidence: string }[];
  skills_soft: { label: string; confidence: string }[];
  skill_groups: SkillGroup[];
  dilly_take: string;
  mission: string | null;
  projects: { label: string; value: string }[];
  experience: {
    role: string;
    organization: string;
    skills: string[];
    description?: string | null;
  }[];
  photo_url: string;
  has_photo: boolean;
  booking_enabled: boolean;
  show_refer_button: boolean;
}

// ── Auto-fit name ────────────────────────────────────────────────
// The name must render on one line between the photo and the right
// edge of the left column. We start big (60px) and step down until
// scrollWidth <= clientWidth. Only runs on mount + resize.
function useAutoFitText(
  text: string,
  max: number = 60,
  min: number = 22,
): { ref: React.RefObject<HTMLHeadingElement | null>; size: number } {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [size, setSize] = useState<number>(max);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let next = max;
      el.style.fontSize = `${next}px`;
      // Step down in 2px decrements until it fits or we hit min.
      while (next > min && el.scrollWidth > el.clientWidth) {
        next -= 2;
        el.style.fontSize = `${next}px`;
      }
      setSize(next);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, max, min]);

  return { ref, size };
}

// ── Podium column ────────────────────────────────────────────────
// Heights: 1st 100%, 2nd 72%, 3rd 54%. Column order in mockup:
// #3 | #1 | #2 — placed left-to-right as [3, 1, 2].
function Podium({
  groups,
  selected,
  onSelect,
}: {
  groups: SkillGroup[];
  selected: number | null;                 // rank of currently selected, or null
  onSelect: (rank: number | null) => void; // toggle
}) {
  const byRank = (r: number) => groups.find(g => g.rank === r);
  const slots: { rank: number; heightPct: number; bg: string; border: string }[] = [
    { rank: 3, heightPct: 54, bg: "#F1F5F9",   border: "#CBD5E1" },
    { rank: 1, heightPct: 100, bg: "#FFF7E6",  border: "#F59E0B" },
    { rank: 2, heightPct: 72, bg: "#F8FAFC",   border: "#94A3B8" },
  ];
  return (
    <div className="flex items-end justify-center gap-4 h-[220px]">
      {slots.map(({ rank, heightPct, bg, border }) => {
        const g = byRank(rank);
        const isSelected = selected === rank;
        return (
          <button
            key={rank}
            onClick={() => onSelect(isSelected ? null : rank)}
            disabled={!g}
            className={`flex flex-col items-center justify-end w-24 rounded-xl transition-all border-2 ${
              g ? "cursor-pointer hover:shadow-md" : "opacity-40 cursor-default"
            }`}
            style={{
              height: `${heightPct}%`,
              backgroundColor: bg,
              borderColor: isSelected ? border : "transparent",
            }}
          >
            <div className="text-[10px] font-bold tracking-widest text-slate-400 mb-2">
              #{rank}
            </div>
            <div className="text-[13px] font-bold text-slate-900 leading-tight px-2 pb-3 text-center">
              {g?.name ?? "—"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Skill panel ──────────────────────────────────────────────────
function SkillPanel({
  group,
  all,
  totalSkills,
}: {
  group: SkillGroup | null;
  all: SkillGroup[];
  totalSkills: number;
}) {
  if (!group) {
    // Default overview state — no podium selected yet.
    return (
      <div className="p-5 rounded-xl border border-slate-200 bg-white h-full flex flex-col">
        <div className="text-[10px] font-bold tracking-widest text-indigo-600 mb-2">
          GENERAL OVERVIEW
        </div>
        <div className="text-xl font-bold text-slate-900 leading-tight mb-4">
          {totalSkills} skills, {all.length} group{all.length === 1 ? "" : "s"}.
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Tap a podium block to see the top skills and experiences for that group.
        </p>
        <div className="mt-auto">
          <div className="text-[10px] font-bold tracking-widest text-slate-400 mb-2">
            GROUPS
          </div>
          <div className="flex flex-wrap gap-1.5">
            {all.map(g => (
              <span
                key={g.name}
                className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium"
              >
                #{g.rank} {g.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl border border-slate-200 bg-white h-full flex flex-col">
      <div className="text-[10px] font-bold tracking-widest text-indigo-600 mb-2">
        #{group.rank} · {group.name.toUpperCase()}
      </div>
      <div className="text-xl font-bold text-slate-900 leading-tight mb-4">
        {group.top_skills.slice(0, 3).join(" · ")}
      </div>

      {group.experiences.length > 0 ? (
        <>
          <div className="text-[10px] font-bold tracking-widest text-slate-400 mb-2">
            EXPERIENCES
          </div>
          <div className="space-y-2 mb-4">
            {group.experiences.slice(0, 5).map((e, i) => (
              <div key={i} className="text-sm text-slate-700 leading-snug">
                <span className="font-semibold">{e.role}</span>
                {e.organization ? <span className="text-slate-500"> · {e.organization}</span> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-auto">
        <div className="text-[10px] font-bold tracking-widest text-slate-400 mb-2">
          ALL IN THIS GROUP
        </div>
        <div className="flex flex-wrap gap-1.5">
          {group.all_skills.map((s, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────

export default function PublicProfile({ slug, prefix }: { slug: string; prefix: "s" | "p" }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/profile/web/${slug}?prefix=${prefix}`)
      .then(async res => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then(data => { setProfile(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [slug, prefix]);

  // Always hook to keep order stable.
  const { ref: nameRef } = useAutoFitText(profile?.name || "");

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-full bg-slate-200" />
          <div className="w-48 h-4 rounded bg-slate-200" />
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
  const totalSkills = (p.skills_technical?.length || 0) + (p.skills_soft?.length || 0);
  const selectedGroup =
    selectedRank != null
      ? p.skill_groups.find(g => g.rank === selectedRank) ?? null
      : null;
  const subtitleBits: string[] = [];
  if (p.current_role)    subtitleBits.push(p.current_role);
  if (p.current_company) subtitleBits.push(p.current_company);
  if (!p.current_role && p.is_student) {
    if (p.majors?.[0]) subtitleBits.push(p.majors[0]);
    if (p.school)      subtitleBits.push(p.school);
  }
  if (!subtitleBits.length && p.career_fields?.[0]) subtitleBits.push(p.career_fields[0]);
  const subtitle = subtitleBits.join(" · ");

  return (
    <div className="bg-slate-50 text-slate-900 lg:h-screen lg:overflow-hidden">
      <div className="max-w-[1400px] mx-auto p-4 lg:p-6 h-full">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 lg:gap-6 h-full">

          {/* ── LEFT: Identity ── */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:p-8 flex flex-col overflow-hidden">
            {/* Photo + Name row */}
            <div className="flex items-center gap-4 lg:gap-5">
              {/* Photo frame — aspect-square + object-center so the
                  user's face sits in the mold correctly no matter
                  what ratio they upload. Was previously cropping
                  off-center on portrait images. */}
              {p.has_photo ? (
                <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full flex-shrink-0 border-2 border-white shadow overflow-hidden bg-slate-100">
                  <img
                    src={photoUrl}
                    alt={p.name}
                    className="w-full h-full object-cover object-center"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 border-2 border-white shadow">
                  <span className="text-3xl font-bold text-white leading-none">
                    {String(p.name || "?").trim().charAt(0).toUpperCase() || "?"}
                  </span>
                </div>
              )}

              {/* Name auto-fits to one line via useAutoFitText */}
              <div className="min-w-0 flex-1">
                <h1
                  ref={nameRef}
                  className="font-black tracking-tight leading-[1.05] text-slate-900 whitespace-nowrap overflow-hidden"
                >
                  {p.name}
                </h1>
                {subtitle ? (
                  <p className="text-sm text-slate-500 mt-1 truncate">{subtitle}</p>
                ) : null}
                {/* identity_tag badge ("10%", etc) removed per lead-dev
                    review — it read as stale / promo-y and cluttered
                    the headline. Kept on the API response for other
                    surfaces; intentionally not rendered here. */}
              </div>
            </div>

            {/* Locations — tightened: a single flex row, constrained
                width so they don't wrap into four sparse lines. */}
            {p.cities.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {p.cities.slice(0, 3).map((c, i) => (
                  <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
                    {c}
                  </span>
                ))}
                {p.cities.length > 3 ? (
                  <span className="text-[11px] text-slate-400">+{p.cities.length - 3} more</span>
                ) : null}
              </div>
            ) : null}

            {/* CTA row — single, balanced row. "Request a chat"
                replaces the older "Book a chat" label (same endpoint,
                clearer verb). "Refer" is a clean outline button.
                Alignment fix: consistent heights + px via `h-9`. */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {p.booking_enabled ? (
                <a
                  href={`${API}/profile/book/${slug}`}
                  className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold h-9 px-4 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
                >
                  Request a chat
                </a>
              ) : null}
              {p.show_refer_button ? (
                <a
                  href={`${API}/profile/refer/${slug}`}
                  className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold h-9 px-4 rounded-lg bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 transition"
                >
                  Refer
                </a>
              ) : null}
            </div>

            {/* Mission Statement — hero block now. User-owned,
                editable from the mobile app. No auto-generation
                ever. This is the part recruiters actually read. */}
            <div className="mt-6 lg:mt-7">
              <div className="text-[10px] font-bold tracking-widest text-slate-400 mb-2">
                MISSION STATEMENT
              </div>
              {p.mission ? (
                <p className="text-base lg:text-[17px] text-slate-800 leading-relaxed font-medium">
                  {p.mission}
                </p>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-5 text-[13px] text-slate-400 italic leading-relaxed">
                  {p.tagline || "Write this from the Dilly app — one or two lines on why you do what you do."}
                </div>
              )}
            </div>

            {/* Dilly's take */}
            <div className="mt-auto pt-6 lg:pt-8">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-600 text-xl font-black">D</span>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-widest text-indigo-600 mb-1">
                    WHAT DILLY THINKS
                  </div>
                  <p className="text-sm text-slate-700 leading-snug">
                    {p.dilly_take}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── RIGHT: Skills + Projects ── */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:p-8 flex flex-col overflow-hidden">
            {/* Top: skill groups */}
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-1">
                <div className="text-[10px] font-bold tracking-widest text-slate-400 mb-3">
                  MY TOP SKILLS
                </div>
                {p.skill_groups.length > 0 ? (
                  <Podium
                    groups={p.skill_groups}
                    selected={selectedRank}
                    onSelect={setSelectedRank}
                  />
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-[13px] text-slate-400 italic border border-dashed border-slate-200 rounded-xl">
                    Skill groups will appear once {(p.name || "this person").split(" ")[0]} has had a few conversations with Dilly.
                  </div>
                )}
              </div>

              {/* Skill panel (right of podium on desktop, below on narrow) */}
              <div className="hidden lg:block w-[46%] h-[220px]">
                <SkillPanel
                  group={selectedGroup}
                  all={p.skill_groups}
                  totalSkills={totalSkills}
                />
              </div>
            </div>

            {/* Narrow layout: skill panel below podium */}
            <div className="lg:hidden mb-4">
              <SkillPanel
                group={selectedGroup}
                all={p.skill_groups}
                totalSkills={totalSkills}
              />
            </div>

            {/* Projects */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="text-[10px] font-bold tracking-widest text-slate-400 mb-3">
                PROJECTS
              </div>
              {p.projects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 overflow-y-auto">
                  {p.projects.slice(0, 6).map((proj, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="text-[13px] font-semibold text-slate-800 mb-1">
                        {proj.label}
                      </div>
                      {proj.value ? (
                        <p className="text-[12px] text-slate-600 leading-relaxed line-clamp-4">
                          {proj.value}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-[13px] text-slate-400 italic">
                  No projects added yet.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Footer wordmark — only visible when columns stack (narrow) */}
      <div className="lg:hidden flex justify-center py-6">
        <a href="https://hellodilly.com" className="opacity-40 hover:opacity-60 transition-opacity">
          <img src="/dilly-wordmark.png" alt="Dilly" className="h-5" />
        </a>
      </div>
    </div>
  );
}
