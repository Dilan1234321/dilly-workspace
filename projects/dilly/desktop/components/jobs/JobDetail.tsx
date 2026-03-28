'use client';
import CompanyLogo from './CompanyLogo';

interface CohortReadiness {
  cohort: string; readiness: string; level: string;
  student_smart?: number; student_grit?: number; student_build?: number;
  required_smart?: number; required_grit?: number; required_build?: number;
}
interface Job {
  id: string; title: string; company: string; location: string; remote: boolean;
  posted_date: string; readiness: string; cohort_readiness: CohortReadiness[];
  description?: string; apply_url?: string; source: string;
}

export default function JobDetail({ job }: { job: Job }) {
  const rc: Record<string, { color: string; label: string; bg: string }> = {
    ready: { color: '#34C759', label: 'Ready', bg: 'rgba(52,199,89,0.08)' },
    almost: { color: '#FF9F0A', label: 'Almost', bg: 'rgba(255,159,10,0.08)' },
    gap: { color: '#FF453A', label: 'Gap', bg: 'rgba(255,69,58,0.08)' },
  };
  const r = rc[job.readiness] || { color: '#48484A', label: 'Unknown', bg: 'rgba(72,72,74,0.08)' };

  return (
    <div className="h-full flex flex-col">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <CompanyLogo company={job.company} size={44} />
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-semibold text-txt-1 leading-snug">{job.title}</h2>
            <p className="text-[14px] text-txt-2 mt-1 font-medium">{job.company}</p>
            <p className="text-[12px] text-txt-3 mt-1">{[job.location, job.remote ? 'Remote' : null].filter(Boolean).join(' \u00b7 ')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mt-4">
          <span className="text-[11px] font-bold px-3.5 py-1.5 rounded-lg tracking-wide"
            style={{ color: r.color, backgroundColor: r.bg }}>
            {r.label}
          </span>
          <span className="text-[11px] text-txt-3 font-medium">{job.source}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {job.cohort_readiness?.length > 0 && (
          <div className="px-5 pb-4">
            <div className="bg-surface-2 rounded-xl p-4">
              <h3 className="text-[10px] font-bold text-dilly-gold tracking-[0.15em] uppercase mb-4">Your fit</h3>
              {job.cohort_readiness.map((cr, i) => (
                <div key={i} className={i < job.cohort_readiness.length - 1 ? 'mb-5 pb-5 border-b border-border-main' : ''}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-semibold text-txt-1">{cr.cohort}</span>
                    <span className="text-[9px] font-bold text-txt-3 tracking-widest uppercase bg-surface-1 px-2 py-0.5 rounded">{cr.level}</span>
                  </div>
                  <DimBar label="Smart" student={cr.student_smart || 0} required={cr.required_smart || 0} />
                  <DimBar label="Grit" student={cr.student_grit || 0} required={cr.required_grit || 0} />
                  <DimBar label="Build" student={cr.student_build || 0} required={cr.required_build || 0} />
                </div>
              ))}
            </div>
          </div>
        )}

        {job.description && (
          <div className="px-5 pb-5">
            <h3 className="text-[10px] font-bold text-txt-3 tracking-[0.15em] uppercase mb-3">About this role</h3>
            <p className="text-[13px] text-txt-2 leading-[1.7] whitespace-pre-line">
              {job.description.replace(/<[^>]*>/g, '').slice(0, 1200)}
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border-main">
        <div className="flex gap-2.5">
          {job.apply_url && (
            <a href={job.apply_url} target="_blank" rel="noopener noreferrer"
              className="flex-1 h-11 bg-dilly-blue hover:bg-dilly-blue-light text-white rounded-xl flex items-center justify-center gap-2 text-[13px] font-bold tracking-wide transition-all duration-150 hover:shadow-[0_4px_12px_rgba(59,76,192,0.3)] active:scale-[0.98]">
              Apply now
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          )}
          <button className="h-11 w-11 bg-surface-2 hover:bg-surface-2/70 text-txt-2 rounded-xl flex items-center justify-center transition-all duration-150 hover:text-dilly-gold active:scale-95">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
            </svg>
          </button>
          <button className="h-11 w-11 bg-surface-2 hover:bg-surface-2/70 text-txt-2 rounded-xl flex items-center justify-center transition-all duration-150 hover:text-gap active:scale-95">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function DimBar({ label, student, required }: { label: string; student: number; required: number }) {
  const gap = Math.round((required - student) * 10) / 10;
  const color = gap <= 0 ? '#34C759' : gap <= 10 ? '#FF9F0A' : '#FF453A';
  const pct = Math.min(student / 100, 1) * 100;
  const targetPct = Math.min(required / 100, 1) * 100;

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] text-txt-3 font-medium w-11">{label}</span>
        <span className="text-[15px] font-bold font-mono tabular-nums" style={{ color }}>
          {Math.round(student)}
        </span>
        <span className="text-[10px] text-txt-3 font-mono">/ {Math.round(required)}</span>
        <span className="text-[10px] font-semibold ml-auto" style={{ color }}>
          {gap <= 0 ? 'Clear' : '+' + gap + ' needed'}
        </span>
      </div>
      <div className="h-[4px] bg-surface-1 rounded-full relative overflow-visible">
        <div className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: pct + '%', backgroundColor: color }} />
        <div className="absolute top-[-3px] w-[2px] h-[10px] rounded-sm transition-all duration-500"
          style={{ left: targetPct + '%', backgroundColor: color, opacity: 0.4 }} />
      </div>
    </div>
  );
}