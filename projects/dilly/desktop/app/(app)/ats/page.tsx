'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';

/* ── Types ─────────────────────────────────────────── */
interface ChecklistItem {
  id: string; label: string; description: string; passed: boolean;
  impact: 'critical' | 'high' | 'medium' | 'low';
  dilly_fix?: string; potential_pts?: number;
}

interface Issue {
  id: string; severity: 'critical' | 'warning' | 'info';
  title: string; detail: string; quote?: string;
  dilly_insight?: string; dilly_action?: string; potential_pts?: number;
}

interface QuickFix {
  id: string; original: string; rewritten: string; reason: string;
  reason_type?: string;
}

interface Keyword {
  keyword: string; count: number; in_context: number; bare_list: number;
}

interface Vendor {
  name: string; score: number;
  status: 'will_parse' | 'risky' | 'fail';
  companies: string[];
}

interface Contact {
  name?: string; email?: string; phone?: string; linkedin?: string;
  location?: string; university?: string; major?: string; gpa?: string;
  graduation?: string;
}

interface Experience {
  company: string; role: string; start?: string; end?: string; bullet_count?: number;
}

interface ATSResult {
  score: number;
  previous_score?: number | null;
  status: 'excellent' | 'good' | 'risky' | 'at_risk';
  format_checks: { passed: number; total: number };
  fields_parsed: { parsed: number; total: number };
  sections_detected: number;
  critical_issue_count: number;
  potential_gain: number;
  score_history?: { date: string; score: number }[];
  contact?: Contact;
  experience?: Experience[];
  checklist: ChecklistItem[];
  issues: Issue[];
  quick_fixes: QuickFix[];
  keywords: Keyword[];
  keyword_stats?: { total: number; in_context: number; bare_list: number };
  keyword_placement_pct?: number;
  vendors: Vendor[];
  dilly_score_commentary?: string;
  dilly_keyword_commentary?: string;
  dilly_vendor_commentary?: string;
}

/* ── Constants ─────────────────────────────────────── */
function statusInfo(s: string) {
  if (s === 'excellent') return { label: 'Excellent', color: '#34C759' };
  if (s === 'good')      return { label: 'Good', color: '#2B3A8E' };
  if (s === 'risky')     return { label: 'Risky', color: '#FF9F0A' };
  return { label: 'At Risk', color: '#FF453A' };
}

function vendorStatusColor(s: string) {
  if (s === 'will_parse') return '#34C759';
  if (s === 'risky') return '#FF9F0A';
  return '#FF453A';
}

function severityColor(s: string) {
  if (s === 'critical') return '#FF453A';
  if (s === 'warning') return '#FF9F0A';
  return '#2B3A8E';
}

function impactColor(s: string) {
  if (s === 'critical') return '#FF453A';
  if (s === 'high') return '#FF9F0A';
  if (s === 'medium') return '#2B3A8E';
  return 'var(--text-3)';
}

