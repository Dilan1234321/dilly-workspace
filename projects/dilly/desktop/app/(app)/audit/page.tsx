'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { dilly } from '@/lib/dilly';
import { getToken } from '@/lib/auth';
import { useProfile } from '../layout';

/* ── Types ─────────────────────────────────────────── */
interface ProfileGap {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}
interface ProfileAddition {
  title: string;
  description: string;
  action: string;
}
interface ResumeItem {
  title: string;
  why: string;
}
interface ResumeReframe {
  current: string;
  suggested: string;
  why: string;
}
interface CohortAuditResult {
  cohort_name: string;
  ts: number;
  dilly_take: string;
  profile_gaps: ProfileGap[];
  profile_additions: ProfileAddition[];
  resume_for_cohort: {
    include: ResumeItem[];
    exclude: ResumeItem[];
    reframe: ResumeReframe[];
  };
  cohort_score?: {
    smart: number;
    grit: number;
    build: number;
    dilly_score: number;
    level: string;
  };
}
interface CohortTab {
  name: string;
  level: 'major' | 'minor' | 'interest';
  smart: number;
  grit: number;
  build: number;
  dilly_score: number;
}

/* ── Helpers ────────────────────────────────────────── */
function scoreColor(s: number) {
  return s >= 75 ? '#34C759' : s >= 55 ? '#FF9F0A' : '#FF453A';
}

function guessCategoryFromAddition(title: string, action: string): string {
  const text = (title + ' ' + action).toLowerCase();
  if (/skill|technical|language|tool|framework|certif/.test(text)) return 'skill_unlisted';
  if (/project|built|created|developed|portfolio/.test(text)) return 'project_detail';
  if (/goal|career|aspir|ambition|objective/.test(text)) return 'goal';
  if (/hobby|interest|passion|outside|volunteer|club/.test(text)) return 'hobby';
  if (/personality|style|work style|approach|prefer/.test(text)) return 'personality';
  if (/strength|good at|excel|best at/.test(text)) return 'strength';
  if (/motiv|drive|why|purpose|meaning/.test(text)) return 'motivation';
  if (/culture|company|environment|workplace|team/.test(text)) return 'company_culture_pref';
  if (/availab|start date|when|relocat/.test(text)) return 'availability';
  if (/soft skill|leadership|communic|collaboration|problem.solv/.test(text)) return 'soft_skill';
  if (/achievement|award|recogni|honor|accomplish/.test(text)) return 'achievement';
  return 'goal'; // safe default
}
function priorityColor(p: string) {
  return p === 'high' ? '#FF453A' : p === 'medium' ? '#FF9F0A' : '#34C759';
}
function priorityBg(p: string) {
  return p === 'high' ? 'rgba(255,69,58,0.08)' : p === 'medium' ? 'rgba(255,159,10,0.08)' : 'rgba(52,199,89,0.08)';
}

