"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoaderOne } from "@/components/ui/loader-one";
import { ProfilePhotoWithFrame } from "@/components/ProfilePhotoWithFrame";
import { MajorMinorAutocomplete } from "@/components/MajorMinorAutocomplete";
import { CityChipsInput } from "@/components/CityChipsInput";

import { useAppContext } from "@/context/AppContext";

import { useVoice } from "@/contexts/VoiceContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { useToast } from "@/hooks/useToast";

import { dilly } from "@/lib/dilly";
import { getProfileFrame } from "@/lib/profileFrame";
import { getEffectiveCohortLabel, PRE_PROFESSIONAL_TRACKS } from "@/lib/trackDefinitions";
import { UT_MAJORS, UT_MINORS } from "@/lib/utMajorsMinors";
import { JOB_CITIES_LIST } from "@/lib/jobCities";
import { hapticLight } from "@/lib/haptics";
import { profilePhotoCacheKey } from "@/lib/dillyUtils";

import type { AuditV2, AppProfile } from "@/types/dilly";

function isValidLinkedInUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[\w\-]+\/?$/i.test(trimmed);
}

export interface EditProfileViewProps {
  theme: { primary: string; secondary: string; backgroundTint?: string; primaryContrast?: string };
  profilePhotoUrl: string | null;
  setProfilePhotoUrl: React.Dispatch<React.SetStateAction<string | null>>;
  profilePhotoUploading: boolean;
  setPhotoCropImageSrc: React.Dispatch<React.SetStateAction<string | null>>;
  saveProfile: (data: Partial<AppProfile>) => Promise<boolean>;
  editingProfile: boolean;
  setEditingProfile: React.Dispatch<React.SetStateAction<boolean>>;
  editName: string;
  setEditName: React.Dispatch<React.SetStateAction<string>>;
  editMajors: string[];
  setEditMajors: React.Dispatch<React.SetStateAction<string[]>>;
  editMinors: string[];
  setEditMinors: React.Dispatch<React.SetStateAction<string[]>>;
  editTrack: string;
  setEditTrack: React.Dispatch<React.SetStateAction<string>>;
  editPreProfessional: boolean;
  setEditPreProfessional: React.Dispatch<React.SetStateAction<boolean>>;
  editCareerGoal: string;
  setEditCareerGoal: React.Dispatch<React.SetStateAction<string>>;
  editJobLocations: string[];
  setEditJobLocations: React.Dispatch<React.SetStateAction<string[]>>;
  editJobLocationScope: "specific" | "domestic" | "international" | null;
  setEditJobLocationScope: React.Dispatch<React.SetStateAction<"specific" | "domestic" | "international" | null>>;
  editLinkedIn: string;
  setEditLinkedIn: React.Dispatch<React.SetStateAction<string>>;
  editProfileSaving: boolean;
  setEditProfileSaving: React.Dispatch<React.SetStateAction<boolean>>;
  displayAudit: AuditV2 | null;
}

