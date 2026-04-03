'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CompanyLogo from './CompanyLogo';
import { getAutomationRisk } from '@/lib/automation-risk';

interface CohortReadiness { cohort: string; readiness: string; level: string;
  student_smart?: number; student_grit?: number; student_build?: number;
  required_smart?: number; required_grit?: number; required_build?: number; }
interface Job {
  id: string; title: string; company: string; location: string; remote: boolean;
  posted_date: string; readiness: string; cohort_readiness: CohortReadiness[];
  source: string; description?: string; apply_url?: string;
}

export default function JobCard({ job, selected, onSelect, onContext }: {
  job: Job; selected: boolean; onSelect: (j: Job) => void;
  onContext: (e: React.MouseEvent, j: Job) => void;
}) {
  const [tipVisible, setTipVisible] = useState(false);
  const router = useRouter();

  function tailorResume(e: React.MouseEvent) {
    e.stopPropagation();
    sessionStorage.setItem('dilly_tailor_job', JSON.stringify({
      company: job.company,
      title: job.title,
      description: job.description || '',
    }));
    router.push('/resume-editor?auto_generate=1');
  }
  const rc: Record<string, { color: string; label: string }> = {
    ready: { color: '#34C759', label: 'Ready' },
    almost: { color: '#FF9F0A', label: 'Almost' },
    gap: { color: '#FF453A', label: 'Gap' },
  };
  const r = rc[job.readiness] || { color: '#48484A', label: '' };
  const posted = daysAgo(job.posted_date);
  const cr = job.cohort_readiness?.[0];
  const risk = getAutomationRisk(job.title);

  return (
    <button
      onClick={() => onSelect(job)}
      onContextMenu={(e) => { e.preventDefault(); onContext(e, job); }}
      style={{
        width: '100%', textAlign: 'left', borderRadius: 4, padding: '14px 16px',
        transition: 'all 150ms ease', cursor: 'pointer', border: '1px solid',
        borderColor: selected ? 'rgba(59,76,192,0.2)' : 'var(--border-main)',
        background: selected ? 'rgba(59,76,192,0.04)' : 'var(--surface-1)',
        display: 'block',
      }}
      onMouseEnter={e => { if (!selected) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-main)'; }}}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-main)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <CompanyLogo company={job.company} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: selected ? '#2B3A8E' : 'var(--text-1)', margin: 0, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {job.title}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{job.company}</p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: r.color, background: r.color + '10', padding: '3px 8px', borderRadius: 4, flexShrink: 0 }}>
          {r.label}
        </span>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
        {[job.location, job.remote ? 'Remote' : null, posted].filter(Boolean).join(' \u00b7 ')}
      </p>

      {cr && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <ScoreBar label="S" value={cr.student_smart || 0} req={cr.required_smart || 0} color="#2B3A8E" />
          <ScoreBar label="G" value={cr.student_grit || 0} req={cr.required_grit || 0} color="#2B3A8E" />
          <ScoreBar label="B" value={cr.student_build || 0} req={cr.required_build || 0} color="#34C759" />
        </div>
      )}

      {/* Bottom row: automation risk + tailor button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => { e.stopPropagation(); setTipVisible(v => !v); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px', borderRadius: 4,
            background: risk.bg, border: '1px solid ' + risk.border,
            cursor: 'pointer', transition: 'opacity 150ms',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: risk.color, flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: risk.color, letterSpacing: 0.3, textTransform: 'uppercase' as const }}>
            {risk.shortLabel}
          </span>
        </button>

        {tipVisible && (
          <div
            style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 50,
              background: 'var(--surface-2)', border: '1px solid var(--border-main)',
              borderRadius: 8, padding: '10px 12px', width: 220,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 11, fontWeight: 700, color: risk.color, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
              {risk.label}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>
              {risk.reason}
            </p>
          </div>
        )}
      </div>

      {/* Tailor resume CTA */}
      <button
        onClick={tailorResume}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 4, flexShrink: 0,
          background: 'rgba(59,76,192,0.06)', border: '1px solid rgba(59,76,192,0.18)',
          cursor: 'pointer', transition: 'all 150ms ease',
          fontSize: 9, fontWeight: 700, color: '#2B3A8E', letterSpacing: 0.3, textTransform: 'uppercase' as const,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,76,192,0.12)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,76,192,0.06)'; }}
      >
        ✦ Tailor resume
      </button>
      </div>
    </button>
  );
}

function ScoreBar({ label, value, req, color }: { label: string; value: number; req: number; color: string }) {
  const gap = req - value;
  const barColor = gap <= 0 ? '#34C759' : gap <= 10 ? '#FF9F0A' : '#FF453A';
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', width: 10 }}>{label}</span>
      <div style={{ flex: 1, height: 3, background: 'var(--border-main)', borderRadius: 2 }}>
        <div style={{ height: '100%', borderRadius: 2, backgroundColor: barColor, width: Math.min(value, 100) + '%', opacity: 0.7 }} />
      </div>
      <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 12, fontWeight: 700, color: barColor, fontStyle: 'italic', width: 18, textAlign: 'right' as const }}>{Math.round(value)}</span>
    </div>
  );
}

function daysAgo(d: string | null): string {
  if (!d) return '';
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (isNaN(diff)) return '';
  if (diff === 0) return 'Today';
  if (diff === 1) return '1d';
  return diff > 0 ? diff + 'd' : '';
}