/* ── Page ──────────────────────────────────────────── */
export default function AuditPage() {
  const { profile, refreshProfile } = useProfile();
  const searchParams = useSearchParams();
  const deepLinkCohort = searchParams.get('cohort');
  const fileRef = useRef<HTMLInputElement>(null);

  // Cohorts from profile
  const allCohorts: CohortTab[] = Object.values(profile.cohort_scores || {}).map((c: any) => ({
    name: c.cohort,
    level: c.level,
    smart: c.smart,
    grit: c.grit,
    build: c.build,
    dilly_score: c.dilly_score,
  }));

  // Unlocked interest cohorts from profile
  const unlockedFromProfile: string[] = (profile as any).unlocked_cohorts || [];

  const [hasResume, setHasResume] = useState<boolean | null>(null);
  const [selectedCohort, setSelectedCohort] = useState<string>(deepLinkCohort || '');
  const [results, setResults] = useState<Record<string, CohortAuditResult>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [unlocked, setUnlocked] = useState<string[]>(unlockedFromProfile);

  // Refs to avoid stale closures in async callbacks
  const inFlightRef = useRef<Set<string>>(new Set());
  const resultsRef = useRef<Record<string, CohortAuditResult>>({});
  useEffect(() => { resultsRef.current = results; }, [results]);

  // Sync unlocked from profile
  useEffect(() => {
    setUnlocked((profile as any).unlocked_cohorts || []);
  }, [(profile as any).unlocked_cohorts]);

  // Check for resume on mount
  useEffect(() => {
    dilly.get('/audit/history')
      .then((res: any) => {
        const h = Array.isArray(res) ? res : (res?.audits || []);
        setHasResume(h.length > 0);
      })
      .catch(() => setHasResume(false));
  }, []);

  // Load any existing cached cohort audits
  useEffect(() => {
    if (!hasResume) return;
    dilly.get('/audit/cohort/list')
      .then((res: any) => {
        const cached = res?.cohort_audits || {};
        if (Object.keys(cached).length > 0) {
          // Fetch full results for cached cohorts
          Object.keys(cached).forEach(name => {
            // Will load on tab click — just note they exist
          });
        }
      })
      .catch(() => {});
  }, [hasResume]);

  // Auto-run major/minor cohorts when resume is confirmed
  useEffect(() => {
    if (!hasResume || allCohorts.length === 0) return;

    const majorMinor = allCohorts.filter(c => c.level === 'major' || c.level === 'minor');

    // Set primary major as selected — deep-link cohort takes priority
    const deepMatch = deepLinkCohort && allCohorts.find(c => c.name === deepLinkCohort);
    const primaryMajor = deepMatch || allCohorts.find(c => c.level === 'major') || majorMinor[0];
    if (primaryMajor && !selectedCohort) {
      setSelectedCohort(primaryMajor.name);
    }

    // Kick off all major/minor audits in parallel
    majorMinor.forEach(c => runCohortAudit(c.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResume, allCohorts.length]);

  const runCohortAudit = useCallback(async (cohortName: string, force = false) => {
    if (inFlightRef.current.has(cohortName) && !force) return;
    if (resultsRef.current[cohortName] && !force) return;

    inFlightRef.current.add(cohortName);
    setLoading(prev => new Set(prev).add(cohortName));
    try {
      const result = await dilly.post<CohortAuditResult>('/audit/cohort', { cohort_name: cohortName, force });
      setResults(prev => ({ ...prev, [cohortName]: result }));
    } catch {
      // Silently fail — tab will show retry option
    } finally {
      inFlightRef.current.delete(cohortName);
      setLoading(prev => {
        const next = new Set(prev);
        next.delete(cohortName);
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabClick = useCallback(async (tab: CohortTab) => {
    setSelectedCohort(tab.name);

    const isInterest = tab.level === 'interest';
    const isUnlocked = unlocked.includes(tab.name);

    if (isInterest && !isUnlocked) {
      // Unlock + run audit
      try {
        const slug = tab.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const res = await dilly.post<any>(`/audit/cohort/${slug}/unlock`, { cohort_name: tab.name });
        setUnlocked(res.unlocked_cohorts || []);
        await refreshProfile();
      } catch { /* best effort */ }
    }

    if (!results[tab.name]) {
      runCohortAudit(tab.name);
    }
  }, [unlocked, results, runCohortAudit, refreshProfile]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('application_target', 'internship');
      const token = getToken() || '';
      const base = typeof window !== 'undefined' ? '/api/proxy' : (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000');
      const res = await fetch(`${base}/audit/v2`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      await res.json();
      // Rebuild resume_edited.json from the newly parsed resume so the generator uses real data
      try {
        await fetch(`${base}/resume/sync-base`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch {}
      await refreshProfile();
      setHasResume(true);
      // Clear cached cohort audits so they re-run with new resume
      setResults({});
      setLoading(new Set());
    } catch {
      // Could add toast
    } finally {
      setUploading(false);
    }
  }, [refreshProfile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  /* ── No resume yet ── */
  if (hasResume === false || (hasResume === null && allCohorts.length === 0)) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className="w-full max-w-md text-center transition-all duration-200"
          style={{
            padding: '52px 44px', borderRadius: 20,
            border: `2px dashed ${dragOver ? '#2B3A8E' : 'var(--border-main)'}`,
            background: dragOver ? 'rgba(59,76,192,0.04)' : 'var(--surface-1)',
          }}
        >
          <div className="text-4xl mb-4 opacity-30">✦</div>
          <h2 className="font-display text-xl text-txt-1 mb-2">Build your profile</h2>
          <p className="text-[13px] text-txt-3 mb-6 leading-relaxed">
            Upload your resume and Dilly will analyze your readiness<br />
            across every cohort — then tell you exactly what to add<br />
            to your Dilly profile for each one.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-7 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-opacity"
            style={{ background: '#2B3A8E', opacity: uploading ? 0.5 : 1 }}
          >
            {uploading ? 'Analyzing…' : 'Upload Resume'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={onFileChange} className="hidden" />
        </div>
      </div>
    );
  }

  const activeResult = selectedCohort ? results[selectedCohort] : null;
  const isLoadingActive = selectedCohort ? loading.has(selectedCohort) : false;
  const activeTab = allCohorts.find(c => c.name === selectedCohort);

  /* ── Main layout ── */
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 flex-shrink-0 border-b border-border-main">
        <div>
          <h1 className="font-display text-[22px] text-txt-1 tracking-tight">Profile Analysis</h1>
          <p className="text-[11px] text-txt-3">Cohort-specific readiness · what to build · what to put on your resume</p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-[11px] font-semibold px-4 py-2 rounded-lg border border-border-main text-txt-2 hover:border-dilly-blue hover:text-dilly-blue transition-colors"
        >
          {uploading ? 'Uploading…' : 'Update Resume'}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={onFileChange} className="hidden" />
      </div>

      {/* ── Cohort tabs (desktop: horizontal scroll, mobile: dropdown) ── */}
      <div className="flex-shrink-0 border-b border-border-main">
        {/* Desktop tabs */}
        <div className="hidden sm:flex overflow-x-auto scrollbar-none px-6 gap-1 pt-1">
          {allCohorts.map(tab => {
            const isSelected = tab.name === selectedCohort;
            const isInterest = tab.level === 'interest';
            const isUnlockedInterest = isInterest && unlocked.includes(tab.name);
            const isLocked = isInterest && !unlocked.includes(tab.name);
            const isRunning = loading.has(tab.name);
            const hasResult = !!results[tab.name];
            const score = Math.round(tab.dilly_score);

            return (
              <button
                key={tab.name}
                onClick={() => handleTabClick(tab)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 text-[12px] font-medium whitespace-nowrap transition-all rounded-t-lg border-b-2 flex-shrink-0"
                style={{
                  borderBottomColor: isSelected ? '#2B3A8E' : 'transparent',
                  color: isLocked ? 'var(--text-3)' : isSelected ? '#2B3A8E' : 'var(--text-2)',
                  opacity: isLocked ? 0.5 : 1,
                  background: isSelected ? 'rgba(59,76,192,0.04)' : 'transparent',
                }}
              >
                {isRunning ? (
                  <span className="w-3 h-3 rounded-full border-2 border-dilly-blue border-t-transparent animate-spin inline-block" />
                ) : isLocked ? (
                  <span className="text-[10px]">🔒</span>
                ) : hasResult ? (
                  <span
                    className="text-[10px] font-bold font-mono"
                    style={{ color: scoreColor(score) }}
                  >
                    {score}
                  </span>
                ) : null}
                <span>{tab.name}</span>
                {!isInterest && (
                  <span
                    className="text-[7px] font-bold tracking-widest uppercase ml-0.5"
                    style={{ color: isSelected ? '#2B3A8E' : 'var(--text-3)' }}
                  >
                    {tab.level}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Mobile dropdown */}
        <div className="sm:hidden px-4 py-2">
          <select
            value={selectedCohort}
            onChange={e => {
              const tab = allCohorts.find(c => c.name === e.target.value);
              if (tab) handleTabClick(tab);
            }}
            className="w-full text-[13px] px-3 py-2 rounded-lg border border-border-main bg-surface-1 text-txt-1"
          >
            {allCohorts.map(tab => (
              <option key={tab.name} value={tab.name}>{tab.name} ({tab.level})</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading state */}
        {isLoadingActive && !activeResult && (
          <div className="flex flex-col gap-4 p-6">
            {[100, 200, 280, 180].map((h, i) => (
              <div key={i} className="skeleton rounded-xl" style={{ height: h }} />
            ))}
          </div>
        )}

        {/* No cohorts yet */}
        {allCohorts.length === 0 && !isLoadingActive && (
          <div className="h-full flex items-center justify-center text-txt-3 text-[13px]">
            Complete your profile to see cohort analysis.
          </div>
        )}

        {/* Interest cohort not yet unlocked */}
        {activeTab && activeTab.level === 'interest' && !unlocked.includes(activeTab.name) && !isLoadingActive && (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="text-4xl opacity-20">🔒</div>
            <p className="text-[14px] font-semibold text-txt-1">Analyze {activeTab.name} readiness</p>
            <p className="text-[12px] text-txt-3 max-w-xs leading-relaxed">
              Click to run a full profile analysis for this field. Once complete, jobs for this cohort will appear across the app.
            </p>
            <button
              onClick={() => handleTabClick(activeTab)}
              className="px-6 py-2.5 rounded-lg text-[13px] font-semibold text-white"
              style={{ background: '#2B3A8E' }}
            >
              Analyze {activeTab.name}
            </button>
          </div>
        )}

        {/* Results */}
        {activeResult && !isLoadingActive && (
          <CohortAnalysisView result={activeResult} tab={activeTab} onRefresh={() => runCohortAudit(selectedCohort, true)} />
        )}

        {/* No result yet and not loading — shouldn't happen but fallback */}
        {!activeResult && !isLoadingActive && selectedCohort && activeTab && (
          activeTab.level !== 'interest' || unlocked.includes(activeTab.name)
        ) && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-[13px] text-txt-3">No analysis yet for {selectedCohort}.</p>
            <button
              onClick={() => runCohortAudit(selectedCohort)}
              className="text-[12px] text-dilly-blue font-semibold hover:underline"
            >
              Run analysis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Cohort Analysis View ──────────────────────────── */
function CohortAnalysisView({
  result,
  tab,
  onRefresh,
}: {
  result: CohortAuditResult;
  tab: CohortTab | undefined;
  onRefresh: () => void;
}) {
  const router = useRouter();
  // Tab scores come from the live profile context (synthesized in-memory on GET /profile)
  // and are always more accurate than the backend's cohort_score (which reads from raw file).
  const score = {
    smart: tab?.smart || result.cohort_score?.smart || 0,
    grit: tab?.grit || result.cohort_score?.grit || 0,
    build: tab?.build || result.cohort_score?.build || 0,
    dilly_score: tab?.dilly_score || result.cohort_score?.dilly_score || 0,
    level: tab?.level || result.cohort_score?.level || 'interest',
  };
  const dillyScore = Math.round(score.dilly_score);
  const ts = result.ts ? new Date(result.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5 pb-12">
      {/* Score hero + Dilly Take */}
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}
      >
        <div className="flex items-start justify-between mb-4">
          {/* Scores */}
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[9px] font-bold tracking-widest uppercase text-txt-3 mb-0.5">Dilly Score</p>
              <span
                className="font-display text-5xl leading-none"
                style={{ color: scoreColor(dillyScore), fontStyle: 'italic' }}
              >
                {dillyScore}
              </span>
            </div>
            <div className="flex gap-4 text-[12px]">
              {[
                { label: 'Smart', value: Math.round(score.smart), color: '#2B3A8E' },
                { label: 'Grit', value: Math.round(score.grit), color: '#C9A84C' },
                { label: 'Build', value: Math.round(score.build), color: '#34C759' },
              ].map(d => (
                <div key={d.label} className="text-center">
                  <p className="text-[9px] text-txt-3 mb-0.5">{d.label}</p>
                  <p className="text-[18px] font-bold font-mono" style={{ color: d.color }}>{d.value}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Meta */}
          <div className="text-right flex flex-col items-end gap-1.5">
            {tab && (
              <span
                className="text-[7px] font-bold tracking-widest uppercase px-2 py-0.5 rounded"
                style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
              >
                {tab.level}
              </span>
            )}
            {ts && <p className="text-[10px] text-txt-3">Analyzed {ts}</p>}
            <button
              onClick={onRefresh}
              className="text-[10px] text-txt-3 hover:text-dilly-blue transition-colors"
            >
              Refresh ↻
            </button>
          </div>
        </div>

        {/* Dilly Take */}
        {result.dilly_take && (
          <div
            className="rounded-xl p-4"
            style={{ background: 'rgba(59,76,192,0.04)', border: '1px solid rgba(59,76,192,0.12)' }}
          >
            <p className="text-[13px] font-medium text-txt-1 leading-relaxed" style={{ margin: 0 }}>
              {result.dilly_take}
            </p>
          </div>
        )}
      </div>

      {/* Profile Gaps */}
      {result.profile_gaps?.length > 0 && (
        <Section title="Profile Gaps" subtitle="What's missing from your Dilly profile for this cohort">
          <div className="space-y-2.5">
            {result.profile_gaps.map((gap, i) => (
              <div
                key={i}
                className="rounded-xl p-4 flex gap-3"
                style={{ background: priorityBg(gap.priority), border: `1px solid ${priorityColor(gap.priority)}28` }}
              >
                <div
                  className="text-[8px] font-bold tracking-widest uppercase px-2 py-1 rounded flex-shrink-0 h-fit mt-0.5"
                  style={{ color: priorityColor(gap.priority), background: `${priorityColor(gap.priority)}18` }}
                >
                  {gap.priority}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-txt-1 mb-1">{gap.title}</p>
                  <p className="text-[12px] text-txt-2 leading-relaxed">{gap.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Add to Dilly Profile */}
      {result.profile_additions?.length > 0 && (
        <Section title="Add to Your Dilly Profile" subtitle="Log these to close your gaps and improve your score">
          <div className="space-y-2.5">
            {result.profile_additions.map((item, i) => (
              <div
                key={i}
                className="rounded-xl p-4 flex gap-3"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold mt-0.5"
                  style={{ background: 'rgba(59,76,192,0.1)', color: '#2B3A8E' }}
                >
                  +
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-txt-1 mb-0.5">{item.title}</p>
                  <p className="text-[12px] text-txt-2 leading-relaxed mb-2">{item.description}</p>
                  <button
                    onClick={() => {
                      const cat = guessCategoryFromAddition(item.title, item.action);
                      router.push(`/profile?category=${encodeURIComponent(cat)}&add=1`);
                    }}
                    className="text-[11px] font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-all"
                    style={{ background: 'rgba(59,76,192,0.08)', color: '#2B3A8E', border: '1px solid rgba(59,76,192,0.15)', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,76,192,0.14)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,76,192,0.08)'; }}
                  >
                    <span>→</span>
                    <span>{item.action}</span>
                    <span style={{ opacity: 0.5 }}>· Add to profile</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Resume for Cohort */}
      {result.resume_for_cohort && (
        <Section
          title={`Resume for ${result.cohort_name}`}
          subtitle="What to include, cut, and reframe for this specific field"
        >
          <div className="space-y-4">
            {/* Include */}
            {result.resume_for_cohort.include?.length > 0 && (
              <div>
                <p className="text-[9px] font-bold tracking-widest uppercase text-txt-3 mb-2">Include</p>
                <div className="space-y-2">
                  {result.resume_for_cohort.include.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-3.5 flex gap-3"
                      style={{ background: 'rgba(52,199,89,0.05)', border: '1px solid rgba(52,199,89,0.2)' }}
                    >
                      <span className="text-[14px] flex-shrink-0">✓</span>
                      <div>
                        <p className="text-[12px] font-semibold text-txt-1">{item.title}</p>
                        <p className="text-[11px] text-txt-3 leading-relaxed mt-0.5">{item.why}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exclude */}
            {result.resume_for_cohort.exclude?.length > 0 && (
              <div>
                <p className="text-[9px] font-bold tracking-widest uppercase text-txt-3 mb-2">Remove or De-emphasize</p>
                <div className="space-y-2">
                  {result.resume_for_cohort.exclude.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-3.5 flex gap-3"
                      style={{ background: 'rgba(255,69,58,0.04)', border: '1px solid rgba(255,69,58,0.15)' }}
                    >
                      <span className="text-[14px] flex-shrink-0">✕</span>
                      <div>
                        <p className="text-[12px] font-semibold text-txt-1">{item.title}</p>
                        <p className="text-[11px] text-txt-3 leading-relaxed mt-0.5">{item.why}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reframe */}
            {result.resume_for_cohort.reframe?.length > 0 && (
              <div>
                <p className="text-[9px] font-bold tracking-widest uppercase text-txt-3 mb-2">Reframe</p>
                <div className="space-y-2.5">
                  {result.resume_for_cohort.reframe.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid var(--border-main)' }}
                    >
                      <div className="grid grid-cols-2">
                        <div className="p-3.5" style={{ background: 'rgba(255,69,58,0.04)', borderRight: '1px solid var(--border-main)' }}>
                          <p className="text-[8px] font-bold tracking-widest uppercase text-[#FF453A] mb-1.5">Before</p>
                          <p className="text-[12px] text-txt-2 leading-relaxed">{item.current}</p>
                        </div>
                        <div className="p-3.5" style={{ background: 'rgba(52,199,89,0.04)' }}>
                          <p className="text-[8px] font-bold tracking-widest uppercase text-[#34C759] mb-1.5">After</p>
                          <p className="text-[12px] text-txt-1 leading-relaxed">{item.suggested}</p>
                        </div>
                      </div>
                      {item.why && (
                        <div className="px-4 py-2" style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--border-main)' }}>
                          <p className="text-[10px] text-txt-3">{item.why}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ── Section wrapper ──────────────────────────────── */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}
    >
      <div className="mb-4">
        <h3 className="text-[10px] font-bold tracking-widest uppercase text-dilly-blue mb-0.5">{title}</h3>
        {subtitle && <p className="text-[11px] text-txt-3">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