export function EditProfileView(props: EditProfileViewProps) {
  const {
    theme,
    profilePhotoUrl,
    setProfilePhotoUrl,
    profilePhotoUploading,
    setPhotoCropImageSrc,
    saveProfile,
    setEditingProfile,
    editName,
    setEditName,
    editMajors,
    setEditMajors,
    editMinors,
    setEditMinors,
    editTrack,
    setEditTrack,
    setEditPreProfessional,
    editCareerGoal,
    setEditCareerGoal,
    editJobLocations,
    setEditJobLocations,
    editJobLocationScope,
    setEditJobLocationScope,
    editLinkedIn,
    setEditLinkedIn,
    editProfileSaving,
    setEditProfileSaving,
    editPreProfessional,
    displayAudit,
  } = props;

  const { user, appProfile } = useAppContext();
  const { setMainAppTab } = useNavigation();
  const { memoryItems } = useVoice();
  const { toast } = useToast();

  return (
    <div className="career-center-talent min-h-full w-full overflow-x-hidden" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
      <section className="w-full max-w-[390px] mx-auto px-4 pt-0 pb-40 min-w-0 overflow-x-hidden animate-edit-profile-screen" aria-label="Edit profile" style={{ background: "var(--bg)" }}>
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 py-3 mb-4 border-b" style={{ background: "var(--bg)", borderColor: "var(--b1)" }}>
          <button type="button" onClick={() => setEditingProfile(false)} className="flex items-center justify-center w-9 h-9 min-h-[44px] shrink-0 rounded-[18px] transition-colors hover:bg-[var(--s2)]" style={{ color: "var(--t2)" }} aria-label="Back">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="text-[15px] font-semibold truncate min-w-0" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Edit profile</h2>
          <button type="button" onClick={() => { hapticLight(); setMainAppTab("settings"); }} className="flex items-center gap-1.5 min-h-[44px] px-3 py-2 text-sm font-medium rounded-[18px] transition-colors hover:bg-[var(--s2)] border-0 bg-transparent" style={{ color: "var(--t2)" }} aria-label="Settings">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span>Settings</span>
          </button>
        </header>
        <button
          type="button"
          onClick={() => { hapticLight(); setMainAppTab("memory"); }}
          className="w-full mb-3 rounded-[16px] border px-4 py-3 text-left"
          style={{ background: "var(--s2)", borderColor: "var(--bbdr)" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--t3)" }}>
            Your career story
          </p>
          <p className="text-[13px] mt-1 font-semibold" style={{ color: "var(--t1)" }}>
            What Dilly knows about you
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>
            {memoryItems.length} saved {memoryItems.length === 1 ? "memory" : "memories"} · Open →
          </p>
        </button>
        <div className="rounded-[18px] overflow-hidden space-y-0" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setEditProfileSaving(true);
              const majorsClean = editMajors.map((m) => m.trim()).filter(Boolean);
              const minorsClean = editMinors.map((m) => m.trim()).filter(Boolean);
              const jobScope = editJobLocationScope === "domestic" || editJobLocationScope === "international"
                ? editJobLocationScope
                : (editJobLocations.length > 0 ? "specific" : undefined);
              const jobLocs = jobScope === "domestic" || jobScope === "international" ? [] : editJobLocations.slice(0, 20);
              const linkedInTrimmed = editLinkedIn.trim();
              if (linkedInTrimmed && !isValidLinkedInUrl(linkedInTrimmed)) {
                toast("Please enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/username)", "error");
                setEditProfileSaving(false);
                return;
              }
              const ok = await saveProfile({
                name: editName.trim() || undefined,
                major: majorsClean[0] || undefined,
                majors: majorsClean,
                minors: minorsClean,
                track: editTrack.trim() || undefined,
                preProfessional: editPreProfessional,
                career_goal: editCareerGoal.trim() || null,
                linkedin_url: linkedInTrimmed || undefined,
                job_location_scope: jobScope,
                job_locations: jobLocs,
              });
              setEditProfileSaving(false);
              if (ok) {
                toast("Saved: name, major(s), minor(s), track, career goal, LinkedIn, job locations", "success");
                setEditingProfile(false);
              }
            }}
            className="p-5 space-y-5"
          >
            {/* Profile photo */}
            <div style={{ borderBottom: "1px solid var(--b1)", paddingBottom: "1.25rem" }}>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-3 block" style={{ color: "var(--t3)" }}>Profile photo</label>
              <div className="flex items-center gap-4">
                {profilePhotoUrl ? (
                  <button
                    type="button"
                    onClick={() => setPhotoCropImageSrc(profilePhotoUrl)}
                    className="relative shrink-0 cursor-pointer rounded-full overflow-hidden ring-2 ring-white/60"
                  >
                    <ProfilePhotoWithFrame photoUrl={profilePhotoUrl} frame={getProfileFrame(displayAudit?.peer_percentiles)} size="lg" fallbackLetter={appProfile?.name || "?"} />
                    <div className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21V7h14v14M3 17V3h14v14" /></svg>
                      <span className="text-xs font-medium text-white">Crop</span>
                    </div>
                  </button>
                ) : (
                  <label
                    htmlFor="profile-photo-input"
                    className="relative w-36 h-36 rounded-full overflow-hidden flex items-center justify-center shrink-0 cursor-pointer ring-2 ring-white"
                    style={{ background: "var(--s2)" }}
                  >
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                      <span className="text-xs font-medium text-white">Add Photo</span>
                    </div>
                  </label>
                )}
                <div className="flex flex-col gap-2">
                  {profilePhotoUploading ? (
                    <span className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-[18px] px-3 text-[0.8rem] font-medium opacity-50 min-h-[44px]" style={{ background: "var(--s3)", border: "1px solid var(--b2)" }}>
                      <LoaderOne color={theme.primary} size={8} />
                    </span>
                  ) : (
                    <label
                      htmlFor="profile-photo-input"
                      className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-[18px] px-3 text-[0.8rem] font-medium transition-colors hover:bg-[var(--s3)] min-h-[44px]"
                      style={{ border: "1px solid var(--b2)", color: "var(--t2)" }}
                    >
                      {profilePhotoUrl ? "Change photo" : "Add photo"}
                    </label>
                  )}
                  {profilePhotoUrl && (
                    <Button type="button" variant="outline" size="sm" onClick={async () => {
                      try {
                        const res = await dilly.fetch(`/profile/photo`, { method: "DELETE" });
                        if (res.ok) {
                          try { localStorage.removeItem(profilePhotoCacheKey(user?.email)); } catch {}
                          setProfilePhotoUrl((u) => { if (u && u.startsWith("blob:")) URL.revokeObjectURL(u); return null; });
                        }
                      } catch {}
                    }} className="rounded-[18px] min-h-[44px] border-[var(--b2)]" style={{ color: "var(--coral)" }}>Remove photo</Button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-[18px] min-h-[44px] text-sm" style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t1)" }} placeholder="Your Name" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>LinkedIn</label>
              <Input value={editLinkedIn} onChange={(e) => setEditLinkedIn(e.target.value)} className="rounded-[18px] min-h-[44px] text-sm" style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t1)" }} placeholder="https://linkedin.com/in/username" type="url" />
              <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>Your LinkedIn profile URL (e.g. linkedin.com/in/yourname)</p>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Major(s)</label>
              <p className="text-xs mb-2" style={{ color: "var(--t3)" }}>Type to search University of Tampa majors</p>
              <div className="space-y-2">
                {editMajors.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <MajorMinorAutocomplete value={m} onChange={(v) => setEditMajors((prev) => { const n = [...prev]; n[i] = v; return n; })} options={UT_MAJORS} placeholder="E.g. Computer Science" className="flex-1" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditMajors((prev) => prev.filter((_, j) => j !== i))} className="rounded-[18px] shrink-0 min-h-[44px] border-[var(--b2)]" style={{ color: "var(--t3)" }}>×</Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setEditMajors((prev) => [...prev, ""])} className="rounded-[18px] border-dashed border-[var(--b2)] w-full min-h-[44px]" style={{ color: "var(--t3)" }}>+ Add Major</Button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Minor(s)</label>
              <p className="text-xs mb-2" style={{ color: "var(--t3)" }}>Type to search University of Tampa minors</p>
              <div className="space-y-2">
                {editMinors.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <MajorMinorAutocomplete value={m} onChange={(v) => setEditMinors((prev) => { const n = [...prev]; n[i] = v; return n; })} options={UT_MINORS} placeholder="E.g. Spanish" className="flex-1" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditMinors((prev) => prev.filter((_, j) => j !== i))} className="rounded-[18px] shrink-0 min-h-[44px] border-[var(--b2)]" style={{ color: "var(--t3)" }}>×</Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setEditMinors((prev) => [...prev, ""])} className="rounded-[18px] border-dashed border-[var(--b2)] w-full min-h-[44px]" style={{ color: "var(--t3)" }}>+ Add Minor</Button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Your cohort</label>
              <p className="text-sm font-medium py-2.5 px-3 rounded-[18px] min-h-[44px] flex items-center" style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t2)" }}>
                {getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || "\u2014"}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>Pre-Law and pre-health paths use your cohort choice; otherwise your resume audit sets your cohort (updates when you re-run an audit).</p>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Pre-professional track</label>
              <select
                value={editTrack}
                onChange={(e) => { setEditTrack(e.target.value); setEditPreProfessional(!!e.target.value); }}
                className="w-full rounded-[18px] min-h-[44px] text-sm px-3 py-2"
                style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t1)" }}
              >
                <option value="">None</option>
                {PRE_PROFESSIONAL_TRACKS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>Pre-Law maps to the Pre-Law cohort; pre-health paths map to Pre-Health.</p>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Career goal</label>
              <Input value={editCareerGoal} onChange={(e) => setEditCareerGoal(e.target.value)} className="rounded-[18px] min-h-[44px] text-sm" style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t1)" }} placeholder="e.g. Land Summer Analyst at Goldman" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--t3)" }}>Job locations</label>
              {(editJobLocationScope !== "domestic" && editJobLocationScope !== "international") && (
                <CityChipsInput value={editJobLocations} onChange={setEditJobLocations} placeholder="Add cities" options={JOB_CITIES_LIST} />
              )}
              <p className="text-xs mt-2 mb-1" style={{ color: "var(--t3)" }}>Open to anywhere?</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {(["domestic", "international"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => {
                      const next = scope === editJobLocationScope ? null : scope;
                      setEditJobLocationScope(next);
                      if (next === "domestic" || next === "international") setEditJobLocations([]);
                    }}
                    className={`px-3 py-2 rounded-[18px] text-xs font-medium min-h-[44px] transition-colors`}
                    style={editJobLocationScope === scope ? { background: "var(--blue)", color: "#fff" } : { background: "var(--s3)", color: "var(--t2)", border: "1px solid var(--b2)" }}
                  >
                    {scope === "domestic" ? "Domestic (US)" : "International"}
                  </button>
                ))}
              </div>
              {(editJobLocationScope === "domestic" || editJobLocationScope === "international") && (
                <button
                  type="button"
                  onClick={() => setEditJobLocationScope(null)}
                  className="mt-2 text-xs font-medium transition-colors underline underline-offset-2"
                  style={{ color: "var(--t3)" }}
                >
                  No, I&apos;m looking for specific cities
                </button>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={editProfileSaving} className="rounded-[18px] px-5 py-2.5 min-h-[44px] text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "var(--blue)", color: "#fff" }}>{editProfileSaving ? "Saving\u2026" : "Save"}</button>
              <button type="button" onClick={() => {
                const dirty = editName.trim() !== (appProfile?.name ?? "").trim()
                  || JSON.stringify(editMajors.map((m) => m.trim()).filter(Boolean)) !== JSON.stringify(appProfile?.majors ?? (appProfile?.major ? [appProfile.major] : []))
                  || JSON.stringify(editMinors.map((m) => m.trim()).filter(Boolean)) !== JSON.stringify(appProfile?.minors ?? [])
                  || editTrack.trim() !== (appProfile?.track ?? "").trim()
                  || editPreProfessional !== !!appProfile?.preProfessional
                  || editCareerGoal.trim() !== (appProfile?.career_goal ?? "").trim()
                  || editLinkedIn.trim() !== (appProfile?.linkedin_url ?? "").trim()
                  || editJobLocationScope !== (appProfile?.job_location_scope ?? null)
                  || JSON.stringify(editJobLocations) !== JSON.stringify(appProfile?.job_locations ?? []);
                if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
                setEditingProfile(false);
              }} className="rounded-[18px] px-5 py-2.5 min-h-[44px] text-sm font-medium transition-opacity hover:opacity-90" style={{ background: "var(--s3)", color: "var(--t2)", border: "1px solid var(--b2)" }}>Cancel</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
