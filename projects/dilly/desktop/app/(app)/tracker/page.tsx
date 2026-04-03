'use client';
import { useState, useRef, useMemo, useEffect } from 'react';
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { dilly } from '@/lib/dilly';
import CompanyLogo from '@/components/jobs/CompanyLogo';
import { useRightPanel } from '@/app/(app)/layout';

/* ── Types ───────────────────────────────────────────── */
type Status = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected';
interface Application {
  id: string; company: string; role: string; status: Status;
  applied_at?: string; deadline?: string; job_url?: string; notes?: string;
}

/* ── Columns ─────────────────────────────────────────── */
// SVG path data for column empty-state icons
const COL_ICONS: Record<Status, string> = {
  saved:        'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z',
  applied:      'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  interviewing: 'M12 2a3 3 0 013 3v4a3 3 0 01-6 0V5a3 3 0 013-3zM19 10a7 7 0 01-14 0M12 19v3M8 22h8',
  offer:        'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  rejected:     'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
};

const COLS: { key: Status; label: string; color: string; glow: string; emptyLine: string; emptyHint: string }[] = [
  { key: 'saved',        label: 'Saved',        color: '#636366', glow: 'rgba(99,99,102,0.45)', emptyLine: 'No saved jobs yet', emptyHint: 'Browse the Jobs tab and save roles you like' },
  { key: 'applied',      label: 'Applied',      color: '#5B8DEF', glow: 'rgba(91,141,239,0.5)', emptyLine: 'Nothing applied', emptyHint: 'Drag a saved job here once you hit submit' },
  { key: 'interviewing', label: 'Interviewing', color: '#FF9F0A', glow: 'rgba(255,159,10,0.5)', emptyLine: 'No interviews yet', emptyHint: 'When you hear back, move cards here' },
  { key: 'offer',        label: 'Offer',        color: '#34C759', glow: 'rgba(52,199,89,0.55)', emptyLine: 'The finish line', emptyHint: 'Your offers will land here' },
  { key: 'rejected',     label: 'Rejected',     color: '#FF453A', glow: 'rgba(255,69,58,0.35)', emptyLine: 'Part of the process', emptyHint: 'Every rejection gets you closer' },
];

/* ── Demo data ───────────────────────────────────────── */
const DEMO: Application[] = [
  { id: '1', company: 'Cloudflare', role: 'Data Analytics Intern', status: 'saved', deadline: '2026-04-01' },
  { id: '2', company: 'Toast', role: 'Product Analyst', status: 'saved' },
  { id: '9', company: 'Figma', role: 'Design Engineer Intern', status: 'saved' },
  { id: '3', company: 'Dropbox', role: 'People Data Analyst', status: 'applied', applied_at: '2026-03-25' },
  { id: '4', company: 'Okta', role: 'Data Analyst Intern', status: 'applied', applied_at: '2026-03-22' },
  { id: '10', company: 'HubSpot', role: 'Revenue Ops Intern', status: 'applied', applied_at: '2026-03-14' },
  { id: '5', company: 'Stripe', role: 'Software Engineer Intern', status: 'interviewing', applied_at: '2026-03-10' },
  { id: '6', company: 'Goldman Sachs', role: 'Summer Analyst', status: 'interviewing', applied_at: '2026-03-05' },
  { id: '7', company: 'MongoDB', role: 'Sales Dev Representative', status: 'offer', applied_at: '2026-02-20' },
  { id: '8', company: 'Visa', role: 'AI Center of Excellence Analyst', status: 'rejected', applied_at: '2026-03-01' },
];

