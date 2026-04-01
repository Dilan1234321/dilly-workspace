'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import CompanyLogo from '@/components/jobs/CompanyLogo';

/* ── Types ─────────────────────────────────────────── */
type Status = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected';

interface Application {
  id: string;
  company: string;
  role: string;
  status: Status;
  applied_at?: string;
  deadline?: string;
  job_url?: string;
  notes?: string;
}

/* ── Constants ─────────────────────────────────────── */
const STORAGE_KEY = 'dilly_tracker';

const STATUS_META: Record<Status, { label: string; color: string; bg: string; border: string }> = {
  saved:        { label: 'Saved',        color: '#636366', bg: 'rgba(99,99,102,0.10)',   border: 'rgba(99,99,102,0.20)'   },
  applied:      { label: 'Applied',      color: '#5B8DEF', bg: 'rgba(91,141,239,0.10)',  border: 'rgba(91,141,239,0.22)'  },
  interviewing: { label: 'Interviewing', color: '#FF9F0A', bg: 'rgba(255,159,10,0.10)',  border: 'rgba(255,159,10,0.22)'  },
  offer:        { label: 'Offer',        color: '#34C759', bg: 'rgba(52,199,89,0.10)',   border: 'rgba(52,199,89,0.22)'   },
  rejected:     { label: 'Rejected',     color: '#FF453A', bg: 'rgba(255,69,58,0.10)',   border: 'rgba(255,69,58,0.20)'   },
};

const ALL_STATUSES: Status[] = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];

/* ── Helpers ───────────────────────────────────────── */
function daysAgo(iso?: string): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);
}

/* ── Animated bar ──────────────────────────────────── */
function AnimBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(pct), delay);
    return () => clearTimeout(t);
  }, [pct, delay]);
  return (
    <div style={{ height: 6, background: 'var(--border-main)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 3, backgroundColor: color,
        width: w + '%', transition: 'width 900ms cubic-bezier(0.16, 1, 0.3, 1)',
      }} />
    </div>
  );
}

/* ── KPI Card ──────────────────────────────────────── */
function KpiCard({ label, value, sub, color, delay }: {
  label: string; value: string; sub?: string; color: string; delay: number;
}) {
  return (
    <div className="animate-fade-in" style={{
      animationDelay: delay + 'ms',
      background: 'var(--surface-1)',
      border: '1px solid var(--border-main)',
      borderRadius: 12,
      padding: '20px 20px 18px',
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 1.8, textTransform: 'uppercase', margin: '0 0 10px' }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'Cormorant Garamond, serif', fontSize: 42, fontWeight: 700,
        color, margin: 0, lineHeight: 1, fontStyle: 'italic',
      }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 0 0' }}>{sub}</p>
      )}
    </div>
  );
}

/* ── Status Badge ──────────────────────────────────── */
function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
      color: m.color, background: m.bg,
      border: '1px solid ' + m.border,
      borderRadius: 4, padding: '2px 8px',
      whiteSpace: 'nowrap' as const,
    }}>
      {m.label}
    </span>
  );
}

