"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AUTH_TOKEN_KEY, API_BASE, PROFILE_CACHE_KEY_BASE, getCareerCenterReturnPath } from "@/lib/dillyUtils";
import { AppProfileHeader } from "@/components/career-center";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sounds";
import { PROFILE_THEMES, PROFILE_THEME_IDS, type ProfileThemeId } from "@/lib/profileThemes";
import { ACHIEVEMENT_IDS, isUnlocked, type ProfileAchievements } from "@/lib/achievements";
import { DEFAULT_VOICE_AVATAR_INDEX, VOICE_AVATAR_OPTIONS } from "@/lib/voiceAvatars";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { hapticLight, hapticSuccess } from "@/lib/haptics";

const VOICE_TONES = [
  { id: "encouraging" as const, label: "Encouraging" },
  { id: "direct" as const, label: "Direct" },
  { id: "casual" as const, label: "Casual" },
  { id: "professional" as const, label: "Professional" },
  { id: "coach" as const, label: "Coach" },
];

export default function SettingsPage({ onBack }: { onBack?: () => void } = {}) {
  const router = useRouter();
  const { toast } = useToast();
  const [soundOn, setSoundOn] = useState(true);
  const [profile, setProfile] = useState<{
    custom_tagline?: string | null;
    profile_theme?: ProfileThemeId | null;
    profile_background_color?: string | null;
    profile_tagline?: string | null;
    profile_bio?: string | null;
    career_goal?: string | null;
    profile_slug?: string | null;
    voice_tone?: string | null;
    voice_notes?: string[];
    voice_always_end_with_ask?: boolean;
    voice_max_recommendations?: number;
    nudge_preferences?: {
      deadline_nudges?: boolean;
      app_funnel_nudges?: boolean;
      relationship_nudges?: boolean;
      seasonal_nudges?: boolean;
      score_nudges?: boolean;
    };
    ritual_preferences?: {
      weekly_review_day?: number;
      rituals_enabled?: boolean;
    };
    voice_save_to_profile?: boolean;
    voice_avatar_index?: number | null;
    dilly_profile_privacy?: { scores?: boolean; activity?: boolean; applications?: boolean; experience?: boolean };
    dilly_profile_visible_to_recruiters?: boolean;
    referral_code?: string | null;
    parent_email?: string | null;
    parent_milestone_opt_in?: boolean;
    achievements?: ProfileAchievements;
  } | null>(null);
  const [customTagline, setCustomTagline] = useState("");
  const [profileTagline, setProfileTagline] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [careerGoal, setCareerGoal] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [parentEmail, setParentEmail] = useState("");
  const [parentInviteLink, setParentInviteLink] = useState<string | null>(null);
  const [giftCode, setGiftCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#voice") {
      const el = document.getElementById("voice");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        setProfile(p ?? null);
        setCustomTagline(p?.custom_tagline ?? "");
        setProfileTagline(p?.profile_tagline ?? "");
        setProfileBio(p?.profile_bio ?? "");
        setCareerGoal(p?.career_goal ?? "");
        setParentEmail(p?.parent_email ?? "");
      })
      .catch(() => {});
  }, []);

  const saveProfile = async (data: Record<string, unknown>) => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const p = await res.json();
        setProfile(p);
        toast("Saved", "success");
      }
    } catch {
      toast("Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const copyReferralLink = () => {
    const code = profile?.referral_code;
    if (!code) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/?ref=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      toast("Link copied", "success");
    });
  };

  const handleExport = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setExportLoading(true);
    try {
      const res = await fetch(`${API_BASE}/profile/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `dilly-export-${new Date().toISOString().slice(0, 10)}.json`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      hapticSuccess();
      toast("Export downloaded", "success");
    } catch {
      toast("Could not export", "error");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDownloadCalendar = () => {
    const deadlines: Array<{ id?: string; label?: string; date?: string }> = (profile as { deadlines?: Array<{ id?: string; label?: string; date?: string }> })?.deadlines ?? [];
    const events = deadlines.filter((d) => d.date && d.label);
    if (events.length === 0) {
      toast("No deadlines to export", "info");
      return;
    }
    const now = new Date();
    const dtstamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Dilly//Career Deadlines//EN",
      "CALSCALE:GREGORIAN",
      ...events.flatMap((e, i) => {
        const date = (e.date ?? "").slice(0, 10).replace(/-/g, "");
        const uid = e.id ?? `deadline-${i}-${date}`;
        return [
          "BEGIN:VEVENT",
          `UID:dilly-${uid}@trydilly.com`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${date}`,
          `DTEND;VALUE=DATE:${date}`,
          `SUMMARY:${(e.label || "Deadline").replace(/\n/g, " ")}`,
          "END:VEVENT",
        ];
      }),
      "END:VCALENDAR",
    ];
    const ics = lines.join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dilly-deadlines.ics";
    a.click();
    URL.revokeObjectURL(a.href);
    hapticSuccess();
    toast("Calendar file downloaded. Add to Google Calendar or Apple Calendar.", "success");
  };

  const addVoiceNote = () => {
    const note = voiceNote.trim();
    if (!note) return;
    const notes = [...(profile?.voice_notes ?? []), note].slice(-20);
    saveProfile({ voice_notes: notes });
    setVoiceNote("");
  };

  const handleLogOut = () => {
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        fetch(`${API_BASE}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      }
      localStorage.removeItem(AUTH_TOKEN_KEY);
      try {
        const keys = Object.keys(localStorage);
        for (const k of keys) {
          if (k.startsWith(PROFILE_CACHE_KEY_BASE) || k.startsWith("dilly_last_audit_")) {
            localStorage.removeItem(k);
          }
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    router.push("/");
    window.location.href = "/";
  };

  return (
    <div className="career-center-talent min-h-screen" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
      <main className="w-full max-w-[390px] mx-auto px-4 pb-40 min-w-0">
        <AppProfileHeader back={onBack ?? getCareerCenterReturnPath()} />
        <header className="py-6 mb-2">
          <h2 className="text-[18px] font-semibold mb-0.5" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Account & preferences</h2>
          <p className="text-[13px]" style={{ color: "var(--t3)" }}>Profile, app, Dilly, and more.</p>
        </header>
        <div className="flex gap-2 overflow-x-auto py-2 -mx-4 px-4 mb-6 scrollbar-hide">
          {[
            { id: "account", label: "Account" },
            { id: "app", label: "App" },
            { id: "habits", label: "Habits" },
            { id: "integrations", label: "Integrations" },
            { id: "profile", label: "Profile" },
            { id: "voice", label: "Dilly" },
            { id: "trust", label: "Privacy" },
            { id: "parent", label: "Parent" },
            { id: "gift", label: "Gift" },
            { id: "invite", label: "Invite" },
            { id: "scores", label: "Scores" },
          ].map(({ id, label }) => (
            <a key={id} href={`#${id}`} className="shrink-0 px-3 py-2 rounded-[18px] text-xs font-medium transition-colors min-h-[40px] flex items-center hover:bg-[var(--s3)]" style={{ background: "var(--s2)", color: "var(--t2)" }}>{label}</a>
          ))}
        </div>
        <div className="space-y-10">
          {/* Account */}
          <section id="account">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Account</h2>
            <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <Link
                href="/?edit=profile&from=settings"
                className="flex items-center justify-between gap-3 px-4 py-3.5 min-h-[52px] transition-colors hover:bg-white/5 active:bg-white/5"
                style={{ borderBottom: "1px solid var(--b1)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Edit profile</p>
                    <p className="text-xs truncate" style={{ color: "var(--t3)" }}>Portfolio, major, goals, job locations</p>
                  </div>
                </div>
                <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </Link>
              <button
                type="button"
                onClick={handleLogOut}
                className="flex items-center justify-between gap-3 w-full px-4 py-3.5 min-h-[52px] text-left transition-colors hover:bg-white/5 active:bg-white/5"
                style={{ color: "var(--coral)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(239, 68, 68, 0.15)" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Log out</p>
                    <p className="text-xs opacity-80">Sign out of your account</p>
                  </div>
                </div>
                <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </section>

          {/* App */}
          <section id="app">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>App</h2>
            <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Sound effects</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Audit complete, message sent, badges</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soundOn}
                  onClick={() => {
                    hapticLight();
                    const next = !soundOn;
                    setSoundEnabled(next);
                    setSoundOn(next);
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${soundOn ? "" : "opacity-60"}`}
                  style={{ background: soundOn ? "var(--blue)" : "var(--s3)" }}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${soundOn ? "left-7" : "left-1"}`} />
                </button>
              </div>
              <Link
                href="/settings/notifications"
                className="flex items-center justify-between gap-3 px-4 py-3.5 min-h-[52px] transition-colors hover:bg-white/5 active:bg-white/5"
                style={{ borderBottom: "1px solid var(--b1)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9a6 6 0 00-12 0v.05-.05v.7a8.967 8.967 0 01-2.31 6.022 23.848 23.848 0 005.454 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Notifications</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Career updates from Dilly</p>
                  </div>
                </div>
                <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </Link>
              <Link
                href="/?openStickerSheet=1"
                className="flex items-center justify-between gap-3 px-4 py-3.5 min-h-[52px] transition-colors hover:bg-white/5 active:bg-white/5"
                style={{ background: "var(--s3)", borderBottom: "1px solid var(--b1)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ background: "var(--s2)" }}>
                    <img src="/achievements-collection-icon.png" alt="" className="w-5 h-5 object-contain opacity-90" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold tracking-tight" style={{ color: "var(--t1)" }}>Achievements collection</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>
                      {ACHIEVEMENT_IDS.filter((id) => isUnlocked(id, profile?.achievements ?? {})).length} of {ACHIEVEMENT_IDS.length} earned. Tap to add to share cards (up to 3).
                    </p>
                  </div>
                </div>
                <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </Link>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>About Dilly</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Version and support</p>
                  </div>
                </div>
                <span className="text-xs shrink-0" style={{ color: "var(--t3)" }}>Coming soon</span>
              </div>
            </div>
          </section>

          {/* Habits */}
          <section id="habits">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Habits</h2>
            <div className="rounded-[18px] overflow-hidden space-y-0" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Rituals</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Weekly review, post-interview debrief</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={profile?.ritual_preferences?.rituals_enabled !== false}
                  onClick={() => {
                    hapticLight();
                    const next = profile?.ritual_preferences?.rituals_enabled !== false ? false : true;
                    saveProfile({ ritual_preferences: { ...(profile?.ritual_preferences ?? {}), rituals_enabled: next } });
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${profile?.ritual_preferences?.rituals_enabled !== false ? "" : "opacity-60"}`}
                  style={{ background: profile?.ritual_preferences?.rituals_enabled !== false ? "var(--blue)" : "var(--s3)" }}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${profile?.ritual_preferences?.rituals_enabled !== false ? "left-7" : "left-1"}`} />
                </button>
              </div>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>Weekly review day</label>
                <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>When to show your weekly review prompt.</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { day: 0, label: "Mon" },
                    { day: 1, label: "Tue" },
                    { day: 2, label: "Wed" },
                    { day: 3, label: "Thu" },
                    { day: 4, label: "Fri" },
                    { day: 5, label: "Sat" },
                    { day: 6, label: "Sun" },
                  ].map(({ day, label }) => {
                    const active = (profile?.ritual_preferences?.weekly_review_day ?? 6) === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => saveProfile({ ritual_preferences: { ...(profile?.ritual_preferences ?? {}), weekly_review_day: day } })}
                        className={`px-3 py-1.5 rounded-[18px] text-xs font-medium transition-colors ${
                          active ? "text-white" : "hover:opacity-90"
                        }`}
                        style={{ background: active ? "var(--blue)" : "var(--s3)", color: active ? "#fff" : "var(--t2)" }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Integrations + Portability */}
          <section id="integrations">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Integrations</h2>
            <div className="rounded-[18px] overflow-hidden space-y-0" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <button
                type="button"
                onClick={handleExport}
                disabled={exportLoading}
                className="flex items-center justify-between gap-3 w-full px-4 py-3.5 text-left transition-colors hover:opacity-90"
                style={{ borderBottom: "1px solid var(--b1)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Download everything</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Profile, audits, applications, deadlines. You own your data.</p>
                  </div>
                </div>
                {exportLoading ? (
                  <span className="text-xs" style={{ color: "var(--t3)" }}>Exporting…</span>
                ) : (
                  <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadCalendar}
                className="flex items-center justify-between gap-3 w-full px-4 py-3.5 min-h-[52px] text-left transition-colors hover:bg-white/5 active:bg-white/5"
                style={{ borderBottom: "1px solid var(--b1)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Add deadlines to calendar</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Export .ics for Google Calendar, Apple Calendar</p>
                  </div>
                </div>
                <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
              <Link
                href="/?tab=upload&paste=1"
                className="flex items-center justify-between gap-3 px-4 py-3.5 min-h-[52px] transition-colors hover:bg-white/5 active:bg-white/5"
                style={{ borderBottom: "1px solid var(--b1)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Import from paste</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Paste resume text to bootstrap your profile</p>
                  </div>
                </div>
                <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </Link>
              <div className="px-4 py-3.5">
                <p className="text-[11px]" style={{ color: "var(--t3)" }}>
                  <strong style={{ color: "var(--t2)" }}>What we sync vs store:</strong> Your data lives in Dilly. Export gives you a copy. Calendar export is one-way (we don&apos;t read your calendar). Import from paste adds to your profile.
                </p>
              </div>
              <div className="px-4 py-3.5" style={{ borderTop: "1px solid var(--b1)" }}>
                <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Coming soon</p>
                <ul className="text-[11px] space-y-1" style={{ color: "var(--t3)" }}>
                  <li>LinkedIn — sync experience, suggest profile updates</li>
                  <li>Email — parse recruiter emails for deadlines</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Profile & Share */}
          <section id="profile">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Profile & Share</h2>
            <div className="rounded-[18px] overflow-hidden space-y-0" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>Custom Tagline</label>
                <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>For share cards, snapshot, in-app. Not on recruiter-facing profile.</p>
                <div className="flex gap-2">
                  <Input
                    value={customTagline}
                    onChange={(e) => setCustomTagline(e.target.value)}
                    placeholder="e.g. Builder. Problem-solver. Ready."
                    className="flex-1 text-sm rounded-[18px] focus:ring-[var(--blue)]"
                    style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                  />
                  <Button size="sm" onClick={() => saveProfile({ custom_tagline: customTagline.trim() || null })} disabled={saving} className="rounded-[18px] text-white" style={{ background: "var(--blue)" }}>
                    Save
                  </Button>
                </div>
              </div>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>Profile Theme</label>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_THEME_IDS.map((id) => {
                    const t = PROFILE_THEMES[id];
                    const active = (profile?.profile_theme ?? "professional") === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => saveProfile({ profile_theme: id })}
                        className={`px-3 py-1.5 rounded-[18px] text-xs font-medium transition-colors ${active ? "text-white" : "hover:opacity-90"}`}
                        style={{ background: active ? "var(--blue)" : "var(--s3)", color: active ? "#fff" : "var(--t2)" }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Six-second profile (recruiter-facing) */}
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Six-second profile</p>
                <p className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>Customize what recruiters see. Your tagline, bio, and career goal appear on your share link—you control how you&apos;re presented.</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--t3)" }}>Professional tagline</label>
                    <div className="flex gap-2">
                      <Input
                        value={profileTagline}
                        onChange={(e) => setProfileTagline(e.target.value)}
                        placeholder="e.g. Pre-Med · Top 15% Grit"
                        className="flex-1 text-sm rounded-[18px] focus:ring-[var(--blue)]"
                        style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                      />
                      <Button size="sm" onClick={() => saveProfile({ profile_tagline: profileTagline.trim() || null })} disabled={saving} className="rounded-[18px] text-white" style={{ background: "var(--blue)" }}>
                        Save
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--t3)" }}>Short bio (optional)</label>
                    <textarea
                      value={profileBio}
                      onChange={(e) => setProfileBio(e.target.value)}
                      placeholder="1-2 lines about you"
                      className="w-full rounded-lg text-sm px-2.5 py-1.5 min-h-[52px] focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
                      style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                      rows={2}
                    />
                    <Button size="sm" className="mt-1 rounded-[18px] text-white" style={{ background: "var(--blue)" }} onClick={() => saveProfile({ profile_bio: profileBio.trim() || null })} disabled={saving}>
                      Save
                    </Button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--t3)" }}>Career goal</label>
                    <div className="flex gap-2">
                      <Input
                        value={careerGoal}
                        onChange={(e) => setCareerGoal(e.target.value)}
                        placeholder="e.g. Summer Analyst at Goldman"
                        className="flex-1 text-sm rounded-[18px] focus:ring-[var(--blue)]"
                        style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                      />
                      <Button size="sm" onClick={() => saveProfile({ career_goal: careerGoal.trim() || null })} disabled={saving} className="rounded-[18px] text-white" style={{ background: "var(--blue)" }}>
                        Save
                      </Button>
                    </div>
                  </div>
                  {profile?.profile_slug && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: "var(--t3)" }}>Recruiter profile link</label>
                      <div className="flex gap-2 items-center">
                        <span className="text-xs truncate flex-1" style={{ color: "var(--t2)" }}>
                          {typeof window !== "undefined" ? `${window.location.origin}/p/${profile.profile_slug}` : `/p/${profile.profile_slug}`}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-[18px] border-[var(--b2)]"
                          style={{ color: "var(--t2)" }}
                          onClick={() => {
                            const url = typeof window !== "undefined" ? `${window.location.origin}/p/${profile.profile_slug}` : "";
                            if (url) navigator.clipboard.writeText(url).then(() => toast("Link copied", "success"));
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Dilly (chat / assistant settings; section id stays voice for deep links) */}
          <section id="voice">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Dilly</h2>
            <div className="rounded-[18px] overflow-hidden space-y-0" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>Dilly avatar</label>
                <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>Avatar shown next to you in Dilly chat.</p>
                <div className="flex flex-wrap gap-2">
                  {VOICE_AVATAR_OPTIONS.map((_, idx) => {
                    const active = (profile?.voice_avatar_index ?? DEFAULT_VOICE_AVATAR_INDEX) === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => saveProfile({ voice_avatar_index: idx })}
                        className={`relative w-10 h-10 rounded-full overflow-hidden flex items-center justify-center p-0.5 border-2 transition-colors shrink-0 bg-white ${
                          active ? "ring-2 ring-[var(--blue)]/30" : "hover:opacity-90"
                        }`}
                        style={{ borderColor: active ? "var(--blue)" : "var(--b2)" }}
                        title={`Avatar ${idx + 1}`}
                      >
                        <img src={VOICE_AVATAR_OPTIONS[idx]} alt="" className="w-full h-full object-contain" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>Dilly tone</label>
                <div className="flex flex-wrap gap-2">
                  {VOICE_TONES.map(({ id, label }) => {
                    const active = (profile?.voice_tone ?? "encouraging") === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => saveProfile({ voice_tone: id })}
                        className={`px-3 py-1.5 rounded-[18px] text-xs font-medium transition-colors ${active ? "text-white" : "hover:opacity-90"}`}
                        style={{ background: active ? "var(--blue)" : "var(--s3)", color: active ? "#fff" : "var(--t2)" }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>Notes for Dilly to remember</label>
                <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>Thought bubble: things you want Dilly to know about you.</p>
                <div className="flex gap-2">
                  <Input
                    value={voiceNote}
                    onChange={(e) => setVoiceNote(e.target.value)}
                    placeholder="e.g. I'm targeting consulting roles"
                    className="flex-1 text-sm rounded-[18px] focus:ring-[var(--blue)]"
                    style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                  />
                  <Button size="sm" onClick={addVoiceNote} disabled={saving || !voiceNote.trim()} className="rounded-[18px] text-white" style={{ background: "var(--blue)" }}>
                    Add
                  </Button>
                </div>
                {profile?.voice_notes && profile.voice_notes.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--t3)" }}>
                    {profile.voice_notes.slice(-5).map((n, i) => (
                      <li key={i}>• {n}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="flex items-center gap-2 text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>
                  <input
                    type="checkbox"
                    checked={!!profile?.voice_always_end_with_ask}
                    onChange={(e) => saveProfile({ voice_always_end_with_ask: e.target.checked })}
                    className="rounded"
                    style={{ accentColor: "var(--blue)" }}
                  />
                  Always end with one ask (Dilly ends each reply with one question or call-to-action)
                </label>
              </div>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>Max recommendations per message</label>
                <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>Cap how many next steps or suggestions Dilly gives in one reply (1–3).</p>
                <div className="flex gap-2">
                  {[1, 2, 3].map((n) => {
                    const active = (profile?.voice_max_recommendations ?? 2) === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => saveProfile({ voice_max_recommendations: n })}
                        className={`px-3 py-1.5 rounded-[18px] text-xs font-medium transition-colors ${active ? "text-white" : "hover:opacity-90"}`}
                        style={{ background: active ? "var(--blue)" : "var(--s3)", color: active ? "#fff" : "var(--t2)" }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-4 py-3.5">
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>Proactive nudges</label>
                <p className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>What Dilly can surface without you asking. Turn off any you don&apos;t want.</p>
                <div className="space-y-2">
                  {[
                    { key: "deadline_nudges" as const, label: "Deadline reminders (e.g. Goldman in 5 days)" },
                    { key: "app_funnel_nudges" as const, label: "Application funnel (silent apps, follow-up templates)" },
                    { key: "relationship_nudges" as const, label: "Relationship check-ins (e.g. Sarah 3 weeks ago)" },
                    { key: "seasonal_nudges" as const, label: "Seasonal awareness (recruiting calendar)" },
                    { key: "score_nudges" as const, label: "Score wins (e.g. Grit up 8 points)" },
                  ].map(({ key, label }) => {
                    const prefs = profile?.nudge_preferences ?? {};
                    const checked = prefs[key] !== false;
                    return (
                      <label key={key} className="flex items-center gap-2 text-xs" style={{ color: "var(--t3)" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            saveProfile({
                              nudge_preferences: { ...prefs, [key]: e.target.checked },
                            })
                          }
                          className="rounded"
                          style={{ accentColor: "var(--blue)" }}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Share with parent */}
          <section id="parent">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Share with parent</h2>
            <div className="rounded-[18px] overflow-hidden space-y-0" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>Parent email</label>
                <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>For &quot;Email report to parent&quot; and optional milestone emails.</p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    placeholder="parent@example.com"
                    className="flex-1 text-sm rounded-[18px] focus:ring-[var(--blue)]"
                    style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                  />
                  <Button size="sm" onClick={() => saveProfile({ parent_email: parentEmail.trim() || null })} disabled={saving} className="rounded-[18px] text-white" style={{ background: "var(--blue)" }}>
                    Save
                  </Button>
                </div>
              </div>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <label className="flex items-center gap-2 text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>
                  <input
                    type="checkbox"
                    checked={!!profile?.parent_milestone_opt_in}
                    onChange={(e) => saveProfile({ parent_milestone_opt_in: e.target.checked })}
                    className="rounded"
                    style={{ accentColor: "var(--blue)" }}
                  />
                  Email parent when I hit milestones (e.g. run a resume audit)
                </label>
              </div>
              <div className="px-4 py-3.5">
                <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>Share a read-only link so they can see your scores and &quot;on track&quot; status. They never see your resume.</p>
                <Button
                  size="sm"
                  className="rounded-[18px] text-white"
                  style={{ background: "var(--blue)" }}
                  onClick={async () => {
                    const t = localStorage.getItem(AUTH_TOKEN_KEY);
                    if (!t) return;
                    const res = await fetch(`${API_BASE}/profile/parent-invite`, { method: "POST", headers: { Authorization: `Bearer ${t}` } });
                    if (!res.ok) return;
                    const j = await res.json();
                    setParentInviteLink(j.invite_link ?? null);
                    if (j.invite_link) navigator.clipboard.writeText(j.invite_link).then(() => toast("Link copied", "success"));
                  }}
                >
                  {parentInviteLink ? "Copy link again" : "Generate invite link"}
                </Button>
                {parentInviteLink && <p className="text-[11px] mt-2 break-all" style={{ color: "var(--t3)" }}>{parentInviteLink}</p>}
              </div>
            </div>
          </section>

          {/* Redeem a gift */}
          <section id="gift">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Redeem a gift</h2>
            <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <div className="px-4 py-3.5">
                <p className="text-sm mb-2" style={{ color: "var(--t2)" }}>Have a gift code? Enter it to activate your subscription.</p>
                <div className="flex gap-2">
                  <Input
                    value={giftCode}
                    onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
                    placeholder="GIFT-XXXX"
                    className="flex-1 text-sm font-mono rounded-[18px] focus:ring-[var(--blue)]"
                    style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                  />
                  <Button
                    size="sm"
                    className="rounded-[18px] text-white"
                    style={{ background: "var(--blue)" }}
                    disabled={!giftCode.trim() || redeemLoading}
                    onClick={async () => {
                      const t = localStorage.getItem(AUTH_TOKEN_KEY);
                      if (!t) { toast("Sign in first", "error"); return; }
                      setRedeemLoading(true);
                      try {
                        const res = await fetch(`${API_BASE}/auth/redeem-gift`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
                          body: JSON.stringify({ code: giftCode.trim() }),
                        });
                        const j = await res.json().catch(() => ({}));
                        if (res.ok) {
                          toast("Gift redeemed. You have full access.", "success");
                          setGiftCode("");
                          window.location.reload();
                        } else {
                          toast(j.detail || "Invalid or already redeemed code", "error");
                        }
                      } finally {
                        setRedeemLoading(false);
                      }
                    }}
                  >
                    {redeemLoading ? "Redeeming…" : "Redeem"}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Invite a friend */}
          <section id="invite">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Invite a Friend</h2>
            <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <div className="px-4 py-3.5">
                <p className="text-sm font-medium mb-1" style={{ color: "var(--t2)" }}>You both get a free month when they subscribe.</p>
                <p className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>Share your link. When a friend signs up and subscribes, we add 1 free month to both of you. Reward applies once they&apos;re paying.</p>
                <Button onClick={copyReferralLink} disabled={!profile?.referral_code} size="sm" className="rounded-[18px] text-white" style={{ background: "var(--blue)" }}>
                  Copy invite link
                </Button>
              </div>
            </div>
          </section>

          {/* How scores work */}
          <section id="scores">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>How scores work</h2>
            <div className="rounded-[18px] overflow-hidden px-4 py-4 space-y-4" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <div className="text-sm space-y-3" style={{ color: "var(--t2)" }}>
                <p><strong style={{ color: "var(--t1)" }}>What the scores are.</strong> Smart, Grit, and Build (0–100) show how well your resume signals what employers in your track look for. We only use what&apos;s on the page (Dilly Truth Standard).</p>
                <p><strong style={{ color: "var(--t1)" }}>What 100 means.</strong> Top of our scale for your field — not &quot;perfect&quot; or a guarantee of a job.</p>
                <p><strong style={{ color: "var(--t1)" }}>What we can do.</strong> Help you improve your resume so you signal more (recommendations, line edits). Stronger scores = stronger candidate.</p>
                <p><strong style={{ color: "var(--t1)" }}>What we can&apos;t do.</strong> Guarantee interviews or offers. Hiring depends on fit, timing, and the room.</p>
                <p style={{ color: "var(--t3)" }}>We&apos;re here to get your resume to that level. We can&apos;t guarantee outcomes.</p>
              </div>
              <p className="text-[11px] pt-2 border-t" style={{ borderColor: "var(--b1)", color: "var(--t3)" }}>
                Icons by <a href="https://icons8.com/l/glyph/" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-90" style={{ color: "var(--blue)" }}>Icons8</a>
              </p>
            </div>
          </section>

          {/* Trust & Privacy */}
          <section id="trust">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Trust & Privacy</h2>
            <div className="rounded-[18px] overflow-hidden space-y-0" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--b1)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--t1)" }}>Your data is yours. We never sell it.</p>
                <p className="text-xs" style={{ color: "var(--t3)" }}>Dilly stores your profile, resume, and career data to help you. We do not sell, rent, or share your data with advertisers.</p>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Save what I tell Dilly</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Skills, people, and companies you share with Dilly get saved to your profile for jobs and audits</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={profile?.voice_save_to_profile !== false}
                  onClick={() => {
                    hapticLight();
                    const next = profile?.voice_save_to_profile !== false ? false : true;
                    saveProfile({ voice_save_to_profile: next });
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${profile?.voice_save_to_profile !== false ? "" : "opacity-60"}`}
                  style={{ background: profile?.voice_save_to_profile !== false ? "var(--blue)" : "var(--s3)" }}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${profile?.voice_save_to_profile !== false ? "left-7" : "left-1"}`} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Full profile visible to recruiters</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>When recruiters click &quot;View full Dilly profile&quot; on your JD-tailored view</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={profile?.dilly_profile_visible_to_recruiters !== false}
                  onClick={() => {
                    hapticLight();
                    const next = profile?.dilly_profile_visible_to_recruiters !== false ? false : true;
                    saveProfile({ dilly_profile_visible_to_recruiters: next });
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${profile?.dilly_profile_visible_to_recruiters !== false ? "" : "opacity-60"}`}
                  style={{ background: profile?.dilly_profile_visible_to_recruiters !== false ? "var(--blue)" : "var(--s3)" }}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${profile?.dilly_profile_visible_to_recruiters !== false ? "left-7" : "left-1"}`} />
                </button>
              </div>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--t3)" }}>What recruiters see when full profile is on</p>
                <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>Toggle sections below to hide from recruiters. Scores, activity, applications, experience.</p>
                <div className="space-y-2">
                  {(["scores", "activity", "applications", "experience"] as const).map((key) => {
                    const label = { scores: "Scores", activity: "Activity", applications: "Applications", experience: "Experience" }[key];
                    const on = (profile?.dilly_profile_privacy ?? { [key]: true })[key] !== false;
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: "var(--t3)" }}>{label}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          onClick={() => {
                            hapticLight();
                            const prev = profile?.dilly_profile_privacy ?? { scores: true, activity: true, applications: true, experience: true };
                            saveProfile({ dilly_profile_privacy: { ...prev, [key]: !on } });
                          }}
                          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? "" : "opacity-60"}`}
                          style={{ background: on ? "var(--blue)" : "var(--s3)" }}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-5" : "left-0.5"}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={exportLoading}
                className="flex items-center justify-between gap-3 w-full px-4 py-3.5 min-h-[52px] text-left transition-colors hover:bg-white/5 active:bg-white/5 disabled:hover:bg-transparent disabled:opacity-60"
                style={{ borderBottom: "1px solid var(--b1)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--s3)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Download your data</p>
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Profile, audits, applications, deadlines. You own it.</p>
                  </div>
                </div>
                {exportLoading ? (
                  <span className="text-xs" style={{ color: "var(--t3)" }}>Exporting…</span>
                ) : (
                  <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                )}
              </button>
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
                <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Security</p>
                <p className="text-xs" style={{ color: "var(--t3)" }}>Data encrypted in transit (HTTPS). We use your data only to run audits, match jobs, and power Dilly. We do not train AI on your data.</p>
              </div>
              <div className="px-4 py-3.5">
                <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Need human help?</p>
                <p className="text-xs" style={{ color: "var(--t3)" }}>Contact your campus career center for in-person support. For Dilly support: <a href="mailto:support@trydilly.com" className="underline hover:opacity-90" style={{ color: "var(--blue)" }}>support@trydilly.com</a></p>
              </div>
            </div>
          </section>

          {/* Delete account — bottom of settings */}
          <section id="delete-account" className="pt-4 pb-8">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Delete account</h2>
            <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--s2)", borderLeft: "4px solid var(--coral)" }}>
              <div className="px-4 py-3.5">
                <p className="text-sm mb-2" style={{ color: "var(--t2)" }}>Permanently delete your account and all data. This cannot be undone.</p>
                {!deleteAccountConfirm ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-[18px] border-[var(--coral)] hover:opacity-90"
                    style={{ color: "var(--coral)" }}
                    onClick={() => setDeleteAccountConfirm(true)}
                  >
                    Delete my account
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: "var(--t3)" }}>Are you sure? Your profile, audits, and data will be removed and you will be signed out.</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 rounded-[18px] border-[var(--b2)]"
                        style={{ color: "var(--t2)" }}
                        onClick={() => setDeleteAccountConfirm(false)}
                        disabled={deleteAccountLoading}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1 rounded-[18px] text-white"
                        style={{ background: "var(--coral)" }}
                        disabled={deleteAccountLoading}
                        onClick={async () => {
                          const token = localStorage.getItem(AUTH_TOKEN_KEY);
                          if (!token) {
                            toast("You are not signed in.", "error");
                            return;
                          }
                          setDeleteAccountLoading(true);
                          try {
                            const res = await fetch(`${API_BASE}/account/delete`, {
                              method: "POST",
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            if (res.ok) {
                              try {
                                localStorage.removeItem(AUTH_TOKEN_KEY);
                                const keysToRemove: string[] = [];
                                for (let i = 0; i < localStorage.length; i++) {
                                  const k = localStorage.key(i);
                                  if (k && (k === PROFILE_CACHE_KEY_BASE || k.startsWith(PROFILE_CACHE_KEY_BASE + "_"))) keysToRemove.push(k);
                                }
                                keysToRemove.forEach((k) => localStorage.removeItem(k));
                              } catch {}
                              toast("Account deleted.", "success");
                              router.replace("/");
                              return;
                            }
                            const j = await res.json().catch(() => ({}));
                            toast((j.detail as string) || "Could not delete account", "error");
                          } catch {
                            toast("Could not delete account", "error");
                          } finally {
                            setDeleteAccountLoading(false);
                          }
                        }}
                      >
                        {deleteAccountLoading ? "Deleting…" : "Yes, delete my account"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
