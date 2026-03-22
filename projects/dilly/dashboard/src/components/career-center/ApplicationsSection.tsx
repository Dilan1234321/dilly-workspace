"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, AUTH_TOKEN_KEY } from "@/lib/dillyUtils";
import { TWENTY_X_MOMENTS, formatTwentyXCompact } from "@/lib/twentyXMoments";

type AppStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected";

type Application = {
  id: string;
  company: string;
  role: string;
  status: AppStatus;
  applied_at: string | null;
  deadline: string | null;
  match_pct: number | null;
  job_id: string | null;
  job_url: string | null;
  notes: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
  outcome_captured: boolean;
};

const STATUS_ORDER: AppStatus[] = ["saved", "applied", "interviewing", "offer", "rejected"];

const STATUS_LABELS: Record<AppStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<AppStatus, { bg: string; border: string; text: string; dot: string }> = {
  saved: { bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)", text: "#94a3b8", dot: "#94a3b8" },
  applied: { bg: "rgba(201,168,130,0.08)", border: "rgba(201,168,130,0.25)", text: "#c9a882", dot: "#c9a882" },
  interviewing: { bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.25)", text: "#60a5fa", dot: "#60a5fa" },
  offer: { bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.25)", text: "#4ade80", dot: "#4ade80" },
  rejected: { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)", text: "#f87171", dot: "#f87171" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch { return iso; }
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function StatusPill({ status, size = "md" }: { status: AppStatus; size?: "sm" | "md" }) {
  const c = STATUS_COLORS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${size === "sm" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"}`}
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function AddModal({ onClose, onAdd }: { onClose: () => void; onAdd: (app: Partial<Application>) => void }) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<AppStatus>("applied");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;
    setSaving(true);
    await onAdd({ company: company.trim(), role: role.trim(), status, deadline: deadline || null, notes: notes.trim() || null });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="applications-add-title"
        className="w-full max-w-[375px] rounded-t-2xl p-5 animate-fade-up border-t outline-none"
        style={{
          background: "var(--bg)",
          borderColor: "var(--b1)",
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="applications-add-title" className="text-[15px] font-semibold" style={{ color: "var(--t1)" }}>Add application</h2>
          <button type="button" onClick={onClose} className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center transition-opacity hover:opacity-80" style={{ color: "var(--t3)" }} aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Company *</label>
            <input autoFocus type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Goldman Sachs" className="w-full px-3 py-2 rounded-lg text-sm" style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }} maxLength={200} required />
          </div>
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Role *</label>
            <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Summer Analyst" className="w-full px-3 py-2 rounded-lg text-sm" style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }} maxLength={200} required />
          </div>
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Status</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className="text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all"
                  style={status === s ? { background: STATUS_COLORS[s].bg, border: `1px solid ${STATUS_COLORS[s].border}`, color: STATUS_COLORS[s].text } : { background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)" }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Deadline (optional)</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }} />
          </div>
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Recruiter name, referral, anything relevant..." className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }} rows={2} maxLength={500} />
          </div>
          <button type="submit" disabled={saving || !company.trim() || !role.trim()} className="w-full py-3 text-[13px] font-bold mt-1 rounded-[18px] transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50" style={{ background: "var(--blue)", color: "#fff" }}>
            {saving ? "Adding…" : "Add application"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ApplicationCard({
  app,
  onStatusChange,
  onDelete,
  onPrepWithVoice,
}: {
  app: Application;
  onStatusChange: (id: string, status: AppStatus) => void;
  onDelete: (id: string) => void;
  onPrepWithVoice: (app: Application) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const days = daysUntil(app.deadline);
  const isUrgent = days !== null && days <= 3 && days >= 0;

  return (
    <div className="rounded-[12px] overflow-hidden" style={{ background: "var(--s3)", border: `1px solid ${app.status === "offer" ? "rgba(74,222,128,0.3)" : isUrgent ? "rgba(239,68,68,0.3)" : "var(--b2)"}` }}>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full flex items-start gap-3 p-4 text-left">
        <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-[13px] font-black" style={{ background: STATUS_COLORS[app.status].bg, border: `1px solid ${STATUS_COLORS[app.status].border}`, color: STATUS_COLORS[app.status].text }}>
          {app.company.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate leading-snug" style={{ color: "var(--t1)" }}>{app.company}</p>
              <p className="text-[11px] truncate" style={{ color: "var(--t3)" }}>{app.role}</p>
            </div>
            <StatusPill status={app.status} size="sm" />
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {app.applied_at && <span className="text-[9px]" style={{ color: "var(--t3)" }}>Applied {fmtDate(app.applied_at)}</span>}
            {app.deadline && (
              <span className={`text-[9px] font-medium ${isUrgent ? "text-red-400" : ""}`} style={!isUrgent ? { color: "var(--t3)" } : undefined}>
                {days !== null && days >= 0 ? `Due in ${days}d` : days !== null && days < 0 ? "Deadline passed" : `Due ${fmtDate(app.deadline)}`}
              </span>
            )}
            {app.match_pct != null && <span className="text-[9px]" style={{ color: "var(--blue)" }}>{app.match_pct}% match</span>}
          </div>
        </div>
        <svg className={`w-4 h-4 shrink-0 mt-1 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: "var(--b1)" }}>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--t3)" }}>Move to</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.filter((s) => s !== app.status).map((s) => (
                <button key={s} type="button" onClick={() => onStatusChange(app.id, s)}
                  className="text-[10px] font-medium px-2.5 py-1 rounded-full border transition-all hover:opacity-80"
                  style={{ background: STATUS_COLORS[s].bg, border: `1px solid ${STATUS_COLORS[s].border}`, color: STATUS_COLORS[s].text }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          {app.notes && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Notes</p>
              <p className="text-[11px] leading-snug" style={{ color: "var(--t2)" }}>{app.notes}</p>
            </div>
          )}
          {app.next_action && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Next action</p>
              <p className="text-[11px] leading-snug" style={{ color: "var(--blue)" }}>{app.next_action}</p>
            </div>
          )}
          {app.status === "offer" && !app.outcome_captured && (
            <div className="rounded-xl p-3 border flex items-center gap-3" style={{ background: "rgba(74,222,128,0.06)", borderColor: "rgba(74,222,128,0.25)" }}>
              <span className="text-lg shrink-0">🎉</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#4ade80]">You got an offer!</p>
                <p className="text-[10px]" style={{ color: "var(--t3)" }}>Capture your outcome — it helps future students.</p>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => onPrepWithVoice(app)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--bdim)", color: "var(--blue)", border: "1px solid var(--blue)" }}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              Prep with Dilly AI
            </button>
            <button type="button" onClick={() => { if (confirm(`Remove ${app.company}?`)) onDelete(app.id); }} className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0" style={{ border: "1px solid var(--b2)", color: "var(--t3)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApplicationsSection() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [activeFilter, setActiveFilter] = useState<AppStatus | "all">("all");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const loadApps = useCallback(async () => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE}/applications`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        setApplications(d.applications ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  useEffect(() => {
    if (!showAdd) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAdd(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [showAdd]);

  const handleAdd = async (data: Partial<Application>) => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) return;
    const r = await fetch(`${API_BASE}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (r.ok) {
      const d = await r.json();
      setApplications((prev) => [d.application, ...prev]);
      setShowAdd(false);
      showToast(`${data.company} added`);
    }
  };

  const handleStatusChange = async (id: string, status: AppStatus) => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) return;
    const r = await fetch(`${API_BASE}/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    if (r.ok) {
      const d = await r.json();
      setApplications((prev) => prev.map((a) => (a.id === id ? d.application : a)));
      showToast(`Moved to ${STATUS_LABELS[status]}`);
    }
  };

  const handleDelete = async (id: string) => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) return;
    const r = await fetch(`${API_BASE}/applications/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      setApplications((prev) => prev.filter((a) => a.id !== id));
      showToast("Removed");
    }
  };

  const handlePrepWithVoice = (app: Application) => {
    const prompt = `I have an interview/application for ${app.role} at ${app.company}. Help me prepare: give me likely interview questions and tips specific to this company and role. Focus on behavioral questions and what they look for.`;
    try {
      sessionStorage.setItem("dilly_pending_voice_prompt", prompt);
    } catch {
      /* ignore */
    }
    // Practice tab hosts interview prep; ?tab=voice is rewritten to Career Center in the main app.
    router.push("/?tab=practice");
  };

  const filtered = activeFilter === "all" ? applications : applications.filter((a) => a.status === activeFilter);
  const hasRejections = applications.some((a) => a.status === "rejected");
  const stats = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: applications.filter((a) => a.status === s).length }), {} as Record<AppStatus, number>);

  if (loading) {
    return (
      <div className="rounded-[18px] p-8 flex flex-col items-center justify-center gap-3" style={{ background: "var(--s2)", border: "1px solid var(--b2)" }}>
        <span className="w-6 h-6 rounded-full border-2 border-[var(--blue)] border-t-transparent animate-spin" />
        <p className="text-sm" style={{ color: "var(--t3)" }}>Loading applications…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>{applications.length} tracked · Saved → Offer</p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold rounded-[18px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--blue)", color: "#fff" }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add
        </button>
      </div>

      {applications.length > 0 && (
        <div className="rounded-[18px] p-3" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Your Dilly advantage</p>
          <p className="text-xs" style={{ color: "var(--t2)" }}>{formatTwentyXCompact(TWENTY_X_MOMENTS.applications)}</p>
        </div>
      )}
      {hasRejections && (
        <div className="rounded-[18px] p-3" style={{ background: "var(--s2)", borderLeft: "4px solid var(--coral)" }}>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Rejection recovery</p>
          <p className="text-xs" style={{ color: "var(--t2)" }}>{formatTwentyXCompact(TWENTY_X_MOMENTS.rejection_recovery)}</p>
          <a href="/?tab=practice" className="text-[11px] font-medium mt-2 inline-flex gap-1" style={{ color: "var(--blue)" }}>Ask Dilly AI to reframe →</a>
        </div>
      )}

      {applications.length > 0 && (
        <div className="grid grid-cols-5 gap-1.5">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveFilter(activeFilter === s ? "all" : s)}
              className="flex flex-col items-center gap-0.5 py-2.5 rounded-[18px] transition-opacity hover:opacity-90 active:opacity-80"
              style={{
                background: activeFilter === s ? STATUS_COLORS[s].bg : "var(--s2)",
                border: activeFilter === s ? `1px solid ${STATUS_COLORS[s].border}` : "1px solid var(--b2)",
              }}
            >
              <span className="text-[14px] font-black leading-none" style={{ color: STATUS_COLORS[s].text }}>{stats[s]}</span>
              <span className="text-[8px] font-semibold leading-none" style={{ color: "var(--t3)" }}>{STATUS_LABELS[s].slice(0, 5)}</span>
            </button>
          ))}
        </div>
      )}

      {applications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
            <svg className="w-8 h-8" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
          </div>
          <div className="text-center">
            <p className="text-[14px] font-bold mb-1" style={{ color: "var(--t1)" }}>No applications yet</p>
            <p className="text-[11px] max-w-[240px] leading-relaxed" style={{ color: "var(--t3)" }}>Track every application from Saved → Applied → Interviewing → Offer.</p>
          </div>
          <button type="button" onClick={() => setShowAdd(true)} className="px-6 py-3 text-[13px] font-bold rounded-[18px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--blue)", color: "#fff" }}>
            Add your first application
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onPrepWithVoice={handlePrepWithVoice}
            />
          ))}
        </div>
      )}

      {filtered.length === 0 && applications.length > 0 && (
        <div className="text-center py-10">
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>No {STATUS_LABELS[activeFilter as AppStatus]} applications yet.</p>
          <button type="button" onClick={() => setActiveFilter("all")} className="mt-2 text-[11px] underline" style={{ color: "var(--blue)" }}>Show all</button>
        </div>
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-[18px] text-sm font-medium z-50 animate-fade-up whitespace-nowrap" style={{ background: "var(--s2)", color: "var(--t1)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