/* ── Funnel ─────────────────────────────────────────── */
function FunnelViz({ applied, interviewing, offer, rejected }: {
  applied: number; interviewing: number; offer: number; rejected: number;
}) {
  const stages = [
    { label: 'Applied', count: applied, color: '#5B8DEF', bg: 'rgba(91,141,239,0.12)' },
    { label: 'Interviewing', count: interviewing, color: '#FF9F0A', bg: 'rgba(255,159,10,0.12)' },
    { label: 'Offer', count: offer, color: '#34C759', bg: 'rgba(52,199,89,0.12)' },
  ];
  const maxCount = Math.max(applied, 1);

  const callbackPct = applied > 0 ? Math.round(interviewing / applied * 100) : 0;
  const offerPct = interviewing > 0 ? Math.round(offer / interviewing * 100) : 0;

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border-main)',
      borderRadius: 12,
      padding: '24px 28px',
      marginBottom: 32,
    }}>
      <p style={{ fontFamily: 'Cinzel, serif', fontSize: 11, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 20px' }}>
        Application Funnel
      </p>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {stages.map((stage, i) => {
          const widthPct = Math.max(20, (stage.count / maxCount) * 100);
          const conversionLabel = i === 1 ? callbackPct + '% progressed' : i === 2 ? offerPct + '% closed' : null;

          return (
            <div key={stage.label} style={{ display: 'flex', alignItems: 'center', flex: i === 0 ? '1 1 auto' : 'none', gap: 0 }}>
              {/* Arrow connector */}
              {i > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '0 12px' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4, whiteSpace: 'nowrap' as const }}>
                    {conversionLabel}
                  </div>
                  <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                    <path d="M0 8H16M16 8L10 2M16 8L10 14" stroke={stage.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {/* Stage bar */}
              <div style={{
                background: stage.bg,
                border: `1px solid ${stage.color}30`,
                borderRadius: 10,
                padding: '16px 20px',
                minWidth: 110,
                width: i === 0 ? '100%' : undefined,
              }}>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 36, fontWeight: 700, color: stage.color, margin: '0 0 4px', lineHeight: 1, fontStyle: 'italic' }}>
                  {stage.count}
                </p>
                <p style={{ fontSize: 10, fontWeight: 700, color: stage.color, margin: 0, letterSpacing: 1, textTransform: 'uppercase' as const }}>
                  {stage.label}
                </p>
                {/* Mini bar */}
                <div style={{ marginTop: 10 }}>
                  <AnimBar pct={widthPct} color={stage.color} delay={400 + i * 150} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Rejected sidebar */}
        <div style={{ marginLeft: 'auto', paddingLeft: 24, display: 'flex', alignItems: 'center' }}>
          <div style={{
            background: 'rgba(255,69,58,0.06)',
            border: '1px solid rgba(255,69,58,0.15)',
            borderRadius: 10,
            padding: '16px 20px',
            minWidth: 90,
          }}>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 36, fontWeight: 700, color: '#FF453A', margin: '0 0 4px', lineHeight: 1, fontStyle: 'italic' }}>
              {rejected}
            </p>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#FF453A', margin: 0, letterSpacing: 1, textTransform: 'uppercase' as const }}>
              Rejected
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Row ─────────────────────────────────────────────── */
function TimelineRow({
  app,
  onStatusChange,
  onNoteSave,
  flashId,
}: {
  app: Application;
  onStatusChange: (id: string, status: Status) => void;
  onNoteSave: (id: string, notes: string) => void;
  flashId: string | null;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(app.notes || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const d = daysAgo(app.applied_at);
  const isFlashing = flashId === app.id;

  useEffect(() => {
    setNoteValue(app.notes || '');
  }, [app.notes]);

  function handleNoteClick() {
    setEditingNote(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleNoteBlur() {
    setEditingNote(false);
    if (noteValue !== (app.notes || '')) {
      onNoteSave(app.id, noteValue);
    }
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '40px 1fr 130px 80px 56px 1fr 130px',
      alignItems: 'center',
      gap: '0 16px',
      padding: '12px 20px',
      background: isFlashing ? 'rgba(52,199,89,0.06)' : 'transparent',
      borderBottom: '1px solid var(--border-main)',
      transition: 'background 600ms ease',
    }}>
      {/* Logo */}
      <CompanyLogo company={app.company} size={36} />

      {/* Company + Role */}
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {app.company}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {app.role}
        </p>
      </div>

      {/* Status badge + dropdown */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
        <StatusBadge status={app.status} />
        <select
          value={app.status}
          onChange={e => onStatusChange(app.id, e.target.value as Status)}
          style={{
            fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)',
            border: '1px solid var(--border-main)', borderRadius: 4,
            padding: '2px 4px', cursor: 'pointer', width: '100%',
          }}
        >
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </div>

      {/* Applied date */}
      <div>
        <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>{formatDate(app.applied_at)}</p>
        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>applied</p>
      </div>

      {/* Days since */}
      <div style={{ textAlign: 'center' as const }}>
        {d !== null ? (
          <>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 700, color: d >= 14 ? '#FF9F0A' : 'var(--text-2)', margin: 0, lineHeight: 1 }}>
              {d}
            </p>
            <p style={{ fontSize: 9, color: 'var(--text-3)', margin: '2px 0 0', letterSpacing: 0.5 }}>days</p>
          </>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>—</p>
        )}
      </div>

      {/* Notes */}
      <div style={{ minWidth: 0 }}>
        {editingNote ? (
          <textarea
            ref={textareaRef}
            value={noteValue}
            onChange={e => setNoteValue(e.target.value)}
            onBlur={handleNoteBlur}
            onKeyDown={e => { if (e.key === 'Escape') { setEditingNote(false); setNoteValue(app.notes || ''); } }}
            placeholder="Add a note..."
            rows={2}
            style={{
              width: '100%', fontSize: 11, color: 'var(--text-1)',
              background: 'var(--surface-2)', border: '1px solid rgba(91,141,239,0.35)',
              borderRadius: 6, padding: '6px 8px', resize: 'none' as const,
              outline: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              boxShadow: '0 0 0 3px rgba(91,141,239,0.08)',
            }}
          />
        ) : (
          <div
            onClick={handleNoteClick}
            style={{
              fontSize: 11, color: noteValue ? 'var(--text-2)' : 'var(--text-3)',
              padding: '5px 8px', borderRadius: 6, cursor: 'text',
              border: '1px solid transparent', minHeight: 30,
              transition: 'border-color 150ms ease, background 150ms ease',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              lineHeight: 1.5,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-main)';
              (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            {noteValue || 'Click to add note...'}
          </div>
        )}
      </div>

      {/* Job URL */}
      <div>
        {app.job_url ? (
          <a
            href={app.job_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 10, color: '#5B8DEF', textDecoration: 'none', fontWeight: 500 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
          >
            View listing &rarr;
          </a>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>No URL saved</span>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────── */
export default function OutcomesPage() {
  const router = useRouter();
  const [apps, setApps] = useState<Application[]>([]);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setApps(JSON.parse(raw));
    } catch {}
    setMounted(true);
  }, []);

  function saveApps(updated: Application[]) {
    setApps(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  }

  function handleStatusChange(id: string, newStatus: Status) {
    const updated = apps.map(a =>
      a.id === id
        ? {
            ...a,
            status: newStatus,
            applied_at: newStatus !== 'saved' && !a.applied_at
              ? new Date().toISOString().slice(0, 10)
              : a.applied_at,
          }
        : a
    );
    saveApps(updated);

    if (newStatus === 'offer') {
      setFlashId(id);
      setTimeout(() => setFlashId(null), 1800);
    }
  }

  function handleNoteSave(id: string, notes: string) {
    const updated = apps.map(a => a.id === id ? { ...a, notes } : a);
    saveApps(updated);
  }

  /* ── Derived metrics ── */
  const trackedApps = apps.filter(a => a.status !== 'saved');
  const totalApplied = trackedApps.length;

  const countApplied      = apps.filter(a => a.status === 'applied').length;
  const countInterviewing = apps.filter(a => a.status === 'interviewing').length;
  const countOffer        = apps.filter(a => a.status === 'offer').length;
  const countRejected     = apps.filter(a => a.status === 'rejected').length;

  const callbackDenom = countApplied + countInterviewing + countOffer + countRejected;
  const callbackRate = callbackDenom > 0
    ? Math.round((countInterviewing + countOffer) / callbackDenom * 100)
    : 0;
  const offerRate = totalApplied > 0
    ? Math.round(countOffer / totalApplied * 100)
    : 0;

  // Avg response time: days for "applied" items (still waiting)
  const appliedWithDate = apps.filter(a => a.status === 'applied' && a.applied_at);
  const avgWait = appliedWithDate.length > 0
    ? Math.round(appliedWithDate.reduce((sum, a) => sum + (daysAgo(a.applied_at) || 0), 0) / appliedWithDate.length)
    : null;

  // Timeline: all non-saved, sorted by applied_at desc
  const timeline = [...trackedApps].sort((a, b) => {
    if (!a.applied_at && !b.applied_at) return 0;
    if (!a.applied_at) return 1;
    if (!b.applied_at) return -1;
    return new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime();
  });

  if (!mounted) return null;

  /* ── Empty state ── */
  if (apps.length === 0 || trackedApps.length === 0) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: '36px 44px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid var(--border-main)' }}>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 26, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px', letterSpacing: -0.3 }}>
            Outcomes
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
            Your application funnel and callback metrics
          </p>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
          padding: '80px 40px', textAlign: 'center' as const,
          background: 'var(--surface-1)', border: '1px solid var(--border-main)',
          borderRadius: 12,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'rgba(91,141,239,0.10)', border: '1px solid rgba(91,141,239,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <p style={{ fontFamily: 'Cinzel, serif', fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 8px' }}>
            No applications tracked yet
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 24px', maxWidth: 320, lineHeight: 1.6 }}>
            Start by adding jobs to your Tracker. Once you move them beyond Saved, your funnel will appear here.
          </p>
          <button
            onClick={() => router.push('/tracker')}
            style={{
              background: '#2B3A8E', color: 'white', border: 'none', borderRadius: 8,
              padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'opacity 150ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            Go to Tracker &rarr;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '36px 44px' }}>

      {/* ── Header ── */}
      <div className="animate-fade-in" style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid var(--border-main)' }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 26, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px', letterSpacing: -0.3 }}>
          Outcomes
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Your application funnel and callback metrics
        </p>
      </div>

      {/* ── KPI Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <KpiCard
          label="Total Applied"
          value={String(totalApplied)}
          sub={`${countRejected} rejected · ${countOffer} offer${countOffer !== 1 ? 's' : ''}`}
          color="#5B8DEF"
          delay={100}
        />
        <KpiCard
          label="Callback Rate"
          value={callbackRate + '%'}
          sub="Interviews + offers / total applied"
          color={callbackRate >= 30 ? '#34C759' : callbackRate >= 15 ? '#FF9F0A' : '#FF453A'}
          delay={200}
        />
        <KpiCard
          label="Offer Rate"
          value={offerRate + '%'}
          sub={`${countOffer} offer${countOffer !== 1 ? 's' : ''} from ${totalApplied} applied`}
          color={offerRate >= 10 ? '#34C759' : offerRate >= 5 ? '#FF9F0A' : 'var(--text-2)'}
          delay={300}
        />
        <KpiCard
          label="Avg Response Time"
          value={avgWait !== null ? `${avgWait}d` : '—'}
          sub={avgWait !== null ? 'avg wait for pending apps' : 'no pending applications'}
          color={avgWait !== null && avgWait >= 14 ? '#FF9F0A' : 'var(--text-2)'}
          delay={400}
        />
      </div>

      {/* ── Funnel ── */}
      <FunnelViz
        applied={countApplied + countInterviewing + countOffer + countRejected}
        interviewing={countInterviewing + countOffer}
        offer={countOffer}
        rejected={countRejected}
      />

      {/* ── Timeline ── */}
      <div className="animate-fade-in" style={{ animationDelay: '300ms', background: 'var(--surface-1)', border: '1px solid var(--border-main)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr 130px 80px 56px 1fr 130px',
          gap: '0 16px',
          padding: '10px 20px',
          borderBottom: '1px solid var(--border-main)',
          background: 'var(--surface-2)',
        }}>
          {['', 'Company / Role', 'Status', 'Applied', 'Days', 'Notes', 'Link'].map((col, i) => (
            <p key={i} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 1.5, textTransform: 'uppercase', margin: 0 }}>
              {col}
            </p>
          ))}
        </div>

        {/* Rows */}
        {timeline.map((app, i) => (
          <div key={app.id} className="animate-fade-in" style={{ animationDelay: (350 + i * 40) + 'ms' }}>
            <TimelineRow
              app={app}
              onStatusChange={handleStatusChange}
              onNoteSave={handleNoteSave}
              flashId={flashId}
            />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes offerFlash {
          0%, 100% { background: transparent; }
          30% { background: rgba(52,199,89,0.12); }
        }
      `}</style>
    </div>
  );
}
