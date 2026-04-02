'use client';
import { useState, useEffect } from 'react';
import JobCard from '@/components/jobs/JobCard';
import CompanyLogo from '@/components/jobs/CompanyLogo';
import CohortStrip from '@/components/jobs/CohortStrip';
import ContextMenu from '@/components/ui/ContextMenu';
import { useRightPanel, useProfile } from '../layout';
import { dilly } from '@/lib/dilly';
import { getAutomationRisk } from '@/lib/automation-risk';

function pickRecommended(jobs: any[]): any[] {
  const ready = jobs.filter(j => j.readiness === 'ready');
  const fresh = ready.filter(j => {
    const d = new Date(j.posted_date);
    return (Date.now() - d.getTime()) < 7 * 86400000;
  });
  const scored = (fresh.length >= 3 ? fresh : ready).map(j => {
    const cr = j.cohort_readiness?.[0];
    const fit = cr ? ((cr.student_smart || 0) + (cr.student_grit || 0) + (cr.student_build || 0)) / 3 : 50;
    const freshness = Math.max(0, 7 - Math.floor((Date.now() - new Date(j.posted_date).getTime()) / 86400000));
    return { ...j, _score: fit * 0.6 + freshness * 5 * 0.4 };
  });
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, 3);
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [readinessFilter, setReadinessFilter] = useState('');
  const [cohortFilter, setCohortFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const { profile } = useProfile();
  const cohortScores = Object.values(profile.cohort_scores || {}) as any[];
  const [cohortMatchCounts, setCohortMatchCounts] = useState<Record<string, number>>({});
  const [recommended, setRecommended] = useState<any[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; job: any } | null>(null);
  const { showJob } = useRightPanel();

  useEffect(() => { loadJobs(); loadStats(); }, [tab, readinessFilter, cohortFilter]);
  useEffect(() => { const t = setTimeout(() => loadJobs(), 250); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = jobs.findIndex(j => j.id === selected?.id);
        const next = e.key === 'ArrowDown' ? Math.min(idx + 1, jobs.length - 1) : Math.max(idx - 1, 0);
        if (jobs[next]) { setSelected(jobs[next]); showJob(jobs[next]); }
        return;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const input = document.getElementById('job-search') as HTMLInputElement;
        if (input) input.focus();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [jobs, selected]);

  async function loadJobs() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, limit: '80' });
      if (search) params.set('search', search);
      if (readinessFilter) params.set('readiness', readinessFilter);
      if (cohortFilter) params.set('cohort', cohortFilter);
      const data = await dilly.get('/v2/internships/feed?' + params);
      const listings = data.listings || [];
      const usStates = /^(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)$/i;
      const intlWords = /argentina|colombia|poland|warszawa|ireland|london|berlin|paris|tokyo|singapore|sydney|mumbai|bangalore|india|israel|amsterdam|dublin|munich|stockholm|hong kong|brazil|mexico|united kingdom|uk|europe|emea|apac|latam|germany|france|italy|spain|netherlands/i;
      const broadNational = /^(united states|usa|u\.s\.|nationwide|multiple locations?|various|anywhere)$/i;
      const filtered = listings.filter((l: any) => {
        const state = (l.location_state || '').trim();
        const city = (l.location_city || '').toLowerCase();
        const fullLoc = city + ' ' + state.toLowerCase();
        if (intlWords.test(fullLoc)) return false;
        const isRemote = l.work_mode === 'remote' || city.includes('remote');
        const isBroad = broadNational.test(city.trim()) || broadNational.test(state.trim());
        return isRemote || isBroad || usStates.test(state) || (!city && !state);
      });
      const parsed = filtered.map((l: any) => ({
        id: l.id, title: l.title, company: l.company,
        location: [l.location_city, l.location_state].filter(Boolean).join(', '),
        remote: l.work_mode === 'remote', posted_date: l.posted_date,
        readiness: l.readiness, cohort_readiness: l.cohort_readiness || [],
        cohort_requirements: l.cohort_requirements || [],
        required_smart: l.required_smart, required_grit: l.required_grit, required_build: l.required_build,
        description: l.description, apply_url: l.apply_url, source: l.source,
      }));
      setJobs(parsed);
      setRecommended(pickRecommended(parsed));
      if (parsed.length > 0 && !selected) { setSelected(parsed[0]); showJob(parsed[0]); }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function loadStats() {
    try {
      const s = await dilly.get('/v2/internships/stats');
      setStats(s);
      if (s.cohort_counts) setCohortMatchCounts(s.cohort_counts);
    } catch {}
  }

  function handleContext(e: React.MouseEvent, job: any) { setCtxMenu({ x: e.clientX, y: e.clientY, job }); }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 pt-5 flex-shrink-0">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-3">
            <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 24, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 0.5 }}>Jobs</h1>
            {stats && <span className="text-[13px] text-txt-3 font-mono">{stats.total} matches</span>}
          </div>
          <div className="flex gap-1.5">
            {[{ key: '', label: 'Any' }, { key: 'ready', label: 'Ready', c: '#34C759' }, { key: 'almost', label: 'Almost', c: '#FF9F0A' }, { key: 'gap', label: 'Gap', c: '#FF453A' }].map(r => (
              <button key={r.key} onClick={() => setReadinessFilter(readinessFilter === r.key ? '' : r.key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${readinessFilter === r.key ? 'bg-surface-2' : 'text-txt-3 hover:text-txt-2'}`}
                style={readinessFilter === r.key && r.c ? { color: r.c } : {}}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dashboard strip */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div className="bg-surface-1 rounded-xl p-3.5">
              <p className="text-[10px] text-txt-3 font-semibold uppercase tracking-wider">Ready</p>
              <p className="text-[24px] font-bold font-mono text-ready mt-0.5">{stats.ready}</p>
            </div>
            <div className="bg-surface-1 rounded-xl p-3.5">
              <p className="text-[10px] text-txt-3 font-semibold uppercase tracking-wider">Almost</p>
              <p className="text-[24px] font-bold font-mono text-almost mt-0.5">{stats.almost}</p>
            </div>
            <div className="bg-surface-1 rounded-xl p-3.5">
              <p className="text-[10px] text-txt-3 font-semibold uppercase tracking-wider">Gap</p>
              <p className="text-[24px] font-bold font-mono text-gap mt-0.5">{stats.gap}</p>
            </div>
            <div className="bg-surface-1 rounded-xl p-3.5">
              <p className="text-[10px] text-txt-3 font-semibold uppercase tracking-wider">Companies</p>
              <p className="text-[24px] font-bold font-mono text-dilly-blue mt-0.5">
                {new Set(jobs.map(j => j.company)).size}
              </p>
            </div>
          </div>
        )}

        {/* Recommended hero */}
        {recommended.length > 0 && !search && !readinessFilter && !cohortFilter && (
          <div className="mb-5">
            <p className="text-[11px] font-bold text-dilly-blue tracking-[0.15em] uppercase mb-3">Apply today</p>
            <div className="grid grid-cols-3 gap-3">
              {recommended.map(job => {
                const cr = job.cohort_readiness?.[0];
                return (
                  <button key={job.id}
                    onClick={() => { setSelected(job); showJob(job); }}
                    onContextMenu={(e) => { e.preventDefault(); handleContext(e, job); }}
                    className="text-left bg-surface-1 rounded-xl p-4 hover:-translate-y-[2px] hover:shadow-[0_8px_30px_rgba(59,76,192,0.12)] transition-all duration-200 group border border-transparent hover:border-dilly-blue/20">
                    <div className="flex items-center gap-3 mb-3">
                      <CompanyLogo company={job.company} size={32} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-txt-1 truncate group-hover:text-dilly-blue transition-colors">{job.title}</p>
                        <p className="text-[11px] text-txt-2 truncate">{job.company}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-txt-3 mb-2">{job.location}{job.remote ? ' \u00b7 Remote' : ''}</p>
                    {cr && (
                      <div className="flex gap-4 text-[10px] font-mono mb-2">
                        <span style={{ color: (cr.required_smart||0) - (cr.student_smart||0) <= 0 ? '#34C759' : '#FF9F0A' }}>S:{Math.round(cr.student_smart||0)}</span>
                        <span style={{ color: (cr.required_grit||0) - (cr.student_grit||0) <= 0 ? '#34C759' : '#FF9F0A' }}>G:{Math.round(cr.student_grit||0)}</span>
                        <span style={{ color: (cr.required_build||0) - (cr.student_build||0) <= 0 ? '#34C759' : '#FF9F0A' }}>B:{Math.round(cr.student_build||0)}</span>
                      </div>
                    )}
                    {(() => { const risk = getAutomationRisk(job.title); return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, background: risk.bg, border: '1px solid ' + risk.border }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: risk.color }} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: risk.color, letterSpacing: 0.3, textTransform: 'uppercase' }}>{risk.shortLabel}</span>
                      </span>
                    ); })()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Cohort strip */}
        {cohortScores.length > 0 && (
          <div className="mb-4">
            <CohortStrip
            cohorts={cohortScores}
            activeCohorts={cohortFilter ? new Set([cohortFilter]) : new Set()}
            onToggle={(c) => setCohortFilter(cohortFilter === c ? null : c)}
            onClearAll={() => setCohortFilter(null)}
            matchCounts={cohortMatchCounts}
          />
          </div>
        )}

        {/* Tabs + Search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1">
            {[{ key: 'all', label: 'All' }, { key: 'internship', label: 'Internships' }, { key: 'entry_level', label: 'Entry-level' }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${tab === t.key ? 'bg-dilly-blue text-white' : 'text-txt-3 hover:text-txt-2 hover:bg-surface-2'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-3" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="job-search" type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search... (just start typing)"
              className="w-full h-8 bg-surface-2/50 rounded-lg pl-8 pr-4 text-[12px] text-txt-1 placeholder:text-txt-3 outline-none focus:bg-surface-2 focus:ring-1 focus:ring-dilly-blue/30 transition-all" />
          </div>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="flex-1 px-6 pb-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-[160px] bg-surface-1 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] gap-2">
            <p className="text-[14px] text-txt-2">No matches found</p>
            <p className="text-[12px] text-txt-3">Try different filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {jobs.map(job => (
              <JobCard key={job.id} job={job}
                selected={selected?.id === job.id}
                onSelect={(j) => { setSelected(j); showJob(j); }}
                onContext={handleContext} />
            ))}
          </div>
        )}
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}
          items={[
            { label: 'Apply now', icon: '\u2197', shortcut: '\u2318\u21a9', action: () => { if (ctxMenu.job.apply_url) window.open(ctxMenu.job.apply_url, '_blank'); } },
            { label: 'Save to tracker', icon: '\u2606', shortcut: 'S', action: () => {} },
            { label: 'Ask Dilly about this', icon: '\u2728', action: () => showJob(ctxMenu.job) },
            { divider: true, label: '', action: () => {} },
            { label: 'Compare with...', icon: '\u2194', shortcut: '\u21e7+Click', action: () => {} },
            { label: 'View company', icon: '\u2302', action: () => {} },
            { divider: true, label: '', action: () => {} },
            { label: 'Dismiss', icon: '\u2715', color: 'text-gap', action: () => {} },
          ]} />
      )}
    </div>
  );
}