/* ── Helpers ──────────────────────────────────────────── */
function daysAgo(iso?: string) { if (!iso) return null; return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)); }
function daysUntil(iso?: string) { if (!iso) return null; return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000); }
function friendlyAgo(d: number | null) {
  if (d === null) return null;
  if (d === 0) return 'Today'; if (d === 1) return 'Yesterday'; if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

/* ── Nudges ───────────────────────────────────────────── */
interface Nudge { label: string; detail: string; type: 'urgent' | 'warning' | 'info' }
function buildNudges(apps: Application[]): Nudge[] {
  const out: Nudge[] = [];
  apps.filter(a => a.status === 'saved' && a.deadline).forEach(a => {
    const d = daysUntil(a.deadline);
    if (d !== null && d >= 0 && d <= 5)
      out.push({ label: 'Deadline', detail: `${a.company} closes ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'}`, type: 'urgent' });
  });
  apps.filter(a => a.status === 'applied').forEach(a => {
    const d = daysAgo(a.applied_at);
    if (d !== null && d >= 10)
      out.push({ label: 'No response', detail: `${a.company} — ${d} days. Consider following up.`, type: 'warning' });
  });
  if (apps.filter(a => a.applied_at && daysAgo(a.applied_at)! < 3).length === 0 && apps.filter(a => a.status === 'saved').length > 0)
    out.push({ label: 'Momentum', detail: 'You have saved jobs waiting. Pick one and apply today.', type: 'info' });
  return out.slice(0, 3);
}

const NUDGE_ICON_PATH: Record<string, string> = {
  urgent:  'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  warning: 'M12 8v4m0 4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z',
  info:    'M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z',
};
const NUDGE_COLORS: Record<string, { accent: string; bg: string; border: string }> = {
  urgent:  { accent: '#FF453A', bg: 'rgba(255,69,58,0.06)',  border: 'rgba(255,69,58,0.18)' },
  warning: { accent: '#FF9F0A', bg: 'rgba(255,159,10,0.06)', border: 'rgba(255,159,10,0.18)' },
  info:    { accent: '#5B8DEF', bg: 'rgba(91,141,239,0.06)', border: 'rgba(91,141,239,0.18)' },
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const STORAGE_KEY = 'dilly_tracker';

function saveTrackerApps(appsToSave: Application[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appsToSave)); } catch {}
}

function addToTracker(company: string, role: string, jobUrl?: string): 'saved' | 'duplicate' | 'error' {
  if (typeof window === 'undefined') return 'error';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const apps: Application[] = raw ? JSON.parse(raw) : DEMO;
    if (apps.some(a => a.company === company && a.role === role)) return 'duplicate';
    const updated = [...apps, { id: Date.now().toString(), company, role, status: 'saved' as Status, job_url: jobUrl }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return 'saved';
  } catch { return 'error'; }
}