/* ── Vendor-specific tips ──────────────────────────── */
const VENDOR_TIPS: Record<string, { strictness: string; color: string; summary: string; actions: string[] }> = {
  workday: {
    strictness: 'Very Strict',
    color: '#FF453A',
    summary: 'Workday is one of the strictest ATS systems. It struggles with non-standard formatting and will reject resumes it can\'t parse.',
    actions: [
      'Use standard section headers: "Education", "Experience", "Skills" — Workday won\'t recognize creative alternatives.',
      'Avoid tables, columns, and text boxes — Workday merges columns into garbled text.',
      'Use "Month YYYY" date format (e.g., "Jan 2025") — Workday needs this exact pattern to calculate duration.',
      'Put your email in the body, not a header/footer — Workday can\'t read page headers.',
      'List skills individually, comma-separated — Workday uses these for keyword matching.',
    ],
  },
  taleo: {
    strictness: 'Very Strict',
    color: '#FF453A',
    summary: 'Taleo (Oracle) ignores headers and footers entirely and requires strict formatting. Used by many Fortune 500 companies.',
    actions: [
      'Move all contact info into the body text — Taleo skips headers and footers completely.',
      'Use only standard section headers — Taleo\'s parser is rigid and won\'t recognize creative headings.',
      'Avoid tables and multi-column layouts — Taleo cannot parse them at all.',
      'Stick to "Month YYYY" dates — Taleo has limited date pattern recognition.',
    ],
  },
  icims: {
    strictness: 'Moderate',
    color: '#FF9F0A',
    summary: 'iCIMS is moderately strict. It requires a Skills section for keyword matching and has some formatting requirements.',
    actions: [
      'Include a dedicated "Skills" section — iCIMS relies on this for keyword matching against job descriptions.',
      'Use standard date formats — iCIMS recognizes "Month YYYY" and "MM/YYYY".',
      'Keep section headers standard — "Education", "Experience", "Skills" work best.',
      'List tools and technologies explicitly — iCIMS matches these against job requirements.',
    ],
  },
  successfactors: {
    strictness: 'Moderate',
    color: '#FF9F0A',
    summary: 'SAP SuccessFactors has moderate parsing requirements. Clean formatting and standard structure are key.',
    actions: [
      'Ensure email is clearly visible — SuccessFactors flags applications without contact info.',
      'Avoid garbled text or non-standard encoding — save as a standard PDF.',
      'Use standard section headers for reliable parsing.',
    ],
  },
  greenhouse: {
    strictness: 'Lenient',
    color: '#34C759',
    summary: 'Greenhouse is one of the most forgiving ATS systems. Most well-formatted resumes parse correctly.',
    actions: [
      'Focus on content quality over formatting — Greenhouse handles most layouts well.',
      'Include relevant keywords naturally in your bullet points — recruiters search by keyword.',
      'A standard structure still helps, but Greenhouse is flexible with variations.',
    ],
  },
  lever: {
    strictness: 'Lenient',
    color: '#34C759',
    summary: 'Lever is very forgiving and handles most resume formats well. Focus on content rather than formatting.',
    actions: [
      'Most formats parse fine — focus on strong, keyword-rich bullet points.',
      'Include a Skills section for better keyword matching in recruiter searches.',
      'Lever handles creative formatting better than most — but standard headers still recommended.',
    ],
  },
  ashby: {
    strictness: 'Very Lenient',
    color: '#34C759',
    summary: 'Ashby has the most modern parser and handles nearly all formats. Popular with startups.',
    actions: [
      'Almost any format works — Ashby\'s parser is built for modern resumes.',
      'Focus on content quality and quantified impact in your bullets.',
      'Keywords still matter for recruiter search, so mention tools and skills explicitly.',
    ],
  },
  default: {
    strictness: 'Unknown',
    color: '#2B3A8E',
    summary: 'We don\'t have specific data on this company\'s ATS. Your general scan results still apply.',
    actions: [
      'Follow safe formatting: standard headers, no tables, "Month YYYY" dates.',
      'Include a Skills section with relevant keywords.',
      'Keep your resume to one page with clean, scannable structure.',
    ],
  },
};

/* ── Tabs ──────────────────────────────────────────── */
type Tab = 'overview' | 'issues' | 'checklist' | 'keywords' | 'vendors' | 'fixes';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'issues', label: 'Issues' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'fixes', label: 'Fixes' },
];

