"use client";

import { useMe } from "@/components/MeProvider";
import { ApCoursePicker } from "@/components/ApCoursePicker";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{children}</h2>
  );
}

export default function ProfilePage() {
  const { profile, updateProfile, ready } = useMe();

  if (!ready) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          The more detail you add, the better the model can approximate strength vs each school’s bar. Estimates stay
          illustrative—not what admission offices use.
        </p>
      </div>

      <form
        className="space-y-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Name</span>
          <input
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            value={profile.name}
            onChange={(e) => updateProfile({ ...profile, name: e.target.value })}
            placeholder="Alex Student"
            autoComplete="name"
          />
        </label>

        <div className="space-y-3">
          <SectionTitle>Academics</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Unweighted GPA (4.0)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                max={4}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={profile.gpaUnweighted}
                onChange={(e) => updateProfile({ ...profile, gpaUnweighted: Number(e.target.value) })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Weighted GPA (optional, ~5.0 scale)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                max={5.5}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={profile.gpaWeighted ?? ""}
                placeholder="e.g. 4.4"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") updateProfile({ ...profile, gpaWeighted: undefined });
                  else updateProfile({ ...profile, gpaWeighted: Number(v) });
                }}
              />
            </label>
          </div>
          <p className="text-xs text-[var(--muted)]">
            If your school uses a different weighted scale, enter the closest equivalent; the model is approximate.
          </p>
        </div>

        <div className="space-y-2">
          <SectionTitle>AP courses taken</SectionTitle>
          <ApCoursePicker
            value={profile.apCourseIds}
            onChange={(apCourseIds) => updateProfile({ ...profile, apCourseIds })}
          />
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Other advanced courses (IB, dual enrollment, etc.)</span>
          <input
            type="number"
            min={0}
            max={24}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            value={profile.advancedCourses}
            onChange={(e) => updateProfile({ ...profile, advancedCourses: Number(e.target.value) })}
          />
          <span className="text-xs text-[var(--muted)]">Added on top of AP selections for total rigor.</span>
        </label>

        <div className="space-y-3">
          <SectionTitle>Testing</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">SAT</span>
              <input
                type="number"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={profile.sat ?? ""}
                placeholder="1350"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") updateProfile({ ...profile, sat: undefined });
                  else updateProfile({ ...profile, sat: Number(v), act: undefined });
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">ACT</span>
              <input
                type="number"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={profile.act ?? ""}
                placeholder="30"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") updateProfile({ ...profile, act: undefined });
                  else updateProfile({ ...profile, act: Number(v), sat: undefined });
                }}
              />
            </label>
          </div>
          <p className="text-xs text-[var(--muted)]">Enter SAT or ACT for concordance—not both.</p>
        </div>

        <div className="space-y-2">
          <SectionTitle>Extracurriculars</SectionTitle>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Activities (roles, impact, time)</span>
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-sm leading-relaxed text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              value={profile.extracurricularsDescription}
              onChange={(e) => updateProfile({ ...profile, extracurricularsDescription: e.target.value })}
              placeholder="e.g. Debate captain, 10 hrs/wk; regional qualifier…"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Depth (1–5) — quick signal if you’re light on text</span>
            <input
              type="range"
              min={1}
              max={5}
              className="w-full accent-[var(--accent)]"
              value={profile.extracurricularStrength}
              onChange={(e) =>
                updateProfile({
                  ...profile,
                  extracurricularStrength: Number(e.target.value) as 1 | 2 | 3 | 4 | 5,
                })
              }
            />
            <div className="text-xs text-[var(--muted)]">{profile.extracurricularStrength}</div>
          </label>
        </div>

        <div className="space-y-2">
          <SectionTitle>Work experience</SectionTitle>
          <textarea
            className="min-h-[100px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-sm leading-relaxed text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            value={profile.workExperienceDescription}
            onChange={(e) => updateProfile({ ...profile, workExperienceDescription: e.target.value })}
            placeholder="Jobs, internships, family responsibilities, paid work…"
          />
        </div>

        <div className="space-y-2">
          <SectionTitle>Honors & awards</SectionTitle>
          <textarea
            className="min-h-[100px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-sm leading-relaxed text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            value={profile.honorsAndAwardsDescription}
            onChange={(e) => updateProfile({ ...profile, honorsAndAwardsDescription: e.target.value })}
            placeholder="Scholarships, competitions, recognition…"
          />
        </div>

        <div className="space-y-2">
          <SectionTitle>Other context</SectionTitle>
          <textarea
            className="min-h-[88px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-sm leading-relaxed text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            value={profile.additionalInfo}
            onChange={(e) => updateProfile({ ...profile, additionalInfo: e.target.value })}
            placeholder="Summer programs, circumstances, hooks not covered above…"
          />
        </div>

        <div className="space-y-3">
          <SectionTitle>Plans</SectionTitle>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Intended major</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              value={profile.intendedMajor}
              onChange={(e) => updateProfile({ ...profile, intendedMajor: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Home state (optional)</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              value={profile.homeState ?? ""}
              placeholder="FL"
              maxLength={2}
              onChange={(e) =>
                updateProfile({ ...profile, homeState: e.target.value.toUpperCase() || undefined })
              }
            />
          </label>
        </div>
      </form>
    </div>
  );
}