export default function TrackerPage() {
  const { fireProactiveCoach } = useRightPanel();
  const [apps, setApps] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; app: Application } | null>(null);

  // Load from API first, fall back to localStorage, then DEMO
  useEffect(() => {
    (async () => {
      try {
        const data = await dilly.get('/applications');
        const apiApps = data?.applications || [];
        if (apiApps.length > 0) {
          setApps(apiApps);
          setLoaded(true);
          return;
        }
      } catch {}
      // Fallback to localStorage
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) { setApps(JSON.parse(raw)); setLoaded(true); return; }
      } catch {}
      setApps(DEMO);
      setLoaded(true);
    })();
  }, []);
  const [confetti, setConfetti] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');
  const quickRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Persist to both localStorage (instant) and API (durable)
  useEffect(() => {
    if (!loaded) return;
    saveTrackerApps(apps);
    // Sync to API in background
    dilly.post('/applications/sync', { applications: apps }).catch(() => {});
  }, [apps, loaded]);

  function handleDragEnd(event: any) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const app = apps.find(a => a.id === active.id);
    if (!app) return;
    const col = COLS.find(c => c.key === over.id);
    const target = col ? col.key : apps.find(a => a.id === over.id)?.status;
    if (!target || target === app.status) return;
    if (target === 'offer') { setConfetti(true); setTimeout(() => setConfetti(false), 3000); }
    setApps(prev => prev.map(a => a.id === active.id ? {
      ...a, status: target,
      applied_at: (target !== 'saved' && !a.applied_at) ? new Date().toISOString().slice(0, 10) : a.applied_at,
    } : a));
  }

  function handleQuickAdd() {
    const val = quickAdd.trim();
    if (!val) return;
    const parts = val.split(/\s*[—–-]\s*/);
    setApps(prev => [...prev, { id: Date.now().toString(), company: parts[0]?.trim() || val, role: parts[1]?.trim() || 'Position', status: 'saved' }]);
    setQuickAdd('');
    quickRef.current?.focus();
  }

  const counts = Object.fromEntries(COLS.map(c => [c.key, apps.filter(a => a.status === c.key).length])) as Record<Status, number>;
  const applied = counts.applied + counts.interviewing + counts.offer;
  const responseRate = applied > 0 ? Math.round((counts.interviewing + counts.offer) / applied * 100) : 0;
  const nudges = buildNudges(apps);
  const activeApp = apps.find(a => a.id === activeId);

  // Pipeline bar proportions (only forward-flowing stages)
  const pipelineKeys: Status[] = ['saved', 'applied', 'interviewing', 'offer'];
  const pipelineTotal = pipelineKeys.reduce((s, k) => s + counts[k], 0) || 1;

  // Column-level insights
  const colInsights = useMemo(() => {
    const out: Record<Status, string | null> = { saved: null, applied: null, interviewing: null, offer: null, rejected: null };
    const savedWithDeadline = apps.filter(a => a.status === 'saved' && a.deadline).sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
    if (savedWithDeadline.length > 0) {
      const d = daysUntil(savedWithDeadline[0].deadline);
      if (d !== null && d >= 0 && d <= 14) out.saved = `${savedWithDeadline[0].company} closes in ${d}d`;
    }
    const oldestApplied = apps.filter(a => a.status === 'applied' && a.applied_at).sort((a, b) => new Date(a.applied_at!).getTime() - new Date(b.applied_at!).getTime());
    if (oldestApplied.length > 0) {
      const d = daysAgo(oldestApplied[0].applied_at);
      if (d !== null && d >= 7) out.applied = `Oldest: ${oldestApplied[0].company} (${d}d)`;
    }
    if (counts.interviewing > 0) out.interviewing = `${counts.interviewing} active — prep with Dilly`;
    if (counts.offer > 0) out.offer = `Congrats! Review your offer`;
    return out;
  }, [apps, counts]);

  return (
    <div className="h-full flex flex-col bg-surface-0 relative overflow-hidden">
      {confetti && <ConfettiOverlay />}

      {/* ── Header bar ── */}
      <div className="px-8 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center gap-5 mb-4">
          <h1 className="text-[22px] font-semibold text-txt-1 tracking-[-0.02em] shrink-0" style={{ fontFamily: 'Cinzel, serif' }}>
            Your pipeline
          </h1>
          <div className="flex-1 max-w-[420px] relative">
            {/* Search icon */}
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <input ref={quickRef} value={quickAdd} onChange={e => setQuickAdd(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); }}
              placeholder="Add application — Company — Role name"
              className="w-full bg-surface-1 border border-border-main rounded-lg pl-8 pr-24 py-2 text-[12px] text-txt-1 placeholder:text-txt-3 outline-none focus:border-[#5B8DEF]/40 focus:shadow-[0_0_0_3px_rgba(91,141,239,0.08)] transition-all" />
            {/* Enter hint or Add button */}
            {quickAdd ? (
              <button onClick={handleQuickAdd} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white bg-[#5B8DEF] px-2.5 py-1 rounded-md hover:bg-[#7AA5FF] transition-colors">
                Add ↵
              </button>
            ) : (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-txt-3 font-medium bg-surface-2 px-1.5 py-0.5 rounded pointer-events-none">⏎ Enter</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-6 text-[11px] font-mono">
            <Stat label="Tracked" value={String(apps.length)} color="var(--text-1)" />
            <Stat label="Applied" value={String(applied)} color="#5B8DEF" />
            <Stat label="Response" value={responseRate + '%'} color="#FF9F0A" />
            <Stat label="Offers" value={String(counts.offer)} color="#34C759" />
          </div>
        </div>

        {/* ── Glowing pipeline bar ── */}
        <div className="mb-4">
          <div className="flex gap-[3px] h-[7px] rounded-full overflow-hidden bg-surface-2">
            {pipelineKeys.map(key => {
              const col = COLS.find(c => c.key === key)!;
              const pct = (counts[key] / pipelineTotal) * 100;
              if (counts[key] === 0) return null;
              return (
                <div key={key} className="relative h-full rounded-full pipeline-bar"
                  style={{
                    width: pct + '%',
                    backgroundColor: col.color,
                    boxShadow: `0 0 8px 1px ${col.glow}, 0 0 20px ${col.glow}`,
                  }}>
                  <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 50%)' }} />
                </div>
              );
            })}
          </div>
          <div className="flex mt-2">
            {pipelineKeys.map(key => {
              const col = COLS.find(c => c.key === key)!;
              const pct = (counts[key] / pipelineTotal) * 100;
              if (counts[key] === 0) return null;
              return (
                <div key={key} style={{ width: pct + '%' }} className="flex items-center justify-center gap-1.5">
                  <span className="text-[10px] font-bold font-mono" style={{ color: col.color }}>{counts[key]}</span>
                  <span className="text-[8px] uppercase tracking-[0.08em] text-txt-3 hidden sm:inline">{col.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Nudges — redesigned ── */}
        {nudges.length > 0 && (
          <div className="flex gap-2.5 mb-1 overflow-x-auto pb-1">
            {nudges.map((n, i) => {
              const c = NUDGE_COLORS[n.type];
              return (
                <div key={i} className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 min-w-[200px] max-w-[280px] flex-shrink-0 nudge-card transition-all duration-200 hover:-translate-y-[2px]"
                  style={{ background: c.bg, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.accent}` }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[1px]">
                    <path d={NUDGE_ICON_PATH[n.type]} />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-[8px] font-extrabold uppercase tracking-[0.15em] block" style={{ color: c.accent }}>{n.label}</span>
                    <span className="text-[11px] text-txt-2 leading-snug block mt-1">{n.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Kanban — fills remaining height ── */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-3 min-h-0">
        <DndContext sensors={sensors} collisionDetection={closestCorners}
          onDragStart={e => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 h-full">
            {COLS.map(col => (
              <KanbanColumn key={col.key} col={col} apps={apps.filter(a => a.status === col.key)}
                insight={colInsights[col.key]}
                onContext={(e, app) => setCtxMenu({ x: e.clientX, y: e.clientY, app })}
                onPrepWithDilly={app => fireProactiveCoach(`Let's prep for my ${app.role} interview at ${app.company}. Quiz me on common questions, help me practice my story, and point out anything I should research.`)} />
            ))}
          </div>
          <DragOverlay>{activeApp && <AppCard app={activeApp} isDragging />}</DragOverlay>
        </DndContext>
      </div>

      {ctxMenu && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} app={ctxMenu.app}
          onClose={() => setCtxMenu(null)}
          onMove={s => {
            if (s === 'offer') { setConfetti(true); setTimeout(() => setConfetti(false), 3000); }
            setApps(prev => prev.map(a => a.id === ctxMenu.app.id ? { ...a, status: s } : a));
            setCtxMenu(null);
          }}
          onDelete={() => { setApps(prev => prev.filter(a => a.id !== ctxMenu.app.id)); setCtxMenu(null); }}
        />
      )}

      <style>{`
        @keyframes ctxIn { from { opacity:0; transform:scale(0.96) translateY(-4px); } to { opacity:1; transform:none; } }
        @keyframes barPulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.25); } }
        .pipeline-bar { animation: barPulse 2.5s ease-in-out infinite; }
        @keyframes nudgeSlideIn { from { opacity:0; transform:translateX(8px); } to { opacity:1; transform:none; } }
        .nudge-card { animation: nudgeSlideIn 400ms ease-out both; }
        .nudge-card:nth-child(2) { animation-delay: 80ms; }
        .nudge-card:nth-child(3) { animation-delay: 160ms; }
        @keyframes confettiFall { 0% { opacity:1; transform: translateY(0) translateX(0) rotate(0deg); } 100% { opacity:0; transform: translateY(100vh) translateX(var(--drift)) rotate(720deg); } }
      `}</style>
    </div>
  );
}

/* ── Stat pill ──────────────────────────────────────── */
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-txt-3">{label}</span>
      <span className="text-[18px] font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

/* ── Kanban column — full height ────────────────────── */
function KanbanColumn({ col, apps, insight, onContext, onPrepWithDilly }: {
  col: typeof COLS[number]; apps: Application[]; insight: string | null;
  onContext: (e: React.MouseEvent, app: Application) => void;
  onPrepWithDilly?: (app: Application) => void;
}) {
  const { setNodeRef, isOver } = useSortable({ id: col.key });
  return (
    <div ref={setNodeRef}
      className={`flex-1 min-w-[200px] max-w-[280px] flex flex-col rounded-xl overflow-hidden transition-all duration-150 h-full ${isOver ? 'ring-1' : ''}`}
      style={{
        background: isOver ? `${col.color}06` : 'var(--surface-1)',
        border: isOver ? `1px solid ${col.color}30` : '1px solid var(--border-main)',
      }}>
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center gap-2 border-b border-border-main shrink-0">
        <svg width="10" height="10" viewBox="0 0 24 24" fill={col.color} stroke="none"
          style={{ filter: apps.length > 0 ? `drop-shadow(0 0 3px ${col.glow})` : 'none', flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
        </svg>
        <span className="text-[12px] font-semibold text-txt-1">{col.label}</span>
        <span className="text-[10px] font-mono text-txt-3 ml-auto">{apps.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        <SortableContext items={apps.map(a => a.id)} strategy={verticalListSortingStrategy}>
          {apps.length === 0 ? (
            <EmptyColumn col={col} />
          ) : apps.map(app => <SortableAppCard key={app.id} app={app} onContext={onContext} onPrepWithDilly={col.key === 'interviewing' ? onPrepWithDilly : undefined} />)}
        </SortableContext>
      </div>

      {/* Footer insight */}
      {insight && (
        <div className="px-3 py-2.5 border-t border-border-main shrink-0">
          <p className="text-[10px] text-txt-3 leading-snug">{insight}</p>
        </div>
      )}
    </div>
  );
}

/* ── Empty column ──────────────────────────────────── */
function EmptyColumn({ col }: { col: typeof COLS[number] }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center h-full">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
        style={{ background: `${col.color}12` }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke={col.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={COL_ICONS[col.key]} />
        </svg>
      </div>
      <p className="text-[12px] font-medium text-txt-2 mb-1">{col.emptyLine}</p>
      <p className="text-[10px] text-txt-3 leading-relaxed max-w-[160px]">{col.emptyHint}</p>
      <div className="mt-5 w-full border border-dashed rounded-lg py-3 text-[10px] text-txt-3 transition-colors"
        style={{ borderColor: `${col.color}25` }}>
        Drop a card here
      </div>
    </div>
  );
}

/* ── Cards ──────────────────────────────────────────── */
function SortableAppCard({ app, onContext, onPrepWithDilly }: { app: Application; onContext: (e: React.MouseEvent, app: Application) => void; onPrepWithDilly?: (app: Application) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }} {...attributes} {...listeners}>
      <AppCard app={app} onContext={onContext} onPrepWithDilly={onPrepWithDilly} />
    </div>
  );
}

/** Returns a left-border color indicating activity level for a card */
function getCardStaleColor(app: Application): string | null {
  const dl = daysUntil(app.deadline);
  // Deadline red — highest priority
  if (dl !== null && dl <= 3) return '#FF453A';
  const d = daysAgo(app.applied_at);
  // Applied and no response — staleness
  if (app.status === 'applied' && d !== null) {
    if (d >= 14) return '#FF9F0A';  // orange — stale
    if (d < 7) return '#34C759';    // green — recently applied
  }
  // Saved with recent activity
  if (app.status === 'saved' && d === null) return null;
  // Interviewing — always show active green
  if (app.status === 'interviewing') return '#34C759';
  return null;
}

/** Returns a short next-step string for the card */
function getNextStep(app: Application): string | null {
  const dl = daysUntil(app.deadline);
  const d = daysAgo(app.applied_at);
  if (app.status === 'saved') {
    if (dl !== null && dl <= 5) return dl <= 0 ? 'Deadline passed' : `Apply in ${dl}d`;
    return 'Submit application';
  }
  if (app.status === 'applied') {
    if (d !== null && d >= 10) return 'Consider following up';
    return 'Awaiting response';
  }
  if (app.status === 'interviewing') return 'Prep with Dilly';
  if (app.status === 'offer') return 'Review & respond';
  if (app.status === 'rejected') return 'Request feedback';
  return null;
}

function AppCard({ app, isDragging, onContext, onPrepWithDilly }: { app: Application; isDragging?: boolean; onContext?: (e: React.MouseEvent, app: Application) => void; onPrepWithDilly?: (app: Application) => void }) {
  const d = daysAgo(app.applied_at);
  const dl = daysUntil(app.deadline);
  const staleColor = getCardStaleColor(app);
  const nextStep = getNextStep(app);
  const isStale = app.status === 'applied' && d !== null && d >= 10;

  return (
    <div data-contextmenu onContextMenu={e => { e.preventDefault(); (e.nativeEvent as any)._dillyHandled = true; onContext?.(e, app); }}
      className={`group bg-surface-2 rounded-lg cursor-grab active:cursor-grabbing transition-all duration-150
        hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)]
        ${isDragging ? 'shadow-[0_12px_40px_rgba(91,141,239,0.2)] scale-[1.04] rotate-[1.5deg]' : ''}`}
      style={{
        borderLeft: staleColor ? `3px solid ${staleColor}` : '3px solid transparent',
        border: `1px solid var(--border-main)`,
        borderLeftWidth: staleColor ? 3 : 1,
        borderLeftColor: staleColor || 'var(--border-main)',
        padding: '10px 12px 10px 10px',
        overflow: 'hidden',
      }}>
      <div className="flex items-start gap-2.5">
        <CompanyLogo company={app.company} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-txt-1 leading-tight truncate">{app.role}</p>
          <p className="text-[10px] text-txt-2 mt-0.5 truncate">{app.company}</p>
        </div>
      </div>

      {/* Timestamps */}
      {(d !== null || dl !== null) && (
        <div className="flex items-center gap-1.5 mt-2">
          {d !== null && <span className="text-[9px] text-txt-3 bg-surface-1 px-1.5 py-0.5 rounded font-medium">{friendlyAgo(d)}</span>}
          {dl !== null && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
              dl <= 3 ? 'text-[#FF453A] bg-[#FF453A]/10' : dl <= 7 ? 'text-[#FF9F0A] bg-[#FF9F0A]/10' : 'text-txt-3 bg-surface-1'
            }`}>{dl <= 0 ? 'Overdue' : `${dl}d left`}</span>
          )}
        </div>
      )}

      {/* Next step hint */}
      {nextStep && (
        app.status === 'interviewing' && onPrepWithDilly ? (
          <button
            onClick={e => { e.stopPropagation(); onPrepWithDilly(app); }}
            className="mt-2 w-full text-left flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-[#FF9F0A]/10"
            onMouseDown={e => e.stopPropagation()}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span className="text-[9px] font-semibold" style={{ color: '#FF9F0A' }}>{nextStep}</span>
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-1">
            <svg width="7" height="7" viewBox="0 0 24 24" fill={staleColor || 'var(--text-3)'} stroke="none" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span className="text-[9px] font-medium truncate"
              style={{ color: isStale ? '#FF9F0A' : staleColor ? staleColor : 'var(--text-3)' }}>
              {nextStep}
            </span>
          </div>
        )
      )}
    </div>
  );
}

/* ── Context menu ──────────────────────────────────── */
function CtxMenu({ x, y, app, onClose, onMove, onDelete }: {
  x: number; y: number; app: Application;
  onClose: () => void; onMove: (s: Status) => void; onDelete: () => void;
}) {
  const bx = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 220);
  const by = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300);
  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={() => onClose()}>
      <div className="absolute bg-surface-1/95 backdrop-blur-lg border border-border-main rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.35)] py-1.5 min-w-[190px]"
        style={{ left: bx, top: by, animation: 'ctxIn 120ms ease-out' }} onClick={e => e.stopPropagation()}>
        <div className="px-3 py-2 flex items-center gap-2.5">
          <CompanyLogo company={app.company} size={22} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-txt-1 truncate">{app.role}</p>
            <p className="text-[9px] text-txt-3 truncate">{app.company}</p>
          </div>
        </div>
        <div className="h-px bg-border-main mx-2.5 my-1" />
        <p className="px-3 py-1 text-[8px] text-txt-3 font-bold uppercase tracking-[0.15em]">Move to</p>
        {COLS.filter(c => c.key !== app.status).map(c => (
          <button key={c.key} onClick={() => onMove(c.key)}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-[#5B8DEF]/8 transition-colors group">
            <svg width="8" height="8" viewBox="0 0 24 24" fill={c.color} stroke="none">
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span className="text-[11px] text-txt-1 group-hover:text-[#5B8DEF] transition-colors">{c.label}</span>
          </button>
        ))}
        <div className="h-px bg-border-main mx-2.5 my-1" />
        {app.job_url && (
          <button onClick={() => { window.open(app.job_url, '_blank'); onClose(); }}
            className="w-full px-3 py-1.5 text-left text-[11px] text-txt-2 hover:bg-[#5B8DEF]/8 hover:text-[#5B8DEF] transition-colors">Open listing</button>
        )}
        <button onClick={onDelete} className="w-full px-3 py-1.5 text-left text-[11px] text-[#FF453A] hover:bg-[#FF453A]/8 transition-colors">Remove</button>
      </div>
    </div>
  );
}

/* ── Confetti ──────────────────────────────────────── */
function ConfettiOverlay() {
  const colors = ['#34C759', '#5B8DEF', '#FF9F0A', '#FF375F', '#BF5AF2', '#FFD60A', '#64D2FF'];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i, color: colors[i % colors.length], left: Math.random() * 100,
    delay: Math.random() * 0.8, size: 4 + Math.random() * 6, drift: -30 + Math.random() * 60,
  }));
  return (
    <div className="fixed inset-0 z-[200] pointer-events-none overflow-hidden">
      {pieces.map(p => (
        <div key={p.id} className="absolute animate-[confettiFall_2.5s_ease-out_forwards]"
          style={{ left: `${p.left}%`, top: -20, width: p.size, height: p.size * 1.5, background: p.color,
            borderRadius: 1, animationDelay: `${p.delay}s`, opacity: 0, '--drift': `${p.drift}px` } as React.CSSProperties} />
      ))}
    </div>
  );
}
