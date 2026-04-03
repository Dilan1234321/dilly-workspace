'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { dilly } from '@/lib/dilly';
import { useProfile, useRightPanel } from '../layout';
import CompanyLogo from '@/components/jobs/CompanyLogo';
import { saveSnapshot, getDailyHistory, type ScoreSnapshot } from '@/lib/score-history';

/* ── User Task (manual, synced to calendar via localStorage) ── */
const TASKS_KEY = 'dilly_user_tasks';
interface UserTask { id: string; text: string; date?: string; time?: string; done: boolean; createdAt: string; }
function loadUserTasks(): UserTask[] { try { return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]'); } catch { return []; } }
function saveUserTasks(tasks: UserTask[]) { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); }

/* ── Animated number ── */
function AnimNum({ value, delay = 0 }: { value: number; delay?: number }) {
  const [d, setD] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const s = performance.now();
      function tick(now: number) {
        const p = Math.min((now - s) / 900, 1);
        setD(Math.round((1 - Math.pow(1 - p, 3)) * value));
        if (p < 1) ref.current = requestAnimationFrame(tick);
      }
      ref.current = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(t); cancelAnimationFrame(ref.current); };
  }, [value, delay]);
  return <>{d}</>;
}

/* ── Dim chip ── */
function DimChip({ label, value, delay }: { label: string; value: number; delay: number }) {
  const color = value >= 75 ? '#34C759' : value >= 55 ? '#FF9F0A' : '#FF453A';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        <AnimNum value={value} delay={delay} />
      </span>
    </div>
  );
}

/* ── Pipeline stage ── */
function PipelineStage({ label, count, color, icon, onClick }: {
  label: string; count: number; color: string; icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
      background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
      transition: 'background 140ms ease',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
    >
      <span style={{ color, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: 16, fontWeight: 800, color: count > 0 ? color : 'var(--text-3)',
        fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'right',
      }}>{count}</span>
    </button>
  );
}

/* ── Section header ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--text-3)', margin: '0 0 12px',
    }}>{children}</p>
  );
}

/* ── Deadline row ── */
function DeadlineRow({ label, daysUntil, date }: { label: string; daysUntil: number; date: string }) {
  const urgent = daysUntil <= 2;
  const soon = daysUntil <= 7;
  const color = urgent ? '#FF453A' : soon ? '#FF9F0A' : 'var(--text-3)';
  const tag = daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : `${daysUntil}d`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-main)' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 52, flexShrink: 0 }}>{tag}</span>
      <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

