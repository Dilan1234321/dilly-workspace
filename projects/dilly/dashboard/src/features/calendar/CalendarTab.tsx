"use client";

import React, { useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useToast } from "@/hooks/useToast";
import { useDillyVoiceNotification } from "@/context/DillyVoiceNotificationContext";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { getEffectiveCohortLabel } from "@/lib/trackDefinitions";
import { safeUuid } from "@/lib/dillyUtils";
import { AppProfileHeader } from "@/components/career-center";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import type { AuditV2, DillyDeadline, DillySubDeadline } from "@/types/dilly";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CalendarTabProps {
  saveProfile: (patch: Record<string, unknown>) => Promise<boolean>;
  openVoiceWithNewChat: (prompt: string, convoTitle?: string) => void;
  profilePhotoUrl: string | null;
  latestAuditRef: React.RefObject<AuditV2 | null>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CalendarTab({
  saveProfile,
  openVoiceWithNewChat,
  profilePhotoUrl,
  latestAuditRef,
}: CalendarTabProps) {
  const { appProfile, school } = useAppContext();
  const { audit, savedAuditForCenter } = useAuditScore();
  const { voiceAvatarIndex } = useVoice();
  const { toast } = useToast();
  const { showVoiceNotification } = useDillyVoiceNotification();

  // ── Local state (was page-level, only used here) ──────────────────────────
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<string | null>(null);
  const [calAddLabel, setCalAddLabel] = useState("");
  const [calAddDate, setCalAddDate] = useState("");
  const [calAddSubLabel, setCalAddSubLabel] = useState("");
  const [calAddSubDate, setCalAddSubDate] = useState("");
  const [calAddParentId, setCalAddParentId] = useState<string | null>(null);
  const [calAddOpen, setCalAddOpen] = useState(false);
  const [calRenamingId, setCalRenamingId] = useState<string | null>(null);
  const [calRenameValue, setCalRenameValue] = useState("");
  const [calRenamingSubId, setCalRenamingSubId] = useState<{ parentId: string; subId: string } | null>(null);
  const [calRenameSubValue, setCalRenameSubValue] = useState("");

  // ── Derived ───────────────────────────────────────────────────────────────
  const allDeadlines: DillyDeadline[] = (appProfile?.deadlines || []).filter((d) => d.date && d.label);
  const { year, month } = calendarMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const totalCells = startPad + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  const todayStr = new Date().toISOString().slice(0, 10);
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const deadlineMap: Record<string, { main: DillyDeadline[]; sub: { dl: DillyDeadline; sub: DillySubDeadline }[] }> = {};
  for (const dl of allDeadlines) {
    if (!deadlineMap[dl.date]) deadlineMap[dl.date] = { main: [], sub: [] };
    deadlineMap[dl.date].main.push(dl);
    for (const sub of dl.subDeadlines || []) {
      if (!deadlineMap[sub.date]) deadlineMap[sub.date] = { main: [], sub: [] };
      deadlineMap[sub.date].sub.push({ dl, sub });
    }
  }

  const selectedEntry = calendarSelectedDay ? deadlineMap[calendarSelectedDay] : null;
  const selectedDayDeadlines = selectedEntry ? [...selectedEntry.main] : [];
  const selectedDaySubDeadlines = selectedEntry ? selectedEntry.sub : [];

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDayClick = (dateStr: string) => {
    setCalendarSelectedDay((prev) => prev === dateStr ? null : dateStr);
    setCalAddOpen(false);
  };

  const handleAddDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calAddLabel.trim() || !calAddDate) return;
    const label = calAddLabel.trim();
    const newDl: DillyDeadline = {
      id: safeUuid(),
      label,
      date: calAddDate,
      createdBy: "user",
      subDeadlines: [],
    };
    const updated = [...allDeadlines, newDl];
    const ok = await saveProfile({ deadlines: updated });
    setCalAddLabel(""); setCalAddDate(""); setCalAddOpen(false);
    setCalendarSelectedDay(calAddDate);
    if (ok) showVoiceNotification(`I noted "${label}". Ask me to help you prep.`);
  };

  const handleAddSubDeadline = async (parentId: string) => {
    if (!calAddSubLabel.trim() || !calAddSubDate) return;
    const newSub: DillySubDeadline = { id: safeUuid(), label: calAddSubLabel.trim(), date: calAddSubDate };
    const updated = allDeadlines.map((dl) => dl.id === parentId ? { ...dl, subDeadlines: [...(dl.subDeadlines || []), newSub] } : dl);
    await saveProfile({ deadlines: updated });
    setCalAddSubLabel(""); setCalAddSubDate(""); setCalAddParentId(null);
  };

  const handleCompleteDeadline = async (id: string) => {
    const updated = allDeadlines.map((dl) => dl.id === id ? { ...dl, completedAt: Date.now() } : dl);
    await saveProfile({ deadlines: updated });
    showVoiceNotification("I noted you completed it. Ask me what's next.");
  };

  const handleDeleteDeadline = async (id: string) => {
    const updated = allDeadlines.filter((dl) => dl.id !== id);
    await saveProfile({ deadlines: updated });
    if (calendarSelectedDay && !updated.some((d) => d.date === calendarSelectedDay || d.subDeadlines?.some((s) => s.date === calendarSelectedDay))) {
      setCalendarSelectedDay(null);
    }
  };

  const handleDeleteSubDeadline = async (parentId: string, subId: string) => {
    const updated = allDeadlines.map((dl) => dl.id === parentId ? { ...dl, subDeadlines: (dl.subDeadlines || []).filter((s) => s.id !== subId) } : dl);
    await saveProfile({ deadlines: updated });
  };

  const commitRenameDeadline = async () => {
    if (!calRenamingId) return;
    const trimmed = calRenameValue.trim();
    if (trimmed) {
      const updated = allDeadlines.map((dl) => dl.id === calRenamingId ? { ...dl, label: trimmed } : dl);
      await saveProfile({ deadlines: updated });
    }
    setCalRenamingId(null);
    setCalRenameValue("");
  };

  const commitRenameSubDeadline = async () => {
    if (!calRenamingSubId) return;
    const trimmed = calRenameSubValue.trim();
    if (trimmed) {
      const updated = allDeadlines.map((dl) =>
        dl.id === calRenamingSubId.parentId
          ? { ...dl, subDeadlines: (dl.subDeadlines || []).map((s) => s.id === calRenamingSubId.subId ? { ...s, label: trimmed } : s) }
          : dl
      );
      await saveProfile({ deadlines: updated });
    }
    setCalRenamingSubId(null);
    setCalRenameSubValue("");
  };

  const now = Date.now();
  const upcomingWithPrep = allDeadlines
    .filter((d) => d.date && new Date(d.date).getTime() > now)
    .map((d) => ({ ...d, daysUntil: Math.ceil((new Date(d.date).getTime() - now) / 86400000) }))
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="career-center-talent min-h-full w-full" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
    <section className="max-w-[375px] mx-auto pb-40 px-4 sm:px-0 animate-fade-up" aria-label="Calendar">
      <AppProfileHeader
        name={appProfile?.name ?? undefined}
        track={getEffectiveCohortLabel((latestAuditRef.current ?? audit ?? savedAuditForCenter)?.detected_track, appProfile?.track)}
        schoolName={school?.name ?? undefined}
        photoUrl={profilePhotoUrl ?? undefined}
        className="mb-4"
      />
      <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-center sm:justify-between">
        <header className="text-left py-0 mb-0">
          <h2 className="text-xl font-semibold" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Calendar</h2>
          <p className="text-sm mt-0.5 mb-0" style={{ color: "var(--t3)" }}>Your deadlines, milestones, and goals.</p>
        </header>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {allDeadlines.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const events = allDeadlines.filter((d) => d.date && d.label);
                const now = new Date();
                const dtstamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
                const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dilly//Career Deadlines//EN", "CALSCALE:GREGORIAN", ...events.flatMap((e, i) => {
                  const date = (e.date ?? "").slice(0, 10).replace(/-/g, "");
                  const uid = e.id ?? `deadline-${i}-${date}`;
                  return ["BEGIN:VEVENT", `UID:dilly-${uid}@trydilly.com`, `DTSTAMP:${dtstamp}`, `DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${date}`, `SUMMARY:${(e.label || "Deadline").replace(/\n/g, " ")}`, "END:VEVENT"];
                }), "END:VCALENDAR"];
                const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "dilly-deadlines.ics";
                a.click();
                URL.revokeObjectURL(a.href);
                hapticSuccess();
                toast("Calendar file downloaded. Add to Google or Apple Calendar.", "success");
              }}
              className="text-xs font-medium px-3 py-2 rounded-[12px] flex items-center gap-1.5 transition-colors"
              style={{ border: "1px solid var(--b1)", color: "var(--t2)", background: "var(--s2)" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export
            </button>
          )}
          <button
            type="button"
            onClick={() => { setCalAddOpen((v) => !v); setCalendarSelectedDay(null); }}
            className="text-sm font-semibold px-4 py-2.5 flex items-center justify-center gap-1.5 rounded-[12px] transition-colors ml-auto sm:ml-0"
            style={{ background: "var(--blue)", color: "#fff" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Deadline
          </button>
        </div>
      </div>

      {/* Pre-deadline prep hub */}
      {upcomingWithPrep.length > 0 && (
        <div className="voice-chat-container p-4 mb-4 cal-confirm-card cal-drawer" style={{ borderLeft: "4px solid var(--blue)" }}>
          <p className="font-semibold text-sm mb-2 flex items-center gap-2" style={{ color: "var(--t1)" }}>
            <span className="text-lg" aria-hidden>📋</span>
            Pre-deadline prep
          </p>
          <p className="text-xs mb-3" style={{ color: "var(--t3)" }}>Resume Review recommended 2 weeks before each deadline.</p>
          <div className="space-y-2">
            {upcomingWithPrep.slice(0, 3).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-[12px]" style={{ background: "var(--s3)" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--t1)" }}>{d.label}</p>
                  <p className="text-[11px]" style={{ color: "var(--t3)" }}>
                    {d.daysUntil <= 14 ? `Resume review recommended now (${d.daysUntil}d left)` : `${d.daysUntil} days away. Review in ${Math.max(0, d.daysUntil - 14)}d`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openVoiceWithNewChat(`I have "${d.label}" in ${d.daysUntil} days. Help me prepare. What should I focus on for my resume and application?`)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-[12px] shrink-0 inline-flex items-center gap-1 transition-opacity hover:opacity-90"
                  style={{ background: "var(--blue)", color: "#fff" }}
                >
                  <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="ring-2 ring-white/30" />
                  How can I help?
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Deadline form */}
      {calAddOpen && (
        <div className="voice-chat-container p-4 mb-4 cal-confirm-card cal-drawer" style={{ borderLeft: "4px solid var(--blue)" }}>
          <p className="font-semibold text-sm mb-3" style={{ color: "var(--t1)" }}>New Deadline</p>
          <form onSubmit={handleAddDeadline} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={calAddLabel}
                onChange={(e) => setCalAddLabel(e.target.value)}
                placeholder="E.g. Career Fair Prep"
                className="flex-1 px-3.5 py-2 text-sm rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
              />
              <input
                type="date"
                value={calAddDate}
                onChange={(e) => setCalAddDate(e.target.value)}
                className="px-3 py-2 text-sm rounded-[12px] w-36 focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={!calAddLabel.trim() || !calAddDate} className="text-sm font-semibold px-5 py-2 rounded-[12px] transition-opacity disabled:opacity-50" style={{ background: "var(--blue)", color: "#fff" }}>Add</button>
              <button type="button" onClick={() => setCalAddOpen(false)} className="text-sm px-3 py-2 transition-colors" style={{ color: "var(--t3)" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          type="button"
          onClick={() => setCalendarMonth((m) => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
          className="p-2 rounded-[12px] transition-colors"
          style={{ color: "var(--t3)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        <h3 className="font-semibold text-base tracking-tight" style={{ color: "var(--t1)" }}>{MONTH_NAMES[month]} {year}</h3>
        <button
          type="button"
          onClick={() => setCalendarMonth((m) => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
          className="p-2 rounded-[12px] transition-colors"
          style={{ color: "var(--t3)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>

      {/* Calendar grid */}
      <div className="voice-chat-container p-3 mb-4">
        {/* Day labels */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold py-1" style={{ color: "var(--t3)" }}>{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: rows * 7 }).map((_, idx) => {
            const dayNum = idx - startPad + 1;
            const isCurrentMonth = dayNum >= 1 && dayNum <= lastDay.getDate();
            const paddedMonth = String(month + 1).padStart(2, "0");
            const paddedDay = String(dayNum).padStart(2, "0");
            const dateStr = isCurrentMonth ? `${year}-${paddedMonth}-${paddedDay}` : "";
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === calendarSelectedDay;
            const entry = dateStr ? deadlineMap[dateStr] : undefined;
            const hasDeadlines = !!(entry && (entry.main.length > 0 || entry.sub.length > 0));

            return (
              <div
                key={idx}
                onClick={() => { if (dateStr) handleDayClick(dateStr); }}
                className={`cal-grid-cell p-1 flex flex-col gap-0.5 ${!isCurrentMonth ? "cal-other-month" : ""} ${isToday ? "cal-today" : ""} ${isSelected ? "cal-selected" : ""} ${!dateStr ? "pointer-events-none" : ""}`}
              >
                <span
                  className="text-[11px] font-medium self-end pr-0.5"
                  style={{ color: isToday ? "var(--coral)" : isCurrentMonth ? "var(--t2)" : "var(--t3)" }}
                >
                  {isCurrentMonth ? dayNum : ""}
                </span>
                {hasDeadlines && (
                  <div className="space-y-0.5 overflow-hidden">
                    {(entry?.main || []).slice(0, 2).map((dl) => (
                      <span key={dl.id} className="cal-pill cal-pill-main truncate">{dl.label}</span>
                    ))}
                    {(entry?.sub || []).slice(0, 1).map(({ sub }, i) => (
                      <span key={i} className="cal-pill cal-pill-sub truncate">{sub.label}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail drawer */}
      {calendarSelectedDay && (
        <div className="cal-deadline-card p-4 mb-4 cal-drawer" style={{ borderLeft: "4px solid var(--blue)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm" style={{ color: "var(--t1)" }}>
              {new Date(calendarSelectedDay + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <button
              type="button"
              onClick={() => { setCalAddOpen(true); setCalAddDate(calendarSelectedDay); }}
              className="text-xs px-2.5 py-1 rounded-[12px] flex items-center gap-1 transition-colors"
              style={{ color: "var(--t3)" }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add
            </button>
          </div>

          {selectedDayDeadlines.length === 0 && selectedDaySubDeadlines.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--t3)" }}>No Deadlines on This Day.</p>
          ) : (
            <div className="space-y-3">
              {selectedDayDeadlines.map((dl) => {
                const daysAway = Math.round((new Date(dl.date + "T00:00").getTime() - Date.now()) / 86400000);
                const urgentColor = daysAway < 0 ? "var(--t3)" : daysAway <= 3 ? "var(--coral)" : daysAway <= 7 ? "var(--amber)" : "var(--t3)";
                const isRenaming = calRenamingId === dl.id;
                const isCompleted = !!dl.completedAt;
                return (
                  <div key={dl.id}>
                    <div className={`cal-confirm-pill flex items-start justify-between gap-2 ${isCompleted ? "opacity-80" : ""}`}>
                      <div className="flex-1 min-w-0">
                        {isRenaming ? (
                          <form onSubmit={(e) => { e.preventDefault(); commitRenameDeadline(); }} className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              type="text"
                              value={calRenameValue}
                              onChange={(e) => setCalRenameValue(e.target.value)}
                              onBlur={commitRenameDeadline}
                              onKeyDown={(e) => { if (e.key === "Escape") { setCalRenamingId(null); setCalRenameValue(""); } }}
                              className="flex-1 px-2.5 py-1 text-sm font-medium rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                              style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                            />
                          </form>
                        ) : (
                          <>
                            <p
                              className={`text-sm font-medium truncate cursor-text transition-colors ${isCompleted ? "line-through" : ""}`}
                              style={{ color: isCompleted ? "var(--t3)" : "var(--t1)" }}
                              onClick={() => { setCalRenamingId(dl.id); setCalRenameValue(dl.label); }}
                              title={isCompleted ? "Done (stays on calendar)" : "Click to rename"}
                            >{dl.label}{isCompleted ? " ✓" : ""}</p>
                            <p className="text-xs mt-0.5" style={{ color: isCompleted ? "var(--t3)" : urgentColor }}>
                              {isCompleted ? "Done" : daysAway < 0 ? "Deadline passed" : daysAway === 0 ? "Less than a day away" : `${daysAway}d away`}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isCompleted && (
                          <button
                            type="button"
                            onClick={() => setCalAddParentId((v) => v === dl.id ? null : dl.id)}
                            className="text-xs px-2 py-1 rounded-[12px] transition-colors"
                            style={{ color: "var(--t3)" }}
                            title="Add sub-deadline"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                          </button>
                        )}
                        {!isCompleted && (
                          <button
                            type="button"
                            onClick={() => handleCompleteDeadline(dl.id)}
                            className="p-1.5 rounded-[12px] transition-colors"
                            style={{ color: "var(--t3)" }}
                            title="Mark done (stays on calendar, Dilly remembers)"
                            aria-label="Mark done"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteDeadline(dl.id)}
                          className="p-1.5 rounded-[12px] transition-colors"
                          style={{ color: "var(--t3)" }}
                          title="Delete from everywhere"
                          aria-label="Delete deadline"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                    {/* Sub-deadlines under this parent */}
                    {(dl.subDeadlines || []).map((sub) => {
                      const subDays = Math.round((new Date(sub.date + "T00:00").getTime() - Date.now()) / 86400000);
                      const isRenamingSub = calRenamingSubId?.parentId === dl.id && calRenamingSubId?.subId === sub.id;
                      return (
                        <div key={sub.id} className="cal-sub-pill flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {isRenamingSub ? (
                              <form onSubmit={(e) => { e.preventDefault(); commitRenameSubDeadline(); }} className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  type="text"
                                  value={calRenameSubValue}
                                  onChange={(e) => setCalRenameSubValue(e.target.value)}
                                  onBlur={commitRenameSubDeadline}
                                  onKeyDown={(e) => { if (e.key === "Escape") { setCalRenamingSubId(null); setCalRenameSubValue(""); } }}
                                  className="flex-1 px-2 py-1 text-xs rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                                  style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                                />
                              </form>
                            ) : (
                              <>
                                <p
                                  className="text-xs truncate cursor-text transition-colors"
                                  style={{ color: "var(--t2)" }}
                                  onClick={() => { setCalRenamingSubId({ parentId: dl.id, subId: sub.id }); setCalRenameSubValue(sub.label); }}
                                  title="Click to rename"
                                >{sub.label}</p>
                                <p className="text-[10px]" style={{ color: "var(--t3)" }}>{sub.date} &bull; {subDays >= 0 ? (subDays === 0 ? "Less than a day away" : `${subDays}d away`) : `${Math.abs(subDays)}d ago`}</p>
                              </>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubDeadline(dl.id, sub.id)}
                            className="p-0.5 shrink-0 transition-colors"
                            style={{ color: "var(--t3)" }}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      );
                    })}
                    {/* Add sub-deadline inline form */}
                    {calAddParentId === dl.id && (
                      <div className="ml-4 mt-2 cal-sub-pill cal-drawer">
                        <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Add milestone under this</p>
                        <div className="flex gap-2 flex-wrap">
                          <input
                            type="text"
                            value={calAddSubLabel}
                            onChange={(e) => setCalAddSubLabel(e.target.value)}
                            placeholder="E.g. Career Fair"
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                            style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                          />
                          <input
                            type="date"
                            value={calAddSubDate}
                            onChange={(e) => setCalAddSubDate(e.target.value)}
                            className="px-2 py-1.5 text-xs rounded-[12px] w-32 focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                            style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddSubDeadline(dl.id)}
                            disabled={!calAddSubLabel.trim() || !calAddSubDate}
                            className="text-xs font-semibold px-3 py-1.5 rounded-[12px] transition-opacity disabled:opacity-50"
                            style={{ background: "var(--blue)", color: "#fff" }}
                          >Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {selectedDaySubDeadlines.map(({ dl, sub }) => (
                <div key={sub.id} className="cal-sub-pill flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ color: "var(--t2)" }}>{sub.label}</p>
                    <p className="text-[10px]" style={{ color: "var(--t3)" }}>Part of: {dl.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All upcoming deadlines list (active only; completed stay in calendar only) */}
      {allDeadlines.filter((d) => !d.completedAt).length > 0 && (
        <div className="voice-chat-container p-4" style={{ borderLeft: "4px solid var(--blue)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t3)" }}>All deadlines</p>
          <div className="space-y-3">
            {[...allDeadlines].filter((d) => !d.completedAt).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((dl) => {
              const daysAway = Math.round((new Date(dl.date + "T00:00").getTime() - Date.now()) / 86400000);
              const urgentColor = daysAway < 0 ? "var(--t3)" : daysAway <= 3 ? "var(--coral)" : daysAway <= 7 ? "var(--amber)" : daysAway <= 14 ? "var(--amber)" : "var(--t3)";
              const urgentBadge = daysAway >= 0 && (daysAway <= 3 ? "CRITICAL" : daysAway <= 7 ? "URGENT" : daysAway <= 14 ? "SOON" : null);
              const isRenamingThis = calRenamingId === dl.id;
              return (
                <div key={dl.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-[12px] flex items-center justify-center shrink-0 mt-0.5" style={{ background: "var(--bdim)", border: "1px solid var(--blue)" }}>
                    <svg className="w-4 h-4" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isRenamingThis ? (
                        <form onSubmit={(e) => { e.preventDefault(); commitRenameDeadline(); }} className="flex-1">
                          <input
                            autoFocus
                            type="text"
                            value={calRenameValue}
                            onChange={(e) => setCalRenameValue(e.target.value)}
                            onBlur={commitRenameDeadline}
                            onKeyDown={(e) => { if (e.key === "Escape") { setCalRenamingId(null); setCalRenameValue(""); } }}
                            className="w-full px-2.5 py-1 text-sm font-medium rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                            style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                          />
                        </form>
                      ) : (
                        <>
                          <p
                            className="text-sm font-medium cursor-text transition-colors"
                            style={{ color: "var(--t1)" }}
                            onClick={() => { setCalRenamingId(dl.id); setCalRenameValue(dl.label); }}
                            title="Click to rename"
                          >{dl.label}</p>
                          {urgentBadge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[8px]" style={{ background: daysAway <= 3 ? "rgba(255,69,58,0.15)" : daysAway <= 7 ? "var(--adim)" : "var(--adim)", color: daysAway <= 3 ? "var(--coral)" : "var(--amber)" }}>{urgentBadge}</span>}
                          {dl.createdBy === "dilly" && <span className="text-[10px] px-1.5 py-0.5 rounded-[8px]" style={{ color: "var(--t3)", background: "var(--s3)" }}>by Dilly</span>}
                        </>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: urgentColor }}>{dl.date} &bull; {daysAway < 0 ? "Deadline passed" : daysAway === 0 ? "Less than a day away" : `${daysAway}d away`}</p>
                    {(dl.subDeadlines || []).map((sub) => {
                      const subDays = Math.round((new Date(sub.date + "T00:00").getTime() - Date.now()) / 86400000);
                      const isRenamingThisSub = calRenamingSubId?.parentId === dl.id && calRenamingSubId?.subId === sub.id;
                      return (
                        <div key={sub.id} className="mt-1.5 flex items-center gap-2 ml-3 pl-2" style={{ borderLeft: "2px solid var(--b1)" }}>
                          <div className="flex-1 min-w-0">
                            {isRenamingThisSub ? (
                              <form onSubmit={(e) => { e.preventDefault(); commitRenameSubDeadline(); }}>
                                <input
                                  autoFocus
                                  type="text"
                                  value={calRenameSubValue}
                                  onChange={(e) => setCalRenameSubValue(e.target.value)}
                                  onBlur={commitRenameSubDeadline}
                                  onKeyDown={(e) => { if (e.key === "Escape") { setCalRenamingSubId(null); setCalRenameSubValue(""); } }}
                                  className="w-full px-2 py-0.5 text-xs rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                                  style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                                />
                              </form>
                            ) : (
                              <>
                                <p
                                  className="text-xs truncate cursor-text transition-colors"
                                  style={{ color: "var(--t3)" }}
                                  onClick={() => { setCalRenamingSubId({ parentId: dl.id, subId: sub.id }); setCalRenameSubValue(sub.label); }}
                                  title="Click to rename"
                                >{sub.label}</p>
                                <p className="text-[10px]" style={{ color: "var(--t3)" }}>{sub.date} &bull; {subDays < 0 ? "Deadline passed" : subDays === 0 ? "Less than a day away" : `${subDays}d away`}</p>
                              </>
                            )}
                          </div>
                          <button type="button" onClick={() => handleDeleteSubDeadline(dl.id, sub.id)} className="p-0.5 shrink-0 transition-colors" style={{ color: "var(--t3)" }}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button type="button" onClick={() => handleCompleteDeadline(dl.id)} className="p-1.5 rounded-[12px] transition-colors" style={{ color: "var(--t3)" }} title="Mark done (stays on calendar)"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                    <button type="button" onClick={() => handleDeleteDeadline(dl.id)} className="p-1.5 rounded-[12px] transition-colors" style={{ color: "var(--t3)" }} title="Delete from everywhere"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allDeadlines.length === 0 && !calAddOpen && (
        <div className="voice-chat-container p-10 text-center voice-empty" style={{ borderLeft: "4px solid var(--blue)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--bdim)", border: "1px solid var(--blue)" }}>
            <svg className="w-7 h-7" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          </div>
          <p className="font-semibold text-lg mb-1" style={{ color: "var(--t1)" }}>No deadlines yet</p>
          <p className="text-sm max-w-xs mx-auto mb-5" style={{ color: "var(--t3)" }}>Add your application deadlines, interviews, and events. Dilly will use these to keep you on track.</p>
          <button type="button" onClick={() => setCalAddOpen(true)} className="text-sm font-semibold px-6 py-2.5 inline-flex items-center gap-2 rounded-[12px] transition-opacity hover:opacity-90" style={{ background: "var(--blue)", color: "#fff" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add your first deadline
          </button>
        </div>
      )}
    </section>
    </div>
  );
}