/* ── Page ──────────────────────────────────────────── */
export default function ATSPage() {
  const [result, setResult] = useState<ATSResult | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [dragOver, setDragOver] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [companyResult, setCompanyResult] = useState<{ vendor_key: string; vendor_name: string; company: string } | null>(null);
  const [companyNotFound, setCompanyNotFound] = useState(false);
  const [companySearching, setCompanySearching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Toggle loading cursor on app shell (cleanup on unmount)
  useEffect(() => {
    const shell = document.querySelector('.dilly-app-shell') as HTMLElement | null;
    if (shell) shell.dataset.loading = scanning ? 'true' : 'false';
    return () => { if (shell) shell.dataset.loading = 'false'; };
  }, [scanning]);

  // Debounced company ATS lookup
  useEffect(() => {
    if (!companySearch.trim()) { setCompanyResult(null); setCompanyNotFound(false); return; }
    setCompanySearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await apiFetch(`/ats-company-lookup?company=${encodeURIComponent(companySearch.trim())}`);
        if (data.vendor_key) { setCompanyResult(data); setCompanyNotFound(false); }
        else { setCompanyResult(null); setCompanyNotFound(true); }
      } catch { setCompanyResult(null); setCompanyNotFound(true); }
      setCompanySearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [companySearch]);

  // Scan with provided text (from resume editor) or auto-load saved resume
  const scanWithText = useCallback(async (text: string) => {
    setScanning(true);
    try {
      const token = getToken() || '';
      const base = typeof window !== 'undefined' ? '/api/proxy' : (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000');
      const res = await fetch(`${base}/ats/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ raw_text: text }),
      });
      if (!res.ok) throw new Error('Scan failed');
      const data = await res.json();
      setResult(normalizeResult(data));
    } catch {
      // Fall back to GET
      try {
        const data = await apiFetch('/ats/scan');
        setResult(normalizeResult(data));
      } catch { /* stay on upload UI */ }
    } finally {
      setScanning(false);
    }
  }, []);

  // On mount: check for resume text from editor, otherwise auto-load
  useEffect(() => {
    const editorText = sessionStorage.getItem('dilly_ats_resume_text');
    if (editorText) {
      sessionStorage.removeItem('dilly_ats_resume_text');
      setInitialLoading(false);
      scanWithText(editorText);
    } else {
      apiFetch('/ats/scan')
        .then((data: any) => setResult(normalizeResult(data)))
        .catch(() => {})
        .finally(() => setInitialLoading(false));
    }
  }, [scanWithText]);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const data = await apiFetch('/ats/scan');
      setResult(normalizeResult(data));
    } catch {
      // Stay on upload UI
    } finally {
      setScanning(false);
    }
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setScanning(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = getToken() || '';
      const base = typeof window !== 'undefined' ? '/api/proxy' : (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000');
      const res = await fetch(`${base}/ats/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error('Scan failed');
      const data = await res.json();
      setResult(normalizeResult(data));
    } catch {
      // Could add error handling
    } finally {
      setScanning(false);
    }
  }, []);

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

  /* ── Initial loading skeleton ──────────────────── */
  if (initialLoading) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: '36px 44px' }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: 700, color: 'var(--text-1)', marginBottom: 24 }}>
          ATS Scanner
        </h1>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[180, 120, 200].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 14 }} />)}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[60, 240, 200].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 14 }} />)}
          </div>
        </div>
      </div>
    );
  }

  /* ── Upload UI (first time / no scan) ──────────── */
  if (!result) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '36px 44px' }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            width: 520, padding: '56px 48px', borderRadius: 20,
            border: `2px dashed ${dragOver ? '#2B3A8E' : 'var(--border-main)'}`,
            background: dragOver ? 'rgba(59,76,192,0.04)' : 'var(--surface-1)',
            textAlign: 'center', transition: 'all 200ms ease',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>🔍</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
            ATS Scanner
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.5 }}>
            Drop your resume here or click to upload.<br />
            See how ATS systems parse your resume — scores, issues, keywords, and vendor compatibility.
          </p>
          <button onClick={() => fileRef.current?.click()} disabled={scanning}
            style={{
              padding: '10px 28px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: '#2B3A8E', color: '#fff', border: 'none', cursor: 'pointer',
              opacity: scanning ? 0.5 : 1, transition: 'opacity 150ms',
            }}>
            {scanning ? 'Scanning...' : 'Upload Resume'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={onFileChange} style={{ display: 'none' }} />
        </div>
      </div>
    );
  }

  const si = statusInfo(result.status);

  /* ── Results ───────────────────────────────────── */
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '36px 44px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
          ATS Scanner
        </h1>
        <button onClick={runScan} disabled={scanning} style={{
          padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: '#2B3A8E', color: '#fff', border: 'none', cursor: 'pointer',
          opacity: scanning ? 0.5 : 1,
        }}>
          {scanning ? 'Scanning...' : 'Re-scan'}
        </button>
      </div>

      {/* Company ATS Lookup */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <input
              value={companySearch}
              onChange={e => setCompanySearch(e.target.value)}
              placeholder="Which company are you applying to?"
              style={{
                width: '100%', fontSize: 13, color: 'var(--text-1)', background: 'var(--surface-1)',
                border: '1px solid var(--border-main)', borderRadius: 10, padding: '10px 14px 10px 36px',
                outline: 'none', transition: 'border-color 150ms',
              }}
              onFocus={e => e.target.style.borderColor = '#2B3A8E'}
              onBlur={e => e.target.style.borderColor = 'var(--border-main)'}
            />
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.35 }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          {companySearching && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Searching...</span>}
        </div>

        {/* Company result card */}
        {companyResult && (() => {
          const tips = VENDOR_TIPS[companyResult.vendor_key] || VENDOR_TIPS.default;
          const vendorScore = result.vendors.find(v => v.name.toLowerCase().includes(companyResult.vendor_key))?.score
            ?? result.vendors.find(v => v.name.toLowerCase() === companyResult.vendor_name.toLowerCase())?.score;
          const scoreColor = (vendorScore ?? 0) >= 80 ? '#34C759' : (vendorScore ?? 0) >= 60 ? '#FF9F0A' : '#FF453A';

          return (
            <div style={{
              marginTop: 14, borderRadius: 14, padding: '18px 22px',
              background: 'var(--surface-1)', border: '1px solid var(--border-main)',
              animation: 'fadeIn 300ms ease-out',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{companyResult.company}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 10 }}>uses</span>
                  <span style={{
                    fontSize: 13, fontWeight: 700, marginLeft: 6, padding: '3px 10px', borderRadius: 6,
                    background: tips.color + '14', color: tips.color, border: `1px solid ${tips.color}30`,
                  }}>
                    {companyResult.vendor_name}
                  </span>
                </div>
                {vendorScore != null && (
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Your score</span>
                    <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cormorant Garamond', serif", color: scoreColor, marginLeft: 8 }}>
                      {vendorScore}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: tips.color, padding: '2px 8px', borderRadius: 4, background: tips.color + '10',
                }}>
                  {tips.strictness}
                </span>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 12px' }}>{tips.summary}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tips.actions.map((action: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, color: tips.color, marginTop: 1 }}>→</span>
                    <span style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5 }}>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {companyNotFound && companySearch.trim() && !companySearching && (
          <div style={{
            marginTop: 14, borderRadius: 10, padding: '12px 16px',
            background: 'var(--surface-1)', border: '1px solid var(--border-main)',
          }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
              <strong style={{ color: 'var(--text-2)' }}>{companySearch}</strong> isn't in our database yet.
              Your general ATS scores above still apply — most companies use one of the 7 systems we test against.
            </p>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>

        {/* ── LEFT: Score + Stats ──────────────── */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Score Hero */}
          <div data-cursor-score={Math.round(result.score)} data-cursor-score-color={si.color} style={{
            borderRadius: 14, padding: '28px 24px', textAlign: 'center',
            background: 'var(--surface-1)', border: '1px solid var(--border-main)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
              ATS Score
            </div>
            <AnimNum value={result.score} style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: 64, fontWeight: 300,
              color: si.color, lineHeight: 1,
            }} />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
              <span style={{
                display: 'inline-block', padding: '3px 12px', borderRadius: 20,
                fontSize: 11, fontWeight: 600, color: si.color,
                background: `${si.color}14`, border: `1px solid ${si.color}30`,
              }}>
                {si.label}
              </span>
              {result.previous_score != null && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: result.score >= result.previous_score ? '#34C759' : '#FF453A',
                }}>
                  {result.score >= result.previous_score ? '↑' : '↓'}{Math.abs(result.score - result.previous_score)}
                </span>
              )}
            </div>
            <div style={{ marginTop: 14, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <AnimBar value={result.score} color={si.color} />
            </div>
            {result.potential_gain > 0 && (
              <p style={{ fontSize: 11, color: '#34C759', marginTop: 10, fontWeight: 500 }}>
                +{result.potential_gain} points possible
              </p>
            )}
          </div>

          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <StatCard label="Format Checks" value={`${result.format_checks.passed}/${result.format_checks.total}`}
              color={result.format_checks.passed === result.format_checks.total ? '#34C759' : '#FF9F0A'} />
            <StatCard label="Fields Parsed" value={`${result.fields_parsed.parsed}/${result.fields_parsed.total}`}
              color={result.fields_parsed.parsed >= result.fields_parsed.total - 1 ? '#34C759' : '#FF9F0A'} />
            <StatCard label="Critical Issues" value={String(result.critical_issue_count)}
              color={result.critical_issue_count === 0 ? '#34C759' : '#FF453A'} />
            <StatCard label="Sections" value={String(result.sections_detected)}
              color={result.sections_detected >= 4 ? '#34C759' : '#FF9F0A'} />
          </div>

          {/* Vendor Compatibility */}
          {result.vendors && result.vendors.length > 0 && (
            <div style={{
              borderRadius: 14, padding: '18px 20px',
              background: 'var(--surface-1)', border: '1px solid var(--border-main)',
            }}>
              <SectionHeader>Vendor Compatibility</SectionHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {result.vendors.map(v => (
                  <div key={v.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{v.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${v.score}%`, background: vendorStatusColor(v.status), transition: 'width 600ms ease' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: vendorStatusColor(v.status), minWidth: 24, textAlign: 'right' }}>{v.score}</span>
                    </div>
                  </div>
                ))}
              </div>
              {result.dilly_vendor_commentary && (
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 12, lineHeight: 1.5 }}>{result.dilly_vendor_commentary}</p>
              )}
            </div>
          )}

          {/* Parsed Contact */}
          {result.contact && (
            <div style={{
              borderRadius: 14, padding: '18px 20px',
              background: 'var(--surface-1)', border: '1px solid var(--border-main)',
            }}>
              <SectionHeader>Parsed Contact</SectionHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {Object.entries(result.contact).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-3)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--text-1)', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Tabbed Content ────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-main)', paddingBottom: 1 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? '#2B3A8E' : 'var(--text-3)',
                  borderBottom: tab === t.key ? '2px solid #2B3A8E' : '2px solid transparent',
                  background: 'none', border: 'none', borderBottomWidth: 2,
                  borderBottomStyle: 'solid', borderBottomColor: tab === t.key ? '#2B3A8E' : 'transparent',
                  cursor: 'pointer', transition: 'all 120ms ease',
                  marginBottom: -1,
                }}>
                {t.label}
                {t.key === 'issues' && result.issues.length > 0 && (
                  <span style={{
                    marginLeft: 6, fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
                    background: 'rgba(255,69,58,0.1)', color: '#FF453A',
                  }}>{result.issues.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'overview' && <OverviewTab result={result} />}
          {tab === 'issues' && <IssuesTab issues={result.issues} />}
          {tab === 'checklist' && <ChecklistTab items={result.checklist} />}
          {tab === 'keywords' && <KeywordsTab keywords={result.keywords} stats={result.keyword_stats} placement={result.keyword_placement_pct} commentary={result.dilly_keyword_commentary} />}
          {tab === 'vendors' && <VendorsTab vendors={result.vendors} commentary={result.dilly_vendor_commentary} />}
          {tab === 'fixes' && <FixesTab fixes={result.quick_fixes} />}
        </div>
      </div>
    </div>
  );
}

/* ── Tab Components ────────────────────────────────── */

function OverviewTab({ result }: { result: ATSResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {result.dilly_score_commentary && (
        <div style={{
          borderRadius: 14, padding: '18px 24px',
          background: 'rgba(59,76,192,0.04)', border: '1px solid rgba(59,76,192,0.12)',
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1.55, margin: 0 }}
            dangerouslySetInnerHTML={{ __html: result.dilly_score_commentary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
          />
        </div>
      )}

      {/* Top issues preview */}
      {result.issues.length > 0 && (
        <Card>
          <SectionHeader>Top Issues</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {result.issues.slice(0, 5).map(issue => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        </Card>
      )}

      {/* Experience parsed */}
      {result.experience && result.experience.length > 0 && (
        <Card>
          <SectionHeader>Parsed Experience</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {result.experience.map((exp, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{exp.role}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{exp.company}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>{exp.start} — {exp.end || 'Present'}</p>
                  {exp.bullet_count != null && (
                    <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>{exp.bullet_count} bullet{exp.bullet_count !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function IssuesTab({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <EmptyState text="No issues found — your resume is ATS-clean." />;
  const sorted = [...issues].sort((a, b) => (b.potential_pts || 0) - (a.potential_pts || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sorted.map(issue => (
        <Card key={issue.id}>
          <IssueRow issue={issue} expanded />
        </Card>
      ))}
    </div>
  );
}

function ChecklistTab({ items }: { items: ChecklistItem[] }) {
  if (!items.length) return <EmptyState text="No checklist items available." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px',
          borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--border-main)',
        }}>
          <span style={{ fontSize: 16, marginTop: 1 }}>{item.passed ? '✅' : '❌'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{item.label}</span>
              <span style={{
                fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
                color: impactColor(item.impact), background: `${impactColor(item.impact)}14`,
              }}>{item.impact}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0', lineHeight: 1.4 }}>{item.description}</p>
            {!item.passed && item.dilly_fix && (
              <p style={{ fontSize: 11, color: '#2B3A8E', margin: '6px 0 0', lineHeight: 1.4 }}>
                💡 {item.dilly_fix}
              </p>
            )}
          </div>
          {!item.passed && item.potential_pts != null && item.potential_pts > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#34C759', whiteSpace: 'nowrap' }}>+{item.potential_pts}pts</span>
          )}
        </div>
      ))}
    </div>
  );
}

function KeywordsTab({ keywords, stats, placement, commentary }: {
  keywords: Keyword[]; stats?: { total: number; in_context: number; bare_list: number };
  placement?: number; commentary?: string;
}) {
  if (!keywords.length) return <EmptyState text="No keywords extracted." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: 12 }}>
          <MiniStat label="Total" value={stats.total} />
          <MiniStat label="In Context" value={stats.in_context} color="#34C759" />
          <MiniStat label="Bare List" value={stats.bare_list} color="#FF9F0A" />
          {placement != null && <MiniStat label="Placement" value={`${placement}%`} color="#2B3A8E" />}
        </div>
      )}

      {commentary && (
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{commentary}</p>
      )}

      {/* Keywords table */}
      <Card>
        <div style={{ fontSize: 11, display: 'grid', gridTemplateColumns: '1fr 60px 70px 60px', gap: '8px 0' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Keyword</span>
          <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Count</span>
          <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>In Context</span>
          <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Bare</span>
          {keywords.map(k => (
            <>
              <span key={k.keyword} style={{ color: 'var(--text-1)', fontWeight: 500 }}>{k.keyword}</span>
              <span style={{ textAlign: 'center', color: 'var(--text-2)' }}>{k.count}</span>
              <span style={{ textAlign: 'center', color: k.in_context > 0 ? '#34C759' : 'var(--text-3)' }}>{k.in_context}</span>
              <span style={{ textAlign: 'center', color: k.bare_list > 0 ? '#FF9F0A' : 'var(--text-3)' }}>{k.bare_list}</span>
            </>
          ))}
        </div>
      </Card>
    </div>
  );
}

function VendorsTab({ vendors, commentary }: { vendors: Vendor[]; commentary?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {commentary && (
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{commentary}</p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {vendors.map(v => (
          <Card key={v.name} score={v.score} scoreColor={vendorStatusColor(v.status)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{v.name}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 10,
                color: vendorStatusColor(v.status),
                background: `${vendorStatusColor(v.status)}14`,
              }}>
                {v.status === 'will_parse' ? 'Will Parse' : v.status === 'risky' ? 'Risky' : 'Fail'}
              </span>
            </div>
            <AnimNum value={v.score} style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 300,
              color: vendorStatusColor(v.status), lineHeight: 1,
            }} />
            <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <AnimBar value={v.score} color={vendorStatusColor(v.status)} />
            </div>
            {v.companies.length > 0 && (
              <p style={{ fontSize: 10, color: '#34C759', marginTop: 8 }}>
                ✓ {v.companies.slice(0, 3).join(' · ')}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function FixesTab({ fixes }: { fixes: QuickFix[] }) {
  if (!fixes.length) return <EmptyState text="No quick fixes needed." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fixes.map(fix => (
        <div key={fix.id} style={{ borderRadius: 10, border: '1px solid var(--border-main)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{fix.reason}</span>
            <CopyButton text={fix.rewritten} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ padding: '10px 14px', background: 'rgba(255,69,58,0.04)', borderTop: '1px solid var(--border-main)', borderRight: '1px solid var(--border-main)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FF453A', marginBottom: 4, margin: 0 }}>Before</p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{fix.original}</p>
            </div>
            <div style={{ padding: '10px 14px', background: 'rgba(52,199,89,0.04)', borderTop: '1px solid var(--border-main)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#34C759', marginBottom: 4, margin: 0 }}>After</p>
              <p style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5, margin: 0 }}>{fix.rewritten}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Shared Components ─────────────────────────────── */

function Card({ children, score, scoreColor: sc }: { children: React.ReactNode; score?: number; scoreColor?: string }) {
  return (
    <div
      {...(score != null ? { 'data-cursor-score': Math.round(score), 'data-cursor-score-color': sc || '#2B3A8E' } : {})}
      style={{ borderRadius: 14, padding: '18px 20px', background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--text-3)', margin: 0,
    }}>{children}</h3>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      borderRadius: 12, padding: '14px 16px', textAlign: 'center',
      background: 'var(--surface-1)', border: '1px solid var(--border-main)',
    }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{
      flex: 1, borderRadius: 10, padding: '10px 12px', textAlign: 'center',
      background: 'var(--surface-1)', border: '1px solid var(--border-main)',
    }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: color || 'var(--text-1)' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function IssueRow({ issue, expanded }: { issue: Issue; expanded?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%', marginTop: 5, flexShrink: 0,
        background: severityColor(issue.severity),
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{issue.title}</span>
          {issue.potential_pts != null && issue.potential_pts > 0 && (
            <span style={{ fontSize: 9, fontWeight: 600, color: '#34C759' }}>+{issue.potential_pts}pts</span>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '3px 0 0', lineHeight: 1.4 }}>{issue.detail}</p>
        {expanded && issue.quote && (
          <div style={{
            marginTop: 6, padding: '8px 12px', borderRadius: 6,
            borderLeft: '3px solid var(--border-main)',
            background: 'var(--surface-2)', fontSize: 11, color: 'var(--text-3)',
            fontStyle: 'italic',
          }}>
            &ldquo;{issue.quote}&rdquo;
          </div>
        )}
        {expanded && issue.dilly_action && (
          <p style={{ fontSize: 11, color: '#2B3A8E', margin: '6px 0 0' }}>💡 {issue.dilly_action}</p>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>✓</div>
      <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{text}</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      window.dispatchEvent(new Event('dilly-copy-flash'));
    }}
      style={{ fontSize: 10, color: copied ? '#34C759' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function AnimNum({ value, style }: { value: number; style: React.CSSProperties }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const target = Math.round(value);
    const start = performance.now();
    const duration = 700;
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(target * ease));
      if (t < 1) ref.current = requestAnimationFrame(tick);
    }
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value]);
  return <div style={style}>{display}</div>;
}

function AnimBar({ value, color }: { value: number; color: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(Math.min(value, 100)), 50); return () => clearTimeout(t); }, [value]);
  return <div style={{ height: '100%', borderRadius: 3, background: color, width: `${width}%`, transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)' }} />;
}

/* ── Normalize API response ────────────────────────── */
function normalizeResult(data: any): ATSResult {
  const score = data.overall_score ?? data.score ?? data.ats_score ?? 0;

  // Vendors: API returns dict { greenhouse: { system, score, issues, passed }, ... }
  const vendorsRaw = data.vendors ?? {};
  const vendorList: Vendor[] = Object.entries(vendorsRaw).map(([key, v]: [string, any]) => ({
    name: v.system || key,
    score: v.score ?? 0,
    status: v.score >= 80 ? 'will_parse' as const : v.score >= 60 ? 'risky' as const : 'fail' as const,
    companies: v.passed ?? [], // show what passed for this vendor as "companies" (reused for display)
  })).sort((a, b) => b.score - a.score);

  // Issues: API returns [{ severity, message, systems_affected }]
  const rawIssues = data.all_issues ?? data.issues ?? [];
  const issues: Issue[] = rawIssues.map((i: any, idx: number) => ({
    id: `issue-${idx}`,
    severity: i.severity ?? 'info',
    title: i.message ?? '',
    detail: i.systems_affected?.length ? `Affects: ${i.systems_affected.join(', ')}` : '',
    potential_pts: i.severity === 'critical' ? 15 : i.severity === 'high' ? 8 : i.severity === 'medium' ? 4 : 1,
  }));

  // Parsed fields
  const pf = data.parsed_fields ?? {};

  // Build checklist from parsed fields
  const checklist: ChecklistItem[] = [];
  const addCheck = (id: string, label: string, desc: string, passed: boolean, impact: 'critical' | 'high' | 'medium' | 'low', fix?: string) => {
    checklist.push({ id, label, description: desc, passed, impact, dilly_fix: fix });
  };
  addCheck('email', 'Email address', pf.email ? `Found: ${pf.email}` : 'No email detected', !!pf.email, 'critical',
    !pf.email ? 'Add your email in the first few lines of your resume — every ATS requires it.' : undefined);
  addCheck('phone', 'Phone number', pf.phone ? `Found: ${pf.phone}` : 'No phone number detected', !!pf.phone, 'medium',
    !pf.phone ? 'Add a phone number — some systems flag applications without one.' : undefined);
  addCheck('education', 'Education section', pf.education ? 'Education section found' : 'No Education header detected', !!pf.education, 'high',
    !pf.education ? 'Add a section titled "Education" — ATS systems need this exact header.' : undefined);
  addCheck('experience', 'Experience entries', (pf.experience_count ?? 0) > 0 ? `${pf.experience_count} experience entries found` : 'No experience entries detected', (pf.experience_count ?? 0) > 0, 'high',
    (pf.experience_count ?? 0) === 0 ? 'Add an "Experience" section with entries that include dates in "Month YYYY" format.' : undefined);
  addCheck('skills', 'Skills section', (pf.skills_count ?? 0) > 0 ? `${pf.skills_count} skills found` : 'No skills section detected', (pf.skills_count ?? 0) > 0, 'medium',
    (pf.skills_count ?? 0) === 0 ? 'Add a "Skills" section listing tools and technologies — iCIMS and Workday use this for keyword matching.' : undefined);
  addCheck('projects', 'Projects section', pf.has_projects ? 'Projects section found' : 'No Projects section detected', !!pf.has_projects, 'low');

  const passedChecks = checklist.filter(c => c.passed).length;
  const criticalCount = issues.filter(i => i.severity === 'critical').length;

  // Sections detected
  const sectionCount = [pf.education, (pf.experience_count ?? 0) > 0, (pf.skills_count ?? 0) > 0, pf.has_projects].filter(Boolean).length;

  // Fields parsed — count all 7 extractable fields
  const fieldsParsed = [
    pf.name, pf.email, pf.phone, pf.education,
    (pf.experience_count ?? 0) > 0, (pf.skills_count ?? 0) > 0, pf.has_projects,
  ].filter(Boolean).length;

  // Contact
  const contact: Contact = {
    name: pf.name ?? undefined,
    email: pf.email ?? undefined,
    phone: pf.phone ?? undefined,
  };

  return {
    score,
    previous_score: null,
    status: score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'risky' : 'at_risk',
    format_checks: { passed: passedChecks, total: checklist.length },
    fields_parsed: { parsed: fieldsParsed, total: 7 },
    sections_detected: sectionCount,
    critical_issue_count: criticalCount,
    potential_gain: issues.reduce((s, i) => s + (i.potential_pts || 0), 0),
    score_history: [],
    contact,
    experience: [],
    checklist,
    issues,
    quick_fixes: [],
    keywords: [],
    keyword_stats: null,
    keyword_placement_pct: null,
    vendors: vendorList,
    dilly_score_commentary: null,
    dilly_keyword_commentary: null,
    dilly_vendor_commentary: null,
  };
}