/* ── Score sparkline ── */
function ScoreSparkline({ history, currentScore }: { history: ScoreSnapshot[]; currentScore: number }) {
  const W = 88, H = 32, pad = 3;

  if (history.length < 2) {
    const color = currentScore >= 75 ? '#34C759' : currentScore >= 55 ? '#FF9F0A' : '#FF453A';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Your score</span>
        <span style={{ fontSize: 13, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{currentScore}/100</span>
      </div>
    );
  }

  const scores = history.map(s => s.dilly);
  const min = Math.min(...scores), max = Math.max(...scores);
  const range = max - min || 10;
  const pts = scores.map((v, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const delta = scores[scores.length - 1] - scores[0];
  const color = delta > 0 ? '#34C759' : delta < 0 ? '#FF453A' : 'var(--text-3)';
  const deltaLabel = delta === 0 ? 'no change' : `${delta > 0 ? '+' : ''}${delta} pts`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
        {(() => { const [lx, ly] = pts.split(' ').pop()!.split(','); return <circle cx={lx} cy={ly} r="2.5" fill={color} />; })()}
      </svg>
      <span style={{ fontSize: 10, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{deltaLabel}</span>
    </div>
  );
}

/* ── Dilly AI action row (read-only, mark done) ── */
function ActionRow({ item, onComplete }: { item: any; onComplete: (id: string) => void }) {
  const [completing, setCompleting] = useState(false);
  const dimColor = item.dimension === 'smart' ? '#2B3A8E' : item.dimension === 'grit' ? '#C9A84C' : item.dimension === 'build' ? '#34C759' : null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 16px',
      borderBottom: '1px solid var(--border-main)',
      opacity: completing ? 0.35 : 1, transition: 'opacity 250ms ease',
    }}>
      <button onClick={() => { setCompleting(true); onComplete(item.id); }} style={{
        width: 17, height: 17, borderRadius: 4, border: '1.5px solid var(--border-main)',
        background: 'var(--surface-2)', cursor: 'pointer', flexShrink: 0, marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        transition: 'border-color 140ms, background 140ms',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#34C759'; (e.currentTarget as HTMLElement).style.background = 'rgba(52,199,89,0.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-main)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      />
      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{item.text}</span>
      {dimColor && (
        <span style={{ fontSize: 9, fontWeight: 700, color: dimColor, background: dimColor + '15', padding: '2px 6px', borderRadius: 4, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {item.dimension}
        </span>
      )}
    </div>
  );
}

/* ── User task row ── */
function UserTaskRow({ task, onChange, onDelete }: {
  task: UserTask;
  onChange: (updated: UserTask) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const [draftDate, setDraftDate] = useState(task.date || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus(), 20); }, [editing]);

  function save() {
    if (!draft.trim()) { onDelete(task.id); return; }
    onChange({ ...task, text: draft.trim(), date: draftDate || undefined });
    setEditing(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px',
      borderBottom: '1px solid var(--border-main)',
      opacity: task.done ? 0.4 : 1, transition: 'opacity 200ms',
    }}>
      {/* Check */}
      <button onClick={() => onChange({ ...task, done: !task.done })} style={{
        width: 17, height: 17, borderRadius: 4, flexShrink: 0,
        border: task.done ? '1.5px solid #5B8DEF' : '1.5px solid var(--border-main)',
        background: task.done ? '#5B8DEF' : 'var(--surface-2)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        transition: 'all 140ms',
      }}>
        {task.done && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>

      {/* Text / edit inline */}
      {editing ? (
        <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            style={{
              flex: 1, fontSize: 12.5, padding: '2px 6px', borderRadius: 5,
              border: '1px solid #5B8DEF', background: 'var(--surface-2)', color: 'var(--text-1)',
              outline: 'none',
            }}
          />
          <input type="date" value={draftDate} onChange={e => setDraftDate(e.target.value)}
            style={{
              fontSize: 11, padding: '2px 6px', borderRadius: 5,
              border: '1px solid var(--border-main)', background: 'var(--surface-2)', color: 'var(--text-2)',
              outline: 'none', width: 110,
            }}
          />
          <button onClick={save} style={{ fontSize: 11, fontWeight: 600, color: '#5B8DEF', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>×</button>
        </div>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 12.5, color: task.done ? 'var(--text-3)' : 'var(--text-2)', lineHeight: 1.5, textDecoration: task.done ? 'line-through' : 'none', cursor: 'text' }}
            onDoubleClick={() => { if (!task.done) { setDraft(task.text); setDraftDate(task.date || ''); setEditing(true); } }}>
            {task.text}
          </span>
          {task.date && !task.done && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {new Date(task.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {/* Edit icon */}
          {!task.done && (
            <button onClick={() => { setDraft(task.text); setDraftDate(task.date || ''); setEditing(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, flexShrink: 0, opacity: 0.6, lineHeight: 1 }}
              title="Edit">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
          {/* Delete icon */}
          <button onClick={() => onDelete(task.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, flexShrink: 0, opacity: 0.5, lineHeight: 1 }}
            title="Delete"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#FF453A'; (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

/* ── Add task row ── */
function AddTaskRow({ onAdd }: { onAdd: (text: string, date?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20); }, [open]);

  function submit() {
    if (!text.trim()) { setOpen(false); return; }
    onAdd(text.trim(), date || undefined);
    setText(''); setDate(''); setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 12, color: 'var(--text-3)', textAlign: 'left',
        transition: 'color 120ms',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#5B8DEF'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        Add task
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderTop: '1px solid var(--border-main)' }}>
      <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} placeholder="Task name"
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setOpen(false); setText(''); setDate(''); } }}
        style={{
          flex: 1, fontSize: 12.5, padding: '4px 8px', borderRadius: 6,
          border: '1px solid #5B8DEF', background: 'var(--surface-2)', color: 'var(--text-1)',
          outline: 'none',
        }}
      />
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        style={{
          fontSize: 11, padding: '4px 6px', borderRadius: 6, width: 110,
          border: '1px solid var(--border-main)', background: 'var(--surface-2)', color: 'var(--text-2)',
          outline: 'none',
        }}
      />
      <button onClick={submit} style={{
        height: 28, padding: '0 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
        color: '#fff', background: '#5B8DEF', border: 'none', cursor: 'pointer', flexShrink: 0,
      }}>Add</button>
      <button onClick={() => { setOpen(false); setText(''); setDate(''); }} style={{
        height: 28, width: 28, borderRadius: 6, fontSize: 14, fontWeight: 500,
        color: 'var(--text-3)', background: 'none', border: '1px solid var(--border-main)', cursor: 'pointer', flexShrink: 0,
      }}>×</button>
    </div>
  );
}

/* ════════════════════════════════════════
   PAGE
════════════════════════════════════════ */
export default function HomePage() {
  const { profile } = useProfile();
  const { fireProactiveCoach } = useRightPanel();
  const router = useRouter();
  const [richCtx, setRichCtx] = useState<any>(null);
  const [topJobs, setTopJobs] = useState<any[]>([]);
  const [exploreJobs, setExploreJobs] = useState<any[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [readyCount, setReadyCount] = useState<number>(0);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [userTasks, setUserTasks] = useState<UserTask[]>([]);
  const [scoreHistory, setScoreHistory] = useState<ScoreSnapshot[]>([]);

  async function completeAction(id: string) {
    setActionItems(prev => prev.filter(a => a.id !== id));
    try { await dilly.patch(`/actions/${id}`, { done: true, done_at: new Date().toISOString() }); } catch {}
  }

  const persistTasks = useCallback((tasks: UserTask[]) => {
    setUserTasks(tasks);
    saveUserTasks(tasks);
  }, []);

  function addUserTask(text: string, date?: string) {
    const task: UserTask = { id: String(Date.now()), text, date, done: false, createdAt: new Date().toISOString() };
    persistTasks([...userTasks, task]);
  }

  function updateUserTask(updated: UserTask) {
    persistTasks(userTasks.map(t => t.id === updated.id ? updated : t));
  }

  function deleteUserTask(id: string) {
    persistTasks(userTasks.filter(t => t.id !== id));
  }

  useEffect(() => {
    saveSnapshot(profile.overall_smart || 0, profile.overall_grit || 0, profile.overall_build || 0, profile.overall_dilly_score || 0);

    dilly.blob('/profile/photo').then(b => { if (b) setPhotoUrl(URL.createObjectURL(b)); }).catch(() => {});

    dilly.get('/ai/context').then(setRichCtx).catch(() => {});

    dilly.get('/v2/internships/stats').then((s: any) => setReadyCount(s?.ready || 0)).catch(() => {});

    dilly.get('/actions').then((r: any) => setActionItems(r?.undone || [])).catch(() => {});

    setScoreHistory(getDailyHistory().slice(-8));
    setUserTasks(loadUserTasks());

    const usStates = /^(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)$/i;
    const intl = /argentina|colombia|poland|ireland|london|berlin|paris|tokyo|singapore|sydney|mumbai|india|israel|amsterdam|dublin|hong kong|brazil|mexico|uk|europe|emea|apac|latam|germany|france|italy|spain/i;
    const broadNational = /^(united states|usa|u\.s\.|nationwide|multiple locations?|various|anywhere)$/i;

    function normalizeJob(l: any, label: string) {
      return { id: l.id, title: l.title, company: l.company, label, readiness: l.readiness_label || label,
        location: [l.location_city, l.location_state].filter(Boolean).join(', ') };
    }
    function domFilter(listings: any[]) {
      return listings.filter((l: any) => {
        const st = (l.location_state || '').trim(); const ci = (l.location_city || '').toLowerCase();
        if (intl.test(ci + ' ' + st.toLowerCase())) return false;
        const isBroad = broadNational.test(ci.trim()) || broadNational.test(st.trim());
        return l.work_mode === 'remote' || isBroad || usStates.test(st) || (!ci && !st);
      });
    }

    dilly.get('/v2/internships/feed?readiness=ready&limit=6').then((d: any) => {
      const filtered = domFilter(d.listings || []);
      const ready = filtered.slice(0, 6).map((l: any) => normalizeJob(l, 'READY'));
      setTopJobs(ready);
      setJobsLoaded(true);
      if (ready.length === 0) {
        // Fall back to general explore feed
        dilly.get('/v2/internships/feed?limit=8').then((ex: any) => {
          const exp = domFilter(ex.listings || []).slice(0, 6).map((l: any) => normalizeJob(l, 'EXPLORE'));
          setExploreJobs(exp);
        }).catch(() => {});
      }
    }).catch(() => { setJobsLoaded(true); });
  }, [profile]);

  /* ── Derived values ── */
  const smart = Math.round(profile?.overall_smart || 0);
  const grit  = Math.round(profile?.overall_grit  || 0);
  const build = Math.round(profile?.overall_build || 0);
  const score = Math.round(profile?.overall_dilly_score || 0);
  const majors = (profile?.majors || []).join(' & ');
  const minors = (profile?.minors || []).join(' & ');
  const name = profile?.name || '';
  const school = profile?.school || '';

  const weakest     = richCtx?.weakest_dimension || null;
  const dillyTake   = richCtx?.dilly_take || null;
  const ac          = richCtx?.app_counts || { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 };
  const allDeadlines = (richCtx?.upcoming_deadlines || []).filter((d: any) => d.days_until >= 0);
  const interviewDeadlines = allDeadlines.filter((d: any) => /interview/i.test(d.label));
  const deadlines   = allDeadlines.slice(0, 5);

  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const dimColor = (v: number) => v >= 75 ? '#34C759' : v >= 55 ? '#FF9F0A' : '#FF453A';

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 36px 48px' }}>

        {/* ── Identity header ── */}
        <div className="animate-fade-in" style={{
          display: 'flex', alignItems: 'center', gap: 16,
          marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--border-main)',
        }}>
          {/* Photo */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
            background: 'var(--surface-2)', border: '2px solid var(--border-main)',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {photoUrl
              ? <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-3)' }}>{name.charAt(0)}</span>
            }
          </div>

          {/* Name + details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 3px', letterSpacing: -0.4, lineHeight: 1.2 }}>
              {greet}, {name.split(' ')[0]}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {majors && <span style={{ fontSize: 13, fontWeight: 600, color: '#2B3A8E' }}>{majors}</span>}
              {minors && (
                <>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>·</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{minors}</span>
                </>
              )}
              {school && (
                <>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>·</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{school}</span>
                </>
              )}
            </div>
          </div>

          <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{dateStr}</span>
        </div>

        {/* ── Score hero ── */}
        <div className="animate-fade-in" style={{
          animationDelay: '100ms',
          background: 'var(--surface-1)', border: '1px solid var(--border-main)',
          borderRadius: 14, padding: '20px 28px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 32,
        }}>
          {/* Score */}
          <div style={{ flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 2px' }}>
              Dilly Score
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 48, fontWeight: 900, color: '#2B3A8E', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                <AnimNum value={score} delay={200} />
              </span>
              <span style={{ fontSize: 16, color: 'var(--text-3)', fontWeight: 500 }}>/100</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 48, background: 'var(--border-main)', flexShrink: 0 }} />

          {/* S / G / B */}
          <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
            <DimChip label="Smart" value={smart} delay={400} />
            <DimChip label="Grit"  value={grit}  delay={500} />
            <DimChip label="Build" value={build}  delay={600} />
          </div>

          {/* Weakest dim insight */}
          {weakest && (
            <>
              <div style={{ width: 1, height: 48, background: 'var(--border-main)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                <span style={{ fontWeight: 700, color: dimColor(weakest === 'smart' ? smart : weakest === 'grit' ? grit : build), textTransform: 'capitalize' }}>{weakest}</span>
                {' '}is your weakest dimension
                {dillyTake && <span style={{ color: 'var(--text-3)' }}> · {dillyTake}</span>}
              </span>
            </>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <ScoreSparkline history={scoreHistory} currentScore={score} />
            <button onClick={() => router.push('/scores')} style={{
              height: 32, padding: '0 14px', borderRadius: 8,
              fontSize: 11, fontWeight: 600, color: '#2B3A8E',
              background: 'rgba(59,76,192,0.07)', border: '1px solid rgba(59,76,192,0.15)', cursor: 'pointer',
            }}>
              Full scores &rarr;
            </button>
          </div>
        </div>

        {/* ── Three columns ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 240px', gap: 20, marginBottom: 20 }}>

          {/* ─ Col 1: Pipeline ─ */}
          <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
            <SectionLabel>Pipeline</SectionLabel>
            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)', borderRadius: 12, overflow: 'hidden' }}>
              <PipelineStage label="Saved" count={ac.saved} color="var(--text-3)" onClick={() => router.push('/tracker')}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>}
              />
              <PipelineStage label="Applied" count={ac.applied} color="#2B3A8E" onClick={() => router.push('/tracker')}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>}
              />
              <PipelineStage label="Interviewing" count={ac.interviewing} color="#FF9F0A" onClick={() => router.push('/tracker')}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}
              />
              <PipelineStage label="Offers" count={ac.offer} color="#34C759" onClick={() => router.push('/tracker')}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              />
              <PipelineStage label="Rejected" count={ac.rejected} color="#FF453A" onClick={() => router.push('/tracker')}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
              />
            </div>

            <button onClick={() => router.push('/tracker')} style={{
              marginTop: 8, width: '100%', height: 32, borderRadius: 8, fontSize: 11, fontWeight: 600,
              color: '#2B3A8E', background: 'rgba(59,76,192,0.06)', border: '1px solid rgba(59,76,192,0.15)',
              cursor: 'pointer',
            }}>
              Open tracker &rarr;
            </button>
          </div>

          {/* ─ Col 2: Ready to apply / Explore ─ */}
          {(() => {
            const showingExplore = jobsLoaded && topJobs.length === 0;
            const displayJobs = showingExplore ? exploreJobs : topJobs;
            return (
              <div className="animate-fade-in" style={{ animationDelay: '300ms' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <SectionLabel>
                    {showingExplore ? 'Explore jobs' : (
                      <>Ready to apply{readyCount > 0 && <span style={{ marginLeft: 6, color: '#34C759', fontVariantNumeric: 'tabular-nums' }}>({readyCount})</span>}</>
                    )}
                  </SectionLabel>
                  <button onClick={() => router.push('/jobs')} style={{ fontSize: 11, color: '#2B3A8E', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0, marginBottom: 12 }}>
                    View all &rarr;
                  </button>
                </div>

                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)', borderRadius: 12, overflow: 'hidden' }}>
                  {displayJobs.length === 0 ? (
                    <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
                        {!jobsLoaded ? 'Loading…' : 'Upload your resume to unlock matches.'}
                      </p>
                    </div>
                  ) : (
                    displayJobs.map((job, i) => {
                      const isExplore = job.label === 'EXPLORE';
                      return (
                        <div key={job.id}
                          onClick={() => router.push('/jobs')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                            borderBottom: i < displayJobs.length - 1 ? '1px solid var(--border-main)' : 'none',
                            cursor: 'pointer', transition: 'background 140ms ease',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <CompanyLogo company={job.company} size={32} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {job.title}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>{job.company}</p>
                          </div>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, flexShrink: 0,
                            color: isExplore ? '#5B8DEF' : '#34C759',
                            background: isExplore ? 'rgba(91,141,239,0.1)' : 'rgba(52,199,89,0.1)',
                          }}>
                            {job.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {displayJobs.length > 0 && (
                  <button onClick={() => router.push('/jobs')} style={{
                    marginTop: 8, width: '100%', height: 32, borderRadius: 8, fontSize: 11, fontWeight: 600,
                    color: showingExplore ? '#5B8DEF' : '#34C759',
                    background: showingExplore ? 'rgba(91,141,239,0.06)' : 'rgba(52,199,89,0.06)',
                    border: `1px solid ${showingExplore ? 'rgba(91,141,239,0.2)' : 'rgba(52,199,89,0.2)'}`,
                    cursor: 'pointer',
                  }}>
                    {showingExplore ? 'Browse all jobs →' : `See all ${readyCount} ready matches →`}
                  </button>
                )}
              </div>
            );
          })()}

          {/* ─ Col 3: Deadlines + Targets ─ */}
          <div className="animate-fade-in" style={{ animationDelay: '400ms', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Deadlines */}
            <div>
              <SectionLabel>Up next</SectionLabel>
              {deadlines.length === 0 ? (
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)', borderRadius: 12, padding: '20px 16px' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>No deadlines scheduled.</p>
                  <button onClick={() => router.push('/calendar')} style={{ marginTop: 8, display: 'block', width: '100%', fontSize: 11, color: '#2B3A8E', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                    Add one &rarr;
                  </button>
                </div>
              ) : (
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)', borderRadius: 12, padding: '4px 16px' }}>
                  {deadlines.map((dl: any, i: number) => (
                    <DeadlineRow key={i} label={dl.label} daysUntil={dl.days_until} date={dl.date} />
                  ))}
                  <button onClick={() => router.push('/calendar')} style={{
                    display: 'block', width: '100%', padding: '8px 0', fontSize: 11, color: '#2B3A8E',
                    background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textAlign: 'left',
                  }}>
                    Calendar &rarr;
                  </button>
                </div>
              )}
            </div>

            {/* Interview prep card */}
            {interviewDeadlines.length > 0 && (
              <div>
                <div style={{ background: 'rgba(255,159,10,0.06)', border: '1px solid rgba(255,159,10,0.25)', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: '#FF9F0A', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 6px' }}>
                    Interview coming up
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {interviewDeadlines[0].label}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 12px' }}>
                    {interviewDeadlines[0].days_until === 0 ? 'Today' : interviewDeadlines[0].days_until === 1 ? 'Tomorrow' : `In ${interviewDeadlines[0].days_until} days`}
                  </p>
                  <button
                    onClick={() => fireProactiveCoach(`Let's do a mock interview to prep for my upcoming ${interviewDeadlines[0].label}.`)}
                    style={{
                      width: '100%', height: 30, borderRadius: 8, fontSize: 11, fontWeight: 700,
                      color: '#FF9F0A', background: 'rgba(255,159,10,0.1)', border: '1px solid rgba(255,159,10,0.3)', cursor: 'pointer',
                    }}
                  >
                    Practice with Dilly &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* Audit nudge */}
            {!richCtx && (
              <div>
                <div style={{ background: 'rgba(59,76,192,0.05)', border: '1px solid rgba(59,76,192,0.15)', borderRadius: 12, padding: '16px' }}>
                  <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 10px', lineHeight: 1.55 }}>
                    Run an audit to see how you stack up against your target companies.
                  </p>
                  <button onClick={() => router.push('/audit')} style={{
                    width: '100%', height: 32, borderRadius: 8, fontSize: 11, fontWeight: 700,
                    color: 'white', background: '#2B3A8E', border: 'none', cursor: 'pointer',
                  }}>
                    Run audit &rarr;
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── Row 2: Action Items + Resume Health ── */}
        <div className="animate-fade-in" style={{ animationDelay: '450ms', display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20 }}>

          {/* To Do */}
          <div>
            {(() => {
              const activeTasks = userTasks.filter(t => !t.done);
              const doneTasks = userTasks.filter(t => t.done);
              const pendingCount = activeTasks.length + actionItems.length;
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <SectionLabel>To do</SectionLabel>
                    {pendingCount > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
                        {pendingCount} pending
                      </span>
                    )}
                  </div>
                  <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)', borderRadius: 12, overflow: 'hidden' }}>

                    {/* User tasks — active */}
                    {activeTasks.map(task => (
                      <UserTaskRow key={task.id} task={task} onChange={updateUserTask} onDelete={deleteUserTask} />
                    ))}

                    {/* Dilly AI suggestions */}
                    {actionItems.slice(0, 4).map(item => (
                      <ActionRow key={item.id} item={item} onComplete={completeAction} />
                    ))}

                    {/* Empty state */}
                    {activeTasks.length === 0 && actionItems.length === 0 && (
                      <div style={{ padding: '18px 16px', textAlign: 'center' }}>
                        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>No tasks yet. Add one below or chat with Dilly.</p>
                      </div>
                    )}

                    {/* Add task */}
                    <AddTaskRow onAdd={addUserTask} />

                    {/* Done tasks (collapsed) */}
                    {doneTasks.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border-main)', padding: '8px 16px' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>
                          {doneTasks.length} completed
                          <button onClick={() => persistTasks(userTasks.filter(t => !t.done))}
                            style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                            Clear
                          </button>
                        </span>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Resume Health */}
          <div>
            <SectionLabel>Resume health</SectionLabel>
            {(() => {
              const days = richCtx?.days_since_audit ?? null;
              const take = richCtx?.dilly_take || null;
              const auditColor = days === null ? 'var(--text-3)' : days <= 7 ? '#34C759' : days <= 30 ? '#FF9F0A' : '#FF453A';
              const auditNum = days === null ? '—' : days === 0 ? 'Today' : String(days);
              const auditUnit = days === null ? '' : days === 0 ? '' : days === 1 ? 'day ago' : 'days ago';
              return (
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)', borderRadius: 12, padding: '16px' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 8px' }}>
                    Time since last audit
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 32, fontWeight: 900, color: auditColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {auditNum}
                    </span>
                    {auditUnit && (
                      <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
                        {auditUnit}
                      </span>
                    )}
                  </div>
                  {take && (
                    <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {take}
                    </p>
                  )}
                  <button onClick={() => router.push('/audit')} style={{
                    width: '100%', height: 32, borderRadius: 8, fontSize: 11, fontWeight: 700,
                    color: '#2B3A8E', background: 'rgba(59,76,192,0.07)', border: '1px solid rgba(59,76,192,0.15)', cursor: 'pointer',
                  }}>
                    {days === null ? 'Run first audit' : 'Re-audit'} &rarr;
                  </button>
                </div>
              );
            })()}
          </div>

        </div>

      </div>
    </div>
  );
}
