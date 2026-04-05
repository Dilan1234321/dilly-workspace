'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { dilly } from '@/lib/dilly';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const TODAY = new Date().toISOString().slice(0, 10);

/** Return an ISO date string N days from today */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

interface CalEvent {
  id: string;
  date: string;
  title: string;
  type: 'deadline' | 'interview' | 'task' | 'match' | 'application' | 'prep';
  company?: string;
  time?: string;
  reminder_days?: number[];
  prep_type?: string;
  createdBy?: string;
  role?: string;
}

const DEMO_EVENTS: CalEvent[] = [
  { id: '1',  date: daysFromNow(0),  title: 'Cloudflare application due',      type: 'deadline',  company: 'Cloudflare',    time: '11:59 PM' },
  { id: '2',  date: daysFromNow(1),  title: 'Stripe phone screen',             type: 'interview', company: 'Stripe',        time: '2:00 PM' },
  { id: '3',  date: daysFromNow(2),  title: 'Update resume — finance track',   type: 'task' },
  { id: '4',  date: daysFromNow(4),  title: 'Goldman Sachs deadline',          type: 'deadline',  company: 'Goldman Sachs', time: '11:59 PM' },
  { id: '5',  date: daysFromNow(4),  title: 'Prep case study answers',         type: 'task' },
  { id: '6',  date: daysFromNow(6),  title: 'MongoDB final round',             type: 'interview', company: 'MongoDB',       time: '10:00 AM' },
  { id: '7',  date: daysFromNow(9),  title: '14 new matches',                  type: 'match' },
  { id: '8',  date: daysFromNow(11), title: 'Palantir application due',        type: 'deadline',  company: 'Palantir',      time: '11:59 PM' },
  { id: '9',  date: daysFromNow(12), title: 'Reach out to alumni — Data Science', type: 'task' },
  { id: '10', date: daysFromNow(16), title: 'Two Sigma technical screen',      type: 'interview', company: 'Two Sigma',     time: '3:30 PM' },
  { id: '11', date: daysFromNow(17), title: 'Cloudflare follow-up deadline',   type: 'deadline',  company: 'Cloudflare',    time: '5:00 PM' },
  { id: '12', date: daysFromNow(19), title: '8 new matches',                   type: 'match' },
  { id: '13', date: daysFromNow(23), title: 'Citadel application due',         type: 'deadline',  company: 'Citadel',       time: '11:59 PM' },
  { id: '14', date: daysFromNow(24), title: 'Resume review session',           type: 'task' },
  { id: '15', date: daysFromNow(26), title: 'Airbnb software interview',       type: 'interview', company: 'Airbnb',        time: '1:00 PM' },
  { id: '16', date: daysFromNow(30), title: 'Jane Street deadline',            type: 'deadline',  company: 'Jane Street',   time: '11:59 PM' },
];

type EventType = CalEvent['type'];

const TYPE_CONFIG: Record<EventType, { label: string; bg: string; border: string; text: string; dot: string; icon: string }> = {
  deadline:    { label: 'Deadline',    bg: 'rgba(255,69,58,0.12)',   border: 'rgba(255,69,58,0.25)',   text: '#FF453A', dot: '#FF453A', icon: '⏰' },
  interview:   { label: 'Interview',   bg: 'rgba(255,159,10,0.12)',  border: 'rgba(255,159,10,0.25)',  text: '#FF9F0A', dot: '#FF9F0A', icon: '🎯' },
  task:        { label: 'Task',        bg: 'rgba(91,141,239,0.12)',  border: 'rgba(91,141,239,0.25)',  text: '#5B8DEF', dot: '#5B8DEF', icon: '✓' },
  match:       { label: 'Match',       bg: 'rgba(52,199,89,0.12)',   border: 'rgba(52,199,89,0.25)',   text: '#34C759', dot: '#34C759', icon: '★' },
  application: { label: 'Application', bg: 'rgba(52,199,89,0.12)',   border: 'rgba(52,199,89,0.25)',   text: '#34C759', dot: '#34C759', icon: '💼' },
  prep:        { label: 'Prep',        bg: 'rgba(94,92,230,0.12)',   border: 'rgba(94,92,230,0.25)',   text: '#5E5CE6', dot: '#5E5CE6', icon: '📚' },
};

// Only show these types in filter chips (application & prep are always visible but not toggleable)
const FILTER_TYPES: EventType[] = ['deadline', 'interview', 'task', 'match', 'application', 'prep'];

