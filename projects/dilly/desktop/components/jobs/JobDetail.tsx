'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CompanyLogo from './CompanyLogo';
import { useRightPanel, useProfile } from '@/app/(app)/layout';
import { dilly } from '@/lib/dilly';

/** Decode HTML entities + strip tags via the browser's own parser.
 *  Runs two passes to handle double-encoded HTML (entities that decode into tags). */
function cleanDescription(raw: string): string {
  if (!raw) return '';
  try {
    const parse = (s: string) => {
      const doc = new DOMParser().parseFromString(s, 'text/html');
      return doc.body.textContent ?? '';
    };
    let text = parse(raw);
    // If decoded text still contains HTML tags, strip them too
    if (/<[a-zA-Z]/.test(text)) text = parse(text);
    // Strip any remaining HTML entities (including truncated ones like &lt or &amp without semicolons)
    text = text.replace(/&[a-z#0-9]{1,10};?/gi, ' ');
    // Remove common boilerplate labels prepended by job boards
    text = text.replace(/^role\s+description[:\s]*/i, '');
    return text.replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return raw.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').trim();
  }
}

interface CohortReadiness {
  cohort: string; readiness: string;
  student_smart?: number; student_grit?: number; student_build?: number;
  required_smart?: number; required_grit?: number; required_build?: number;
}
interface Job {
  id: string; title: string; company: string; location: string; remote: boolean;
  posted_date: string; readiness: string; cohort_readiness: CohortReadiness[];
  cohort_requirements?: { cohort: string; smart?: number; grit?: number; build?: number }[];
  required_smart?: number; required_grit?: number; required_build?: number;
  description?: string; apply_url?: string; source: string;
}

export default function JobDetail({ job }: { job: Job }) {
  const { fireProactiveCoach } = useRightPanel();
  const { profile } = useProfile();
  const router = useRouter();

  // Build fit rows to display. Use cohort_readiness (matched cohorts with student scores)
  // when available; fall back to all cohort_requirements with overall student scores.
  const studentSmart = profile?.overall_smart ?? 0;
  const studentGrit  = profile?.overall_grit  ?? 0;
  const studentBuild = profile?.overall_build ?? 0;

  const fitRows: CohortReadiness[] = (() => {
    if (job.cohort_readiness?.length > 0) return job.cohort_readiness;
    // Fallback: synthesize from raw cohort_requirements
    const reqs = job.cohort_requirements || [];
    if (reqs.length > 0) {
      return reqs.map(req => {
        const rs = req.smart ?? 0, rg = req.grit ?? 0, rb = req.build ?? 0;
        const gaps = [
          rs > 0 && studentSmart < rs ? rs - studentSmart : 0,
          rg > 0 && studentGrit  < rg ? rg - studentGrit  : 0,
          rb > 0 && studentBuild < rb ? rb - studentBuild : 0,
        ].filter(Boolean);
        const readiness = gaps.length === 0 ? 'ready' : gaps.length === 1 && gaps[0] <= 15 ? 'almost' : 'gap';
        return { cohort: req.cohort, readiness, required_smart: rs, required_grit: rg, required_build: rb, student_smart: studentSmart, student_grit: studentGrit, student_build: studentBuild };
      });
    }
    // Last resort: flat scores
    if (job.required_smart || job.required_grit || job.required_build) {
      const rs = job.required_smart ?? 0, rg = job.required_grit ?? 0, rb = job.required_build ?? 0;
      return [{ cohort: 'Overall', readiness: job.readiness, required_smart: rs, required_grit: rg, required_build: rb, student_smart: studentSmart, student_grit: studentGrit, student_build: studentBuild }];
    }
    return [];
  })();
  const [fullDescription, setFullDescription] = useState<string | null>(null);
  const [descLoading, setDescLoading] = useState(false);

  function generateResume() {
    sessionStorage.setItem('dilly_tailor_job', JSON.stringify({
      company: job.company,
      title: job.title,
      description: fullDescription || job.description || '',
    }));
    router.push('/resume-generate');
  }

  useEffect(() => {
    setFullDescription(null);
    if (!job.id) return;
    setDescLoading(true);
    dilly.get(`/v2/internships/${job.id}`)
      .then((data: { description?: string }) => {
        if (data?.description) setFullDescription(data.description);
      })
      .catch(() => { /* fall back to description_preview */ })
      .finally(() => setDescLoading(false));
  }, [job.id]);
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
        {fitRows.length > 0 && (
          <div className="px-5 pb-4">
            <div className="bg-surface-2 rounded-xl p-4">
              <h3 className="text-[10px] font-bold text-dilly-gold tracking-[0.15em] uppercase mb-4">Your fit</h3>
              {fitRows.map((cr, i) => (
                <div key={i} className={i < fitRows.length - 1 ? 'mb-5 pb-5 border-b border-border-main' : ''}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-semibold text-txt-1">{cr.cohort}</span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: cr.readiness === 'ready' ? 'rgba(52,199,89,0.12)' : cr.readiness === 'almost' ? 'rgba(255,159,10,0.12)' : 'rgba(255,69,58,0.12)', color: cr.readiness === 'ready' ? '#34C759' : cr.readiness === 'almost' ? '#FF9F0A' : '#FF453A' }}>{cr.readiness}</span>
                  </div>
                  <DimBar label="Smart" student={cr.student_smart || 0} required={cr.required_smart || 0} />
                  <DimBar label="Grit" student={cr.student_grit || 0} required={cr.required_grit || 0} />
                  <DimBar label="Build" student={cr.student_build || 0} required={cr.required_build || 0} />
                  <button
                    onClick={() => {
                      const gaps = [
                        { dim: 'Smart', gap: (cr.required_smart || 0) - (cr.student_smart || 0), student: cr.student_smart || 0, req: cr.required_smart || 0 },
                        { dim: 'Grit', gap: (cr.required_grit || 0) - (cr.student_grit || 0), student: cr.student_grit || 0, req: cr.required_grit || 0 },
                        { dim: 'Build', gap: (cr.required_build || 0) - (cr.student_build || 0), student: cr.student_build || 0, req: cr.required_build || 0 },
                      ].filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap);
                      const gapSummary = gaps.length > 0
                        ? gaps.map(g => `${g.dim}: ${g.student} vs ${g.req} required (gap of ${Math.round(g.gap)})`).join(', ')
                        : 'all dimensions clear';
                      fireProactiveCoach(
                        `User clicked Ask Dilly about their ${cr.cohort} fit for ${job.title} at ${job.company}. ` +
                        `Their readiness: ${cr.readiness}. Scores — Smart: ${cr.student_smart || 0}/${cr.required_smart || 0}, ` +
                        `Grit: ${cr.student_grit || 0}/${cr.required_grit || 0}, Build: ${cr.student_build || 0}/${cr.required_build || 0}. ` +
                        `Gaps: ${gapSummary}. ` +
                        `Give specific, actionable advice on how to close these gaps for this specific role and cohort.`
                      );
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all duration-150 hover:-translate-y-[0.5px]"
                    style={{ color: '#2B3A8E', background: 'rgba(59,76,192,0.08)', border: '1px solid rgba(59,76,192,0.12)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3c-4.97 0-9 3.13-9 7 0 2.38 1.42 4.5 3.6 5.82L5 21l4.34-2.17C10.2 18.94 11.08 19 12 19c4.97 0 9-3.13 9-7s-4.03-7-9-7z"/>
                    </svg>
                    Ask Dilly about {cr.cohort}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}


        {(fullDescription || job.description) && (
          <div className="px-5 pb-5">
            <h3 className="text-[10px] font-bold text-txt-3 tracking-[0.15em] uppercase mb-3">About this role</h3>
            {descLoading ? (
              <div className="space-y-2">
                {[100, 85, 92, 70, 88].map((w, i) => (
                  <div key={i} className="h-3 rounded animate-pulse" style={{ width: w + '%', background: 'var(--surface-2)' }} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-txt-2 leading-[1.7] whitespace-pre-line">
                {cleanDescription(fullDescription || job.description || '')}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border-main flex flex-col gap-2">
        <button
          onClick={generateResume}
          className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-[13px] font-bold tracking-wide transition-all duration-150 active:scale-[0.98]"
          style={{ background: '#2B3A8E', color: 'white' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3b4fcc'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#2B3A8E'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
          </svg>
          Generate resume for this job
        </button>
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