'use client';
import { useState, useEffect } from 'react';
import { getDailyHistory, type ScoreSnapshot } from '@/lib/score-history';

const DISMISS_KEY = 'dilly_weekly_report_dismissed';

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon ...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function buildActions(
  smart: number, grit: number, build: number,
  prevSmart: number, prevGrit: number, prevBuild: number,
): { icon: string; text: string; cta: string; href: string }[] {
  const actions: { score: number; delta: number; icon: string; text: string; cta: string; href: string }[] = [
    {
      score: smart, delta: smart - prevSmart,
      icon: '🧠',
      text: smart < 65
        ? 'Your Smart score has room to grow — add more quantified results to your resume.'
        : smart < 80
        ? 'Boost Smart by adding coursework, research, or academic achievements.'
        : 'Smart is strong. Keep documenting analytical wins in your resume.',
      cta: 'Audit resume →', href: '/audit',
    },
    {
      score: grit, delta: grit - prevGrit,
      icon: '🔥',
      text: grit < 65
        ? 'Grit is your lowest dimension — add leadership roles, endurance, or long-term projects.'
        : grit < 80
        ? 'Improve Grit by documenting persistence: clubs, multi-semester projects, or side hustles.'
        : 'Grit is solid. Look for jobs that reward commitment and leadership.',
      cta: 'View jobs →', href: '/jobs',
    },
    {
      score: build, delta: build - prevBuild,
      icon: '⚒️',
      text: build < 65
        ? 'Build is your weakest area — ship something: a project, an app, or a real deliverable.'
        : build < 80
        ? 'Strengthen Build by adding portfolio projects or internship deliverables to your resume.'
        : 'Build is excellent. Target companies that value makers and builders.',
      cta: 'View jobs →', href: '/jobs',
    },
  ];

  // Sort: lowest score first, then by biggest drop
  actions.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.delta - b.delta;
  });

  return actions.slice(0, 3);
}

interface WeeklyReportProps {
  smart: number;
  grit: number;
  build: number;
  dillyScore: number;
}

export default function WeeklyReport({ smart, grit, build, dillyScore }: WeeklyReportProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden, check on mount
  const [prevScores, setPrevScores] = useState<ScoreSnapshot | null>(null);
  const [weekDelta, setWeekDelta] = useState(0);

  useEffect(() => {
    const weekStart = getWeekStart();
    const dismissedFor = localStorage.getItem(DISMISS_KEY);

    // Show if not dismissed this week
    if (dismissedFor !== weekStart) {
      setDismissed(false);
    }

    // Load history to compute week-over-week delta
    const history = getDailyHistory();
    if (history.length >= 2) {
      const cutoff = Date.now() - 7 * 86400000;
      const weekOld = history.filter(h => h.ts <= cutoff).pop() ?? history[0];
      setPrevScores(weekOld);
      setWeekDelta(dillyScore - weekOld.dilly);
    }
  }, [dillyScore]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, getWeekStart());
    setDismissed(true);
  }

  if (dismissed) return null;

  const prev = prevScores;
  const prevSmart = prev?.smart ?? smart;
  const prevGrit = prev?.grit ?? grit;
  const prevBuild = prev?.build ?? build;
  const actions = buildActions(smart, grit, build, prevSmart, prevGrit, prevBuild);

  const deltaColor = weekDelta > 0 ? '#34C759' : weekDelta < 0 ? '#FF453A' : 'var(--text-3)';
  const deltaSign = weekDelta > 0 ? '+' : '';

  const now = new Date();
  const reportDate = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="animate-fade-in" style={{
      marginBottom: 28,
      borderRadius: 14,
      background: 'var(--surface-1)',
      border: '1px solid var(--border-main)',
      borderLeft: '3px solid #2B3A8E',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px 12px',
        borderBottom: '1px solid var(--border-main)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(59,76,192,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2B3A8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: 0.2 }}>
              Weekly Score Report
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>{reportDate}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Score delta */}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {prev ? '7-day change' : 'Current score'}
            </p>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 700, fontStyle: 'italic', color: deltaColor, margin: 0, lineHeight: 1 }}>
              {prev ? `${deltaSign}${weekDelta}` : dillyScore}
            </p>
          </div>

          {/* Dismiss */}
          <button onClick={dismiss}
            style={{
              width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-main)',
              background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'all 120ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,76,192,0.35)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-main)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
            title="Dismiss until next week"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Score bars row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 0, borderBottom: '1px solid var(--border-main)',
      }}>
        {([
          { label: 'Smart', now: smart, prev: prevSmart, color: '#FF9F0A' },
          { label: 'Grit', now: grit, prev: prevGrit, color: '#34C759' },
          { label: 'Build', now: build, prev: prevBuild, color: '#2B3A8E' },
        ] as const).map((dim, i) => {
          const delta = dim.now - dim.prev;
          return (
            <div key={dim.label} style={{
              padding: '12px 20px',
              borderRight: i < 2 ? '1px solid var(--border-main)' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {dim.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: dim.color, fontVariantNumeric: 'tabular-nums' }}>{dim.now}</span>
                  {prev && delta !== 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: delta > 0 ? '#34C759' : '#FF453A' }}>
                      {delta > 0 ? '+' : ''}{delta}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ height: 3, background: 'var(--border-main)', borderRadius: 2, position: 'relative' }}>
                <div style={{ height: '100%', borderRadius: 2, backgroundColor: dim.color, width: `${dim.now}%`, transition: 'width 800ms cubic-bezier(0.16,1,0.3,1)' }} />
                {prev && dim.prev !== dim.now && (
                  <div style={{
                    position: 'absolute', top: -1, width: 2, height: 5, borderRadius: 1,
                    background: 'var(--text-3)', opacity: 0.4,
                    left: `${dim.prev}%`, transform: 'translateX(-50%)',
                  }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3 action items */}
      <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>
          This week&rsquo;s 3 actions
        </p>
        {actions.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{a.icon}</span>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, flex: 1, lineHeight: 1.55 }}>{a.text}</p>
            <a href={a.href}
              style={{
                fontSize: 11, fontWeight: 600, color: '#2B3A8E', flexShrink: 0,
                background: 'rgba(59,76,192,0.07)', border: '1px solid rgba(59,76,192,0.18)',
                borderRadius: 6, padding: '2px 8px', textDecoration: 'none', cursor: 'pointer',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,76,192,0.14)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,76,192,0.07)'; }}
            >
              {a.cta}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
