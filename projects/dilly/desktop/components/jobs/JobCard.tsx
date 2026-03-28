'use client';
import CompanyLogo from './CompanyLogo';

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
  const rc: Record<string, { color: string; label: string }> = {
    ready: { color: '#34C759', label: 'Ready' },
    almost: { color: '#FF9F0A', label: 'Almost' },
    gap: { color: '#FF453A', label: 'Gap' },
  };
  const r = rc[job.readiness] || { color: '#48484A', label: '' };
  const posted = daysAgo(job.posted_date);
  const cr = job.cohort_readiness?.[0];

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
          <p style={{ fontSize: 14, fontWeight: 500, color: selected ? '#3B4CC0' : 'var(--text-1)', margin: 0, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
        <div style={{ display: 'flex', gap: 4 }}>
          <ScoreBar label="S" value={cr.student_smart || 0} req={cr.required_smart || 0} color="#3B4CC0" />
          <ScoreBar label="G" value={cr.student_grit || 0} req={cr.required_grit || 0} color="#C9A84C" />
          <ScoreBar label="B" value={cr.student_build || 0} req={cr.required_build || 0} color="#34C759" />
        </div>
      )}
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