type FilterSet = Set<EventType>;

interface NewEvent {
  title: string;
  date: string;
  time: string;
  type: EventType;
  company: string;
}

const EMPTY_NEW_EVENT: NewEvent = { title: '', date: TODAY, time: '', type: 'deadline', company: '' };

// ── Prep Deck types ──

interface PrepQuestion {
  question: string;
  category: string;
  probability: string;
  why_flagged: string;
  prep_tip: string;
}

interface DimensionGap {
  dimension: string;
  gap: number;
  focus: string;
}

interface PrepDeck {
  company: string;
  role: string;
  track: string;
  track_label: string;
  questions: PrepQuestion[];
  dimension_gaps: DimensionGap[];
  company_insights: string;
}

// ── Toast ──

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl shadow-lg text-[12px] font-semibold animate-fade-in"
      style={{ background: '#34C759', color: '#fff' }}>
      {message}
    </div>
  );
}

// ── Helpers ──

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDate(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatShortDate(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TASKS_KEY = 'dilly_user_tasks';
interface UserTask { id: string; text: string; date?: string; time?: string; done: boolean; }
function loadUserTasksAsEvents(): CalEvent[] {
  try {
    const tasks: UserTask[] = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
    return tasks
      .filter(t => !t.done && t.date)
      .map(t => ({ id: `ut-${t.id}`, date: t.date!, title: t.text, type: 'task' as const, time: t.time }));
  } catch { return []; }
}

const REMINDER_OPTIONS = [
  { days: 1, label: '1 day before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: '1 week before' },
];

// ── Reminder Toggles Component ──

function ReminderToggles({ event, onUpdate }: { event: CalEvent; onUpdate: (reminder_days: number[]) => void }) {
  const current = event.reminder_days || [];
  return (
    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-main)' }}>
      <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-3)' }}>Reminders</p>
      <div className="flex gap-1.5">
        {REMINDER_OPTIONS.map(opt => {
          const active = current.includes(opt.days);
          return (
            <button key={opt.days}
              onClick={() => {
                const next = active ? current.filter(d => d !== opt.days) : [...current, opt.days];
                onUpdate(next);
              }}
              className="px-2 py-1 rounded-md text-[10px] font-semibold transition-all"
              style={{
                background: active ? 'rgba(91,141,239,0.15)' : 'var(--surface-1)',
                color: active ? '#5B8DEF' : 'var(--text-3)',
                border: `1px solid ${active ? 'rgba(91,141,239,0.3)' : 'var(--border-main)'}`,
              }}>
              {active ? '✓ ' : ''}{opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Prep Deck Modal ──

function PrepDeckModal({ deck, onClose }: { deck: PrepDeck; onClose: () => void }) {
  const probColor: Record<string, string> = { high: '#FF453A', medium: '#FF9F0A', low: '#34C759' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[560px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--surface-0)', border: '1px solid var(--border-main)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border-main)' }}>
          <div>
            <p style={{ fontFamily: 'Cinzel, serif', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', letterSpacing: 0.3 }}>
              Interview Prep Deck
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
              {deck.company} — {deck.role} ({deck.track_label})
            </p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-surface-1"
            style={{ color: 'var(--text-3)' }}>
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Dimension gaps */}
          {deck.dimension_gaps.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>Your Gap Areas</p>
              <div className="flex gap-2">
                {deck.dimension_gaps.map(g => (
                  <div key={g.dimension} className="flex-1 rounded-lg p-3"
                    style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)' }}>
                    <p className="text-[12px] font-bold" style={{ color: '#FF453A' }}>{g.dimension}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-2)' }}>{g.gap} pts gap</p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>{g.focus}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Company insights */}
          <div className="rounded-lg p-3" style={{ background: 'rgba(91,141,239,0.08)', border: '1px solid rgba(91,141,239,0.2)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#5B8DEF' }}>Company Insight</p>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-2)' }}>{deck.company_insights}</p>
          </div>

          {/* Questions */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
              Predicted Questions ({deck.questions.length})
            </p>
            <div className="space-y-2">
              {deck.questions.map((q, i) => (
                <div key={i} className="rounded-lg p-3"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: (probColor[q.probability] || '#999') + '20', color: probColor[q.probability] || '#999' }}>
                      {q.probability}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                      {q.category}
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold mt-2 leading-snug" style={{ color: 'var(--text-1)' }}>{q.question}</p>
                  {q.why_flagged && (
                    <p className="text-[11px] mt-1.5" style={{ color: '#FF9F0A' }}>{q.why_flagged}</p>
                  )}
                  {q.prep_tip && (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>Tip: {q.prep_tip}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState<string>(TODAY);
  const [filters, setFilters] = useState<FilterSet>(new Set<EventType>(FILTER_TYPES));
  const [events, setEvents] = useState<CalEvent[]>(() => {
    if (typeof window === 'undefined') return DEMO_EVENTS;
    const userTaskEvents = loadUserTasksAsEvents();
    return [...DEMO_EVENTS, ...userTaskEvents];
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEvent, setNewEvent] = useState<NewEvent>(EMPTY_NEW_EVENT);
  const titleRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [prepDeck, setPrepDeck] = useState<PrepDeck | null>(null);
  const [loadingPrepSchedule, setLoadingPrepSchedule] = useState<string | null>(null);
  const [loadingPrepDeck, setLoadingPrepDeck] = useState<string | null>(null);

  // Load deadlines from API on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await dilly.fetch('/profile');
        const data = await res.json();
        const deadlines = data?.deadlines || [];
        if (!Array.isArray(deadlines) || deadlines.length === 0) return;
        const apiEvents: CalEvent[] = deadlines
          .filter((d: Record<string, unknown>) => d && d.date)
          .map((d: Record<string, unknown>) => ({
            id: (d.id as string) || String(Date.now() + Math.random()),
            date: (d.date as string).slice(0, 10),
            title: (d.label as string) || (d.title as string) || 'Untitled',
            type: (d.type as EventType) || 'deadline',
            company: (d.company as string) || undefined,
            time: (d.time as string) || undefined,
            reminder_days: Array.isArray(d.reminder_days) ? (d.reminder_days as number[]) : undefined,
            prep_type: (d.prep_type as string) || undefined,
            createdBy: (d.createdBy as string) || undefined,
            role: (d.role as string) || undefined,
          }));
        setEvents(prev => {
          // Merge API events with existing, avoiding duplicates by id
          const ids = new Set(apiEvents.map(e => e.id));
          const kept = prev.filter(e => !ids.has(e.id));
          return [...kept, ...apiEvents];
        });
        // Show toast if we got application-type deadlines (user just applied)
        const hasApplicationDeadlines = apiEvents.some(e => e.type === 'application');
        if (hasApplicationDeadlines) {
          setToast('New deadline added from your application');
        }
      } catch {
        // Silently fail — demo events remain
      }
    })();
  }, []);

  // Sync user tasks from home page on mount + storage changes
  useEffect(() => {
    function syncTasks() {
      const taskEvents = loadUserTasksAsEvents();
      setEvents(prev => {
        const withoutUserTasks = prev.filter(e => !e.id.startsWith('ut-'));
        return [...withoutUserTasks, ...taskEvents];
      });
    }
    syncTasks();
    window.addEventListener('storage', syncTasks);
    return () => window.removeEventListener('storage', syncTasks);
  }, []);

  useEffect(() => {
    if (showAddModal) setTimeout(() => titleRef.current?.focus(), 50);
  }, [showAddModal]);

  function openAdd(prefillDate?: string) {
    setNewEvent({ ...EMPTY_NEW_EVENT, date: prefillDate ?? selectedDate });
    setShowAddModal(true);
  }

  function submitAdd() {
    if (!newEvent.title.trim() || !newEvent.date) return;
    const id = String(Date.now());
    setEvents(prev => [...prev, {
      id,
      date: newEvent.date,
      title: newEvent.title.trim(),
      type: newEvent.type,
      company: newEvent.company.trim() || undefined,
      time: newEvent.time.trim() || undefined,
    }]);
    setSelectedDate(newEvent.date);
    setShowAddModal(false);
    setNewEvent(EMPTY_NEW_EVENT);
  }

  // ── Feature B: Update reminder_days on a deadline via profile PATCH ──
  const updateReminders = useCallback(async (eventId: string, reminderDays: number[]) => {
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, reminder_days: reminderDays } : e));
    try {
      const res = await dilly.fetch('/profile');
      const data = await res.json();
      const deadlines: Record<string, unknown>[] = data?.deadlines || [];
      const dl = deadlines.find((d) => d.id === eventId);
      if (dl) {
        dl.reminder_days = reminderDays;
        await dilly.fetch('/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deadlines }),
        });
      }
    } catch {
      // Non-critical
    }
  }, []);

  // ── Feature C: Generate prep schedule ──
  const generatePrepSchedule = useCallback(async (event: CalEvent) => {
    if (!event.company || !event.date) return;
    setLoadingPrepSchedule(event.id);
    try {
      const res = await dilly.fetch('/calendar/generate-prep-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_date: event.date,
          company: event.company,
          role: event.role || event.title,
        }),
      });
      const data = await res.json();
      if (data.blocks && data.blocks.length > 0) {
        const newPrepEvents: CalEvent[] = data.blocks.map((b: Record<string, unknown>) => ({
          id: b.id as string,
          date: (b.date as string).slice(0, 10),
          title: b.label as string,
          type: 'prep' as const,
          prep_type: b.prep_type as string,
          createdBy: 'dilly',
          company: event.company,
        }));
        setEvents(prev => {
          const ids = new Set(newPrepEvents.map(e => e.id));
          const kept = prev.filter(e => !ids.has(e.id));
          return [...kept, ...newPrepEvents];
        });
        setToast(`${data.blocks.length} prep blocks added for ${event.company}`);
      }
    } catch {
      setToast('Could not generate prep schedule');
    } finally {
      setLoadingPrepSchedule(null);
    }
  }, []);

  // ── Feature D: Generate prep deck ──
  const generatePrepDeck = useCallback(async (event: CalEvent) => {
    if (!event.company) return;
    setLoadingPrepDeck(event.id);
    try {
      const res = await dilly.fetch('/interview/prep-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: event.company,
          role: event.role || event.title,
        }),
      });
      const data = await res.json();
      setPrepDeck(data);
    } catch {
      setToast('Could not generate prep deck');
    } finally {
      setLoadingPrepDeck(null);
    }
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build 6-week grid (42 cells)
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const visibleEvents = events.filter(e => filters.has(e.type));

  const selectedEvents = visibleEvents.filter(e => e.date === selectedDate);

  const upcomingEvents = visibleEvents
    .filter(e => e.date >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  function toggleFilter(t: EventType) {
    setFilters(prev => {
      const next = new Set(prev);
      if (next.has(t)) { if (next.size > 1) next.delete(t); }
      else next.add(t);
      return next;
    });
  }

  function eventsForDay(day: number) {
    const ds = dateStr(year, month, day);
    return visibleEvents.filter(e => e.date === ds);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--surface-0)' }}>

      {/* ── Toast ── */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* ── Prep Deck Modal ── */}
      {prepDeck && <PrepDeckModal deck={prepDeck} onClose={() => setPrepDeck(null)} />}

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: 'var(--border-main)' }}>
        <div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: 0.3 }}>
            Career Calendar
          </h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
            Deadlines, interviews &amp; recruiting milestones
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter chips */}
          <div className="flex items-center gap-1.5">
            {FILTER_TYPES.map(t => {
              const cfg = TYPE_CONFIG[t];
              const on = filters.has(t);
              return (
                <button key={t} onClick={() => toggleFilter(t)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                  style={{
                    background: on ? cfg.bg : 'transparent',
                    color: on ? cfg.text : 'var(--text-3)',
                    border: `1px solid ${on ? cfg.border : 'var(--border-main)'}`,
                  }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? cfg.dot : 'var(--text-3)' }} />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Nav */}
          <div className="flex items-center gap-0.5 ml-2">
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-surface-1 text-txt-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="px-3 text-[13px] font-semibold min-w-[130px] text-center" style={{ color: 'var(--text-1)' }}>
              {MONTHS[month]} {year}
            </span>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-surface-1 text-txt-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <button onClick={() => { const n = new Date(); setCurrentDate(new Date(n.getFullYear(), n.getMonth(), 1)); setSelectedDate(TODAY); }}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
            style={{ background: 'var(--surface-1)', color: 'var(--text-2)', border: '1px solid var(--border-main)' }}>
            Today
          </button>

          <button onClick={() => openAdd()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90"
            style={{ background: '#5B8DEF', color: '#fff' }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            Add Event
          </button>
        </div>
      </div>

      {/* ── Body: calendar + sidebar ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: mini upcoming sidebar ── */}
        <div className="flex-shrink-0 w-[260px] border-r flex flex-col overflow-hidden"
          style={{ borderColor: 'var(--border-main)', background: 'var(--surface-0)' }}>

          {/* Selected day */}
          <div className="px-4 pt-4 pb-3 border-b overflow-y-auto" style={{ borderColor: 'var(--border-main)', maxHeight: '55%' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
              {formatDate(selectedDate)}
            </p>
            {selectedEvents.length === 0 ? (
              <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>No events</p>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map(e => {
                  const cfg = TYPE_CONFIG[e.type] || TYPE_CONFIG.task;
                  return (
                    <div key={e.id} className="rounded-lg p-2.5"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[12px]">{cfg.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold leading-tight" style={{ color: cfg.text }}>{e.title}</p>
                          {e.company && <p className="text-[10px] mt-0.5" style={{ color: cfg.text, opacity: 0.7 }}>{e.company}</p>}
                          {e.time && <p className="text-[10px] mt-0.5 font-medium" style={{ color: cfg.text, opacity: 0.6 }}>{e.time}</p>}
                        </div>
                      </div>

                      {/* Feature B: Reminder toggles for deadlines/interviews */}
                      {(e.type === 'deadline' || e.type === 'interview' || e.type === 'application') && (
                        <ReminderToggles event={e} onUpdate={(days) => updateReminders(e.id, days)} />
                      )}

                      {/* Feature C: Generate prep schedule for interviews */}
                      {e.type === 'interview' && e.company && (
                        <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-main)' }}>
                          <button
                            onClick={() => generatePrepSchedule(e)}
                            disabled={loadingPrepSchedule === e.id}
                            className="w-full py-1.5 rounded-md text-[10px] font-semibold transition-all disabled:opacity-50"
                            style={{ background: 'rgba(94,92,230,0.12)', color: '#5E5CE6', border: '1px solid rgba(94,92,230,0.25)' }}>
                            {loadingPrepSchedule === e.id ? 'Generating...' : '📚 Generate Prep Schedule'}
                          </button>
                        </div>
                      )}

                      {/* Feature D: View prep deck for interviews */}
                      {e.type === 'interview' && e.company && (
                        <div className="mt-1.5">
                          <button
                            onClick={() => generatePrepDeck(e)}
                            disabled={loadingPrepDeck === e.id}
                            className="w-full py-1.5 rounded-md text-[10px] font-semibold transition-all disabled:opacity-50"
                            style={{ background: 'rgba(255,159,10,0.12)', color: '#FF9F0A', border: '1px solid rgba(255,159,10,0.25)' }}>
                            {loadingPrepDeck === e.id ? 'Loading...' : '🎯 View Prep Deck'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick add for selected date */}
          <button onClick={() => openAdd(selectedDate)}
            className="mx-4 mb-3 mt-2 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 flex-shrink-0"
            style={{ background: 'rgba(91,141,239,0.12)', color: '#5B8DEF', border: '1px solid rgba(91,141,239,0.25)' }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            Add to {formatShortDate(selectedDate)}
          </button>

          {/* Upcoming events list */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-3)' }}>Upcoming</p>
            <div className="space-y-1">
              {upcomingEvents.map(e => {
                const cfg = TYPE_CONFIG[e.type] || TYPE_CONFIG.task;
                const isSelected = e.date === selectedDate;
                return (
                  <button key={e.id} onClick={() => setSelectedDate(e.date)}
                    className="w-full flex items-start gap-2.5 p-2 rounded-lg transition-all text-left"
                    style={{ background: isSelected ? cfg.bg : 'transparent' }}>
                    <span className="text-[11px] mt-0.5 flex-shrink-0">{cfg.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: isSelected ? cfg.text : 'var(--text-1)' }}>
                        {e.title}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                        {formatShortDate(e.date)}{e.time ? ` · ${e.time}` : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Center: calendar grid ── */}
        <div className="flex-1 flex flex-col overflow-hidden p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1 flex-shrink-0">
            {DAYS_SHORT.map(d => (
              <div key={d} className="text-center py-1.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: 'var(--text-3)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="flex-1 grid grid-cols-7 overflow-hidden" style={{ gridAutoRows: '1fr' }}>
            {cells.map((day, i) => {
              if (day === null) {
                return (
                  <div key={i} className="border-r border-b"
                    style={{ borderColor: 'var(--border-main)', opacity: 0.3 }} />
                );
              }
              const ds = dateStr(year, month, day);
              const isToday = ds === TODAY;
              const isSelected = ds === selectedDate;
              const dayEvents = eventsForDay(day);
              const isPast = ds < TODAY;

              return (
                <button key={i} onClick={() => setSelectedDate(ds)}
                  className="relative flex flex-col p-1.5 border-r border-b transition-colors text-left overflow-hidden group"
                  style={{
                    borderColor: 'var(--border-main)',
                    background: isSelected ? 'rgba(91,141,239,0.06)' : 'transparent',
                  }}>

                  {/* Hover bg */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'var(--surface-1)' }} />

                  {/* Selected border highlight */}
                  {isSelected && (
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ border: '1.5px solid rgba(91,141,239,0.4)', borderRadius: 1 }} />
                  )}

                  <div className="relative z-10 flex items-start justify-between w-full">
                    {/* Day number */}
                    <span className={`text-[13px] leading-none font-semibold ${isPast && !isToday ? 'opacity-40' : ''}`}
                      style={{
                        color: isToday ? '#fff' : isSelected ? '#5B8DEF' : 'var(--text-1)',
                        background: isToday ? '#5B8DEF' : 'transparent',
                        borderRadius: isToday ? '50%' : 0,
                        width: isToday ? 22 : 'auto',
                        height: isToday ? 22 : 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {day}
                    </span>
                    {/* Event count badge */}
                    {dayEvents.length > 2 && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                        +{dayEvents.length - 2}
                      </span>
                    )}
                  </div>

                  {/* Event chips */}
                  <div className="relative z-10 mt-1 flex flex-col gap-0.5 min-w-0 w-full">
                    {dayEvents.slice(0, 2).map(e => {
                      const cfg = TYPE_CONFIG[e.type] || TYPE_CONFIG.task;
                      return (
                        <div key={e.id} className="w-full rounded px-1 py-0.5 truncate"
                          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                          <span className="text-[10px] font-semibold truncate block" style={{ color: cfg.text }}>
                            {cfg.icon} {e.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Add Event Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="w-[420px] rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: 'var(--surface-0)', border: '1px solid var(--border-main)' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--border-main)' }}>
              <p style={{ fontFamily: 'Cinzel, serif', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', letterSpacing: 0.3 }}>
                New Event
              </p>
              <button onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-surface-1 text-txt-2 text-[16px] leading-none"
                style={{ color: 'var(--text-3)' }}>
                x
              </button>
            </div>

            {/* Form */}
            <div className="px-5 py-4 space-y-3.5">

              {/* Title */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-3)' }}>
                  Title
                </label>
                <input
                  ref={titleRef}
                  value={newEvent.title}
                  onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && submitAdd()}
                  placeholder="e.g. Goldman Sachs application due"
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-main)',
                    color: 'var(--text-1)',
                  }}
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-3)' }}>
                  Type
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['deadline', 'interview', 'task', 'match', 'application', 'prep'] as EventType[]).map(t => {
                    const cfg = TYPE_CONFIG[t];
                    const active = newEvent.type === t;
                    return (
                      <button key={t} onClick={() => setNewEvent(p => ({ ...p, type: t }))}
                        className="py-2 rounded-lg text-[11px] font-semibold transition-all"
                        style={{
                          background: active ? cfg.bg : 'var(--surface-1)',
                          color: active ? cfg.text : 'var(--text-2)',
                          border: `1px solid ${active ? cfg.border : 'var(--border-main)'}`,
                        }}>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date + Time row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-3)' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={newEvent.date}
                    onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border-main)',
                      color: 'var(--text-1)',
                      colorScheme: 'dark',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-3)' }}>
                    Time <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                  </label>
                  <input
                    value={newEvent.time}
                    onChange={e => setNewEvent(p => ({ ...p, time: e.target.value }))}
                    placeholder="e.g. 2:00 PM"
                    className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border-main)',
                      color: 'var(--text-1)',
                    }}
                  />
                </div>
              </div>

              {/* Company */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-3)' }}>
                  Company <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  value={newEvent.company}
                  onChange={e => setNewEvent(p => ({ ...p, company: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && submitAdd()}
                  placeholder="e.g. Goldman Sachs"
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-main)',
                    color: 'var(--text-1)',
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t"
              style={{ borderColor: 'var(--border-main)' }}>
              <button onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-colors"
                style={{ background: 'var(--surface-1)', color: 'var(--text-2)', border: '1px solid var(--border-main)' }}>
                Cancel
              </button>
              <button onClick={submitAdd} disabled={!newEvent.title.trim() || !newEvent.date}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-40"
                style={{ background: '#5B8DEF', color: '#fff' }}>
                Add Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
