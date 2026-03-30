'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  APPROVED_MAJORS, PRE_PROF_OPTIONS, TARGET_OPTIONS, INTERESTS_LIST,
  INDUSTRY_TARGET_OPTIONS_QUANT, INDUSTRY_TARGET_OPTIONS_DATA, COHORT_COPY,
  detectCohort, needsIndustryTarget,
} from '@/lib/onboardingConstants';
import { setToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
const BLUE = '#2B3A8E';
const GOLD = '#2B3A8E';
const BG = '#f8f7f4';

type StepId =
  | 'welcome' | 'verify' | 'profile' | 'interests' | 'industry'
  | 'youarein' | 'anticipation' | 'upload' | 'scanning' | 'results';

const COHORT_COLORS: Record<string, string> = {
  Tech: '#2B3A8E', Business: '#2B3A8E', Science: '#16a34a', Quantitative: '#7c3aed',
  Health: '#0284c7', 'Social Science': '#d97706', Humanities: '#db2777',
  Sport: '#ea580c', 'Pre-Health': '#0284c7', 'Pre-Law': '#7c3aed', General: '#2B3A8E',
};

/* ── Skeleton atom ── */
function Sk({ w, h = 14, r = 6 }: { w: number | string; h?: number; r?: number }) {
  return <div className="ob-skeleton" style={{ width: w, height: h, borderRadius: r }} />;
}

/* ── Profile Preview Card (left panel) ── */
interface ProfileState {
  name: string; email: string; major: string | null; cohort: string | null;
  cohortLabel: string | null; interests: string[]; photo: string | null;
  resumeFile: File | null; target: string | null;
}

function ProfilePreviewCard({ ps }: { ps: ProfileState }) {
  const hasName = ps.name.trim().length > 0;
  const hasMajor = !!ps.major;
  const hasCohort = !!ps.cohort;
  const cohortColor = ps.cohort ? (COHORT_COLORS[ps.cohort] ?? BLUE) : BLUE;
  const initials = hasName
    ? ps.name.trim().split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '';
  const targetLabel = TARGET_OPTIONS.find(t => t.key === ps.target)?.label ?? null;

  return (
    <div style={{ background: 'white', borderRadius: 24, padding: '32px 28px', boxShadow: '0 2px 20px rgba(0,0,0,0.07)', width: '100%', maxWidth: 320 }}>
      {/* Avatar + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', position: 'relative', background: ps.photo ? 'transparent' : hasName ? BLUE : undefined }}>
          {!ps.photo && !hasName && <div className="ob-skeleton" style={{ width: 60, height: 60, borderRadius: '50%' }} />}
          {!ps.photo && hasName && (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="ob-write-in" style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>{initials}</span>
            </div>
          )}
          {ps.photo && <img src={ps.photo} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} className="ob-photo-reveal" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasName
            ? <p className="ob-write-in" style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ps.name}</p>
            : <Sk w="72%" h={15} r={6} />}
          <div style={{ marginTop: hasName ? 0 : 8 }}>
            {ps.email
              ? <p style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ps.email}</p>
              : <Sk w="88%" h={11} />}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: '#f0eeea', marginBottom: 22 }} />

      {/* Major */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Major</p>
        {hasMajor
          ? <span className="ob-write-in" style={{ fontSize: 12, fontWeight: 600, color: '#111', background: '#f5f4f0', padding: '4px 10px', borderRadius: 6, display: 'inline-block' }}>{ps.major}</span>
          : <Sk w="62%" h={26} r={6} />}
      </div>

      {/* Cohort */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Cohort</p>
        {hasCohort
          ? <span className="ob-write-in" style={{ fontSize: 11, fontWeight: 700, color: cohortColor, background: `${cohortColor}14`, padding: '5px 12px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${cohortColor}30` }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: cohortColor, flexShrink: 0 }} />
              {ps.cohortLabel ?? ps.cohort}
            </span>
          : <Sk w="52%" h={26} r={20} />}
      </div>

      {/* Interests */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Interests</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {ps.interests.length > 0
            ? ps.interests.slice(0, 5).map((item, i) => (
                <span key={item} className="ob-write-in" style={{ fontSize: 10, fontWeight: 500, color: BLUE, background: 'rgba(59,76,192,0.08)', padding: '3px 8px', borderRadius: 10, border: '1px solid rgba(59,76,192,0.2)', animationDelay: `${i * 60}ms` }}>
                  {item.split(' & ')[0].split(' ')[0]}
                </span>
              ))
            : <><Sk w={56} h={22} r={10} /><Sk w={64} h={22} r={10} /><Sk w={48} h={22} r={10} /></>}
          {ps.interests.length > 5 && <span style={{ fontSize: 10, color: '#9ca3af', padding: '3px 4px' }}>+{ps.interests.length - 5}</span>}
        </div>
      </div>

      {/* Goal */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Goal</p>
        {targetLabel
          ? <span className="ob-write-in" style={{ fontSize: 11, fontWeight: 500, color: '#555' }}>{targetLabel}</span>
          : <Sk w="55%" h={14} />}
      </div>

      {/* Resume */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Resume</p>
        {ps.resumeFile
          ? <div className="ob-write-in" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              {ps.resumeFile.name}
            </div>
          : <Sk w="65%" h={16} />}
      </div>
    </div>
  );
}

/* ── Cohort Reveal Full-Screen Overlay ── */
function CohortReveal({ cohort, cohortInfo, name, onContinue }: {
  cohort: string; cohortInfo: { label: string; description: string; emphasis: string };
  name: string; onContinue: () => void;
}) {
  const color = COHORT_COLORS[cohort] ?? BLUE;
  const firstName = name.split(' ')[0] || 'you';
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 100); return () => clearTimeout(t); }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0f0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Ambient glow */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${color}22 0%, transparent 70%)`, pointerEvents: 'none' }} />
      {/* Floating particles */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="ob-particle" style={{ '--px': `${Math.random() * 100}%`, '--py': `${Math.random() * 100}%`, '--pd': `${1.5 + Math.random() * 3}s`, '--ps': `${Math.random() * 3}s`, '--pc': color } as React.CSSProperties} />
      ))}

      <div style={{ textAlign: 'center', padding: '0 40px', maxWidth: 580, position: 'relative', zIndex: 1 }}>
        <p className={ready ? 'ob-reveal-fade' : 'ob-hidden'} style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 16, animationDelay: '0.1s' }}>
          {firstName}, you&apos;re in the
        </p>

        <h1 className={ready ? 'ob-reveal-scale' : 'ob-hidden'} style={{
          fontFamily: 'Cinzel, serif', fontSize: 'clamp(40px, 6vw, 68px)', fontWeight: 900,
          color: color, margin: '0 0 8px', lineHeight: 1.1,
          textShadow: `0 0 80px ${color}70, 0 0 120px ${color}30`,
          animationDelay: '0.3s',
        }}>
          {cohortInfo.label}
        </h1>

        {/* Pulse ring under the title */}
        <div style={{ position: 'relative', height: 2, margin: '20px auto', maxWidth: 200 }}>
          <div className={ready ? 'ob-reveal-fade' : 'ob-hidden'} style={{ height: 2, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, animationDelay: '0.5s' }} />
        </div>

        <p className={ready ? 'ob-reveal-fade' : 'ob-hidden'} style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.75, margin: '0 0 10px', animationDelay: '0.65s' }}>
          {cohortInfo.description}
        </p>
        <p className={ready ? 'ob-reveal-fade' : 'ob-hidden'} style={{ fontSize: 13, color: '#4b5563', fontStyle: 'italic', marginBottom: 48, animationDelay: '0.85s' }}>
          {cohortInfo.emphasis}
        </p>

        <button
          className={ready ? 'ob-reveal-fade' : 'ob-hidden'}
          onClick={onContinue}
          style={{ padding: '14px 44px', borderRadius: 14, fontSize: 15, fontWeight: 700, background: color, color: 'white', border: 'none', cursor: 'pointer', boxShadow: `0 8px 32px ${color}55`, animationDelay: '1.1s', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}
          onMouseEnter={e => { (e.target as HTMLElement).style.transform = 'translateY(-2px)'; (e.target as HTMLElement).style.boxShadow = `0 12px 40px ${color}70`; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.transform = 'translateY(0)'; (e.target as HTMLElement).style.boxShadow = `0 8px 32px ${color}55`; }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

/* ── Step layout wrapper (right panel) ── */
function StepShell({ tag, headline, sub, children }: { tag?: string; headline: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
      {tag && <p style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>{tag}</p>}
      <h1 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 800, color: '#111', margin: '0 0 10px', lineHeight: 1.2, letterSpacing: '-0.02em' }}>{headline}</h1>
      {sub && <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 36px', lineHeight: 1.65 }}>{sub}</p>}
      <div>{children}</div>
    </div>
  );
}

/* ── Input / Dropdown helpers ── */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 16px', fontSize: 15, borderRadius: 10,
  border: '1.5px solid #e5e5e5', background: 'white', color: '#111',
  outline: 'none', transition: 'border-color 0.15s ease', boxSizing: 'border-box',
};
const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
  border: '1.5px solid #e5e5e5', borderRadius: 10, marginTop: 4, zIndex: 20, overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
};
const dropdownItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px',
  fontSize: 14, color: '#111', background: 'transparent', border: 'none',
  borderBottom: '1px solid #f5f5f5', cursor: 'pointer',
};

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s ease', background: selected ? 'rgba(59,76,192,0.08)' : 'white', borderColor: selected ? BLUE : '#e5e5e5', color: selected ? BLUE : '#6b7280' }}>
      {label}
    </button>
  );
}

function ctaBtn(disabled: boolean): React.CSSProperties {
  return { padding: '12px 36px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: disabled ? '#e5e5e5' : BLUE, color: disabled ? '#aaa' : 'white', cursor: disabled ? 'default' : 'pointer', transition: 'all 0.2s ease' };
}

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════ */
export default function OnboardingPage() {
  const router = useRouter();

  const allSteps: StepId[] = useMemo(() => [
    'welcome', 'verify', 'profile', 'interests', 'industry',
    'youarein', 'anticipation', 'upload', 'scanning', 'results',
  ], []);
  const [stepIdx, setStepIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const currentStep = allSteps[stepIdx];

  // Redirect if already logged in
  useEffect(() => {
    const existing = typeof window !== 'undefined' ? localStorage.getItem('dilly_token') : null;
    if (!existing) return;
    fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${existing}` } })
      .then(r => { if (r.ok) router.replace('/home'); })
      .catch(() => {});
  }, [router]);

  /* ── State ── */
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setTokenState] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [majors, setMajors] = useState<string[]>([]);
  const [majorQuery, setMajorQuery] = useState('');
  const [minors, setMinors] = useState<string[]>([]);
  const [minorQuery, setMinorQuery] = useState('');
  const [preProf, setPreProf] = useState<string | null>(null);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [industryTarget, setIndustryTarget] = useState<string | null>(null);

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [scanStep, setScanStep] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  const [scanError, setScanError] = useState('');

  const [auditResult, setAuditResult] = useState<{ final_score: number; scores: { smart: number; grit: number; build: number } } | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [saving, setSaving] = useState(false);

  /* ── Derived ── */
  const cohort = detectCohort(majors, preProf);
  const cohortInfo = COHORT_COPY[cohort] ?? COHORT_COPY.General;
  const showIndustry = needsIndustryTarget(cohort, majors);

  const majorSuggestions = useMemo(() => {
    if (!majorQuery.trim()) return [];
    const q = majorQuery.toLowerCase();
    return APPROVED_MAJORS.filter(m => m.toLowerCase().includes(q) && !majors.includes(m)).slice(0, 5);
  }, [majorQuery, majors]);

  const minorSuggestions = useMemo(() => {
    if (!minorQuery.trim()) return [];
    const q = minorQuery.toLowerCase();
    return APPROVED_MAJORS.filter(m => m.toLowerCase().includes(q) && !minors.includes(m)).slice(0, 5);
  }, [minorQuery, minors]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (currentStep !== 'results' || !auditResult) return;
    const target = auditResult.final_score;
    let frame = 0;
    const interval = setInterval(() => { frame++; setAnimatedScore(Math.round((frame / 50) * target)); if (frame >= 50) clearInterval(interval); }, 25);
    return () => clearInterval(interval);
  }, [currentStep, auditResult]);

  /* ── Navigation ── */
  function goNext() {
    setDirection(1);
    let next = stepIdx + 1;
    if (allSteps[next] === 'industry' && !showIndustry) next++;
    setStepIdx(next);
  }
  function goPrev() {
    setDirection(-1);
    let prev = stepIdx - 1;
    if (allSteps[prev] === 'industry' && !showIndustry) prev--;
    if (prev >= 0) setStepIdx(prev);
  }

  const visibleSteps = allSteps.filter(s => s !== 'industry' || showIndustry);
  const visibleIdx = visibleSteps.indexOf(currentStep);

  const authHeaders = useCallback(() => {
    const t = token || (typeof window !== 'undefined' ? localStorage.getItem('dilly_token') : null);
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  }, [token]);

  /* ── API Actions ── */
  const [sendError, setSendError] = useState('');

  async function sendVerificationCode() {
    setSendingCode(true); setSendError('');
    try {
      const res = await fetch(`${API_BASE}/auth/send-verification-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data?.detail || 'Something went wrong. Please try again.');
        return;
      }
      if (data?.dev_code) { setDevCode(data.dev_code); setCode(data.dev_code); }
      setResendCooldown(30);
      goNext();
    } catch {
      setSendError('Could not reach Dilly. Check your connection and try again.');
    }
    finally { setSendingCode(false); }
  }

  async function verifyCode() {
    setVerifying(true); setCodeError('');
    try {
      const res = await fetch(`${API_BASE}/auth/verify-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) });
      if (!res.ok) { setCodeError('Invalid code. Please try again.'); setVerifying(false); return; }
      const data = await res.json();
      if (data?.token) { setToken(data.token); setTokenState(data.token); }
      try {
        const profileRes = await fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${data.token}` } });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (profile?.onboarding_complete) { router.replace('/home'); return; }
        }
      } catch { /* continue */ }
      goNext();
    } catch { setCodeError('Something went wrong.'); }
    finally { setVerifying(false); }
  }

  async function resendCode() {
    if (resendCooldown > 0) return;
    setResendCooldown(30);
    fetch(`${API_BASE}/auth/send-verification-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => {});
  }

  async function saveProfile() {
    setSaving(true);
    const target = TARGET_OPTIONS.find(t => t.key === targetKey);
    try {
      await fetch(`${API_BASE}/profile`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ name: fullName, majors, minors, pre_professional: preProf && preProf !== 'None / Not applicable' ? preProf : null, application_target: target?.apiValue ?? 'exploring', goals: interests }) });
    } catch { /* continue */ }
    finally { setSaving(false); }
    goNext();
  }

  async function saveIndustryTarget() {
    setSaving(true);
    try { await fetch(`${API_BASE}/profile`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ industry_target: industryTarget ?? 'not_sure' }) }); }
    catch { /* continue */ }
    finally { setSaving(false); }
    goNext();
  }

  async function runFirstAudit() {
    setScanStep(0); setScanDone(false); setScanError('');
    [1200, 2400, 3600, 4800].forEach((ms, i) => setTimeout(() => setScanStep(i + 1), ms));
    try {
      const t = token || localStorage.getItem('dilly_token');
      const fd = new FormData();
      if (resumeFile) fd.append('file', resumeFile);
      fd.append('name', fullName);
      fd.append('majors', JSON.stringify(majors));
      fd.append('track', cohort);
      fd.append('application_target', TARGET_OPTIONS.find(o => o.key === targetKey)?.apiValue ?? 'exploring');
      const res = await fetch(`${API_BASE}/audit/first-run`, { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAuditResult({ final_score: data.final_score ?? 0, scores: data.scores ?? { smart: 0, grit: 0, build: 0 } });
    } catch { setScanError('Something went wrong. You can retry from the dashboard.'); }
    await new Promise(r => setTimeout(r, 6000));
    setScanDone(true);
    setTimeout(() => goNext(), 600);
  }

  async function finishOnboarding() {
    setSaving(true);
    try {
      const t = token || localStorage.getItem('dilly_token');
      await fetch(`${API_BASE}/profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ onboarding_complete: true }) });
    } catch { /* proceed */ }
    router.replace('/home');
  }

  function handlePhotoFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => { if (e.target?.result) setPhoto(e.target.result as string); };
    reader.readAsDataURL(file);
  }

  /* ── Can continue ── */
  const canContinue: Record<StepId, boolean> = {
    welcome: email.includes('.edu') && !sendingCode,
    verify: code.length === 6 && !verifying,
    profile: fullName.trim().length > 0 && majors.length > 0 && targetKey !== null,
    interests: true, industry: industryTarget !== null,
    youarein: true, anticipation: true, upload: true, scanning: false, results: true,
  };

  const showBack = stepIdx > 0 && currentStep !== 'scanning' && currentStep !== 'results' && currentStep !== 'youarein';
  const showFooter = currentStep !== 'scanning' && currentStep !== 'youarein';
  const isFullScreen = currentStep === 'youarein';
  const showPanel = currentStep !== 'welcome' && currentStep !== 'verify' && currentStep !== 'youarein';

  /* ── Profile state for card ── */
  const profileState: ProfileState = {
    name: fullName, email, major: majors[0] ?? null, cohort: majors.length > 0 ? cohort : null,
    cohortLabel: majors.length > 0 ? cohortInfo.label : null,
    interests, photo, resumeFile, target: targetKey,
  };

  /* ── Step content ── */
  function renderStep() {
    switch (currentStep) {
      case 'welcome': return (
        <StepShell tag="Welcome" headline="Your career center starts here." sub="Enter your .edu email and we'll send you a verification code.">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@school.edu" autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && canContinue.welcome) sendVerificationCode(); }}
            style={{ ...inputStyle, fontSize: 16, borderColor: email && !email.includes('.edu') ? '#ef4444' : '#e5e5e5' }}
          />
          {email && !email.includes('.edu') && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>Please use a .edu email address</p>}
          {sendError && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 10, background: '#fff5f5', padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca' }}>{sendError}</p>}
        </StepShell>
      );

      case 'verify': return (
        <StepShell headline="Check your inbox." sub={<>We sent a 6-digit code to <strong style={{ color: '#111' }}>{email}</strong>. Check spam if you don&apos;t see it.</>}>
          <input
            type="text" inputMode="numeric" maxLength={6} value={code} autoFocus
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setCodeError(''); }}
            onKeyDown={e => { if (e.key === 'Enter' && canContinue.verify) verifyCode(); }}
            placeholder="000000"
            style={{ ...inputStyle, fontSize: 28, fontFamily: 'monospace', letterSpacing: '0.25em', textAlign: 'center', borderColor: codeError ? '#ef4444' : '#e5e5e5' }}
          />
          {codeError && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 10 }}>{codeError}</p>}
          {devCode && (
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10, background: '#f5f4f0', padding: '8px 12px', borderRadius: 8 }}>
              Dev mode — code pre-filled: <strong style={{ fontFamily: 'monospace', color: '#6b7280' }}>{devCode}</strong>
            </p>
          )}
          <button onClick={resendCode} disabled={resendCooldown > 0} style={{ marginTop: 16, fontSize: 13, color: resendCooldown > 0 ? '#aaa' : BLUE, background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'default' : 'pointer', fontWeight: 500 }}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </button>
        </StepShell>
      );

      case 'profile': return (
        <StepShell tag="Your profile" headline="Tell us about you." sub="This is how Dilly knows which cohort you're in.">
          {/* Photo upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div
              onClick={() => photoRef.current?.click()}
              style={{ width: 64, height: 64, borderRadius: '50%', background: photo ? 'transparent' : '#f0eeea', border: `2px dashed ${photo ? 'transparent' : '#d1d5db'}`, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 0.2s' }}
            >
              {photo
                ? <img src={photo} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>Photo <span style={{ fontWeight: 400, color: '#9ca3af' }}>— optional</span></p>
              <button onClick={() => photoRef.current?.click()} style={{ fontSize: 12, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                {photo ? 'Change photo' : 'Upload a photo'}
              </button>
            </div>
            <input type="file" ref={photoRef} accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); }} style={{ display: 'none' }} />
          </div>

          <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Full name</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" style={{ ...inputStyle, marginTop: 6, marginBottom: 20 }} />

          <label style={{ fontSize: 11, fontWeight: 700, color: BLUE, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Major(s)</label>
          <div style={{ position: 'relative', marginTop: 6, marginBottom: majors.length > 0 ? 8 : 20 }}>
            <input type="text" value={majorQuery} onChange={e => setMajorQuery(e.target.value)} placeholder="Search majors..." style={inputStyle} />
            {majorSuggestions.length > 0 && (
              <div style={dropdownStyle}>
                {majorSuggestions.map(m => <button key={m} onClick={() => { setMajors(p => [...p, m]); setMajorQuery(''); }} style={dropdownItemStyle}>{m}</button>)}
              </div>
            )}
          </div>
          {majors.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {majors.map(m => (
                <span key={m} onClick={() => setMajors(majors.filter(x => x !== m))} style={{ fontSize: 12, fontWeight: 600, color: BLUE, background: 'rgba(59,76,192,0.08)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(59,76,192,0.2)' }}>
                  {m} ×
                </span>
              ))}
            </div>
          )}

          <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pre-professional track</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, marginBottom: 20 }}>
            {PRE_PROF_OPTIONS.map(p => <Pill key={p} label={p} selected={preProf === p} onClick={() => setPreProf(preProf === p ? null : p)} />)}
          </div>

          <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Minor(s) <span style={{ fontWeight: 400, opacity: 0.5 }}>optional</span></label>
          <div style={{ position: 'relative', marginTop: 6, marginBottom: minors.length > 0 ? 8 : 20 }}>
            <input type="text" value={minorQuery} onChange={e => setMinorQuery(e.target.value)} placeholder="Search minors..." style={inputStyle} />
            {minorSuggestions.length > 0 && (
              <div style={dropdownStyle}>
                {minorSuggestions.map(m => <button key={m} onClick={() => { setMinors(p => [...p, m]); setMinorQuery(''); }} style={dropdownItemStyle}>{m}</button>)}
              </div>
            )}
          </div>
          {minors.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {minors.map(m => (
                <span key={m} onClick={() => setMinors(minors.filter(x => x !== m))} style={{ fontSize: 12, fontWeight: 600, color: GOLD, background: `${GOLD}14`, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${GOLD}30` }}>
                  {m} ×
                </span>
              ))}
            </div>
          )}

          <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>What are you looking for?</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {TARGET_OPTIONS.map(t => <Pill key={t.key} label={t.label} selected={targetKey === t.key} onClick={() => setTargetKey(targetKey === t.key ? null : t.key)} />)}
          </div>
        </StepShell>
      );

      case 'interests': return (
        <StepShell tag="Interests" headline="What are you into?" sub="Each interest unlocks a new cohort you'll be scored in. Pick as many as you want.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {INTERESTS_LIST.map(interest => (
              <Pill key={interest} label={interest} selected={interests.includes(interest)}
                onClick={() => setInterests(prev => prev.includes(interest) ? prev.filter(x => x !== interest) : [...prev, interest])} />
            ))}
          </div>
          {interests.length > 0 && (
            <p style={{ fontSize: 13, color: BLUE, marginTop: 16, fontWeight: 500 }}>{interests.length} cohort{interests.length !== 1 ? 's' : ''} unlocked</p>
          )}
        </StepShell>
      );

      case 'industry': {
        const isDS = majors.includes('Data Science');
        const options = isDS ? INDUSTRY_TARGET_OPTIONS_DATA : INDUSTRY_TARGET_OPTIONS_QUANT;
        return (
          <StepShell tag="Target" headline={isDS ? 'Where do you want to apply Data Science?' : 'Pick your target industry.'} sub="This helps Dilly weigh your scores toward the right employers.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {options.map(o => (
                <button key={o.key} onClick={() => setIndustryTarget(o.key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s ease', background: industryTarget === o.key ? 'rgba(59,76,192,0.06)' : 'white', borderColor: industryTarget === o.key ? BLUE : '#e5e5e5', color: industryTarget === o.key ? BLUE : '#374151' }}>
                  {o.label}
                  {industryTarget === o.key && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
              ))}
            </div>
          </StepShell>
        );
      }

      case 'youarein': return null; // handled by overlay below

      case 'anticipation': return (
        <StepShell tag="Almost there" headline="Here's what happens next." sub="Upload your resume and Dilly will score it in under 15 seconds.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
            {[
              { num: '1', text: 'We parse every bullet, skill, and date on your resume' },
              { num: '2', text: 'We score you on Smart, Grit, and Build dimensions' },
              { num: '3', text: 'We show exactly where you stand vs. your peers' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 30, height: 30, borderRadius: 15, background: 'rgba(59,76,192,0.08)', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{item.num}</div>
                <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.55, margin: '4px 0 0' }}>{item.text}</p>
              </div>
            ))}
          </div>
          <div style={{ padding: '16px 20px', borderRadius: 12, background: 'white', border: '1.5px solid #e5e5e5' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>The recruiter funnel</p>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              {['ATS', 'Recruiter (7s)', 'Hiring Mgr', 'Interview'].map((stage, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 6, background: i === 0 ? 'rgba(59,76,192,0.08)' : '#f5f5f5', color: i === 0 ? BLUE : '#9ca3af' }}>{stage}</span>
                  {i < 3 && <span style={{ color: '#d1d5db', fontSize: 10 }}>→</span>}
                </div>
              ))}
            </div>
          </div>
        </StepShell>
      );

      case 'upload': return (
        <StepShell tag="Resume" headline="Upload your resume." sub="PDF or DOCX, max 10 MB. This is how Dilly scores you.">
          <input type="file" ref={fileRef} accept=".pdf,.doc,.docx" onChange={e => { const f = e.target.files?.[0]; if (f && f.size <= 10 * 1024 * 1024) setResumeFile(f); }} style={{ display: 'none' }} />
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f && f.size <= 10 * 1024 * 1024) setResumeFile(f); }}
            style={{ padding: '48px 32px', borderRadius: 16, background: dragOver ? 'rgba(59,76,192,0.04)' : 'white', border: `2px dashed ${dragOver ? BLUE : resumeFile ? '#16a34a' : '#d1d5db'}`, cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'center', marginBottom: 12 }}
          >
            {resumeFile ? (
              <div>
                <div style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(22,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 4 }}>{resumeFile.name}</p>
                <p style={{ fontSize: 12, color: '#9ca3af' }}>{(resumeFile.size / 1024).toFixed(0)} KB · Click to replace</p>
              </div>
            ) : (
              <div>
                <div style={{ width: 48, height: 48, borderRadius: 24, background: '#f5f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Drag & drop or click to upload</p>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>PDF or DOCX</p>
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>You can skip this and upload later</p>
        </StepShell>
      );

      case 'scanning': {
        const scanLabels = ['Extracting your experience', 'Cohort confirmed', 'Measuring Grit score', 'Comparing to peers', 'Building recommendations'];
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', textAlign: 'center', padding: '0 40px' }}>
            {/* Spinner */}
            <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 40px' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(${BLUE} 0%, transparent 70%)`, animation: 'ob-spin 1.2s linear infinite' }} />
              <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 32 }}>✦</span>
              </div>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111', margin: '0 0 32px' }}>Analyzing your resume...</h2>
            <div style={{ width: '100%', maxWidth: 340, textAlign: 'left' }}>
              {scanLabels.map((label, i) => {
                const state = i < scanStep ? 'done' : i === scanStep ? 'active' : 'pending';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < scanLabels.length - 1 ? '1px solid #f0eeea' : undefined }}>
                    <div style={{ width: 22, height: 22, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, background: state === 'done' ? 'rgba(22,163,74,0.12)' : state === 'active' ? 'rgba(59,76,192,0.1)' : '#f0eeea', color: state === 'done' ? '#16a34a' : state === 'active' ? BLUE : '#d1d5db', transition: 'all 0.3s ease' }}>
                      {state === 'done' ? '✓' : state === 'active' ? '●' : ''}
                    </div>
                    <span style={{ fontSize: 14, color: state === 'done' ? '#9ca3af' : state === 'active' ? '#111' : '#d1d5db', fontWeight: state === 'active' ? 700 : 400, transition: 'all 0.3s ease' }}>{label}</span>
                  </div>
                );
              })}
            </div>
            {scanError && <p style={{ fontSize: 13, color: '#ef4444', marginTop: 24 }}>{scanError}</p>}
          </div>
        );
      }

      case 'results': {
        const scores = auditResult?.scores ?? { smart: 0, grit: 0, build: 0 };
        const cohortColor = COHORT_COLORS[cohort] ?? BLUE;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '0 8px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Your Dilly Score</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 80, fontWeight: 900, color: '#111', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{animatedScore}</span>
              <span style={{ fontSize: 22, color: '#9ca3af' }}>/100</span>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 32 }}>Scored in the <strong style={{ color: cohortColor }}>{cohortInfo.label}</strong></p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
              {(['smart', 'grit', 'build'] as const).map(dim => (
                <div key={dim} style={{ flex: 1, padding: '16px 12px', borderRadius: 14, background: 'white', border: '1.5px solid #e5e5e5', textAlign: 'center' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{dim}</p>
                  <p style={{ fontSize: 28, fontWeight: 800, color: '#111' }}>{scores[dim]}</p>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 20px', borderRadius: 14, background: 'white', border: '1.5px solid #e5e5e5', position: 'relative', overflow: 'hidden' }}>
              <div style={{ filter: 'blur(3px)', opacity: 0.35 }}>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>Dilly found 4 specific improvements that could raise your score by 12+ points...</p>
              </div>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🔒</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>Unlock in the Career Center</span>
              </div>
            </div>
          </div>
        );
      }

      default: return null;
    }
  }

  /* ═══════════════════════════════
     LAYOUT
  ═══════════════════════════════ */
  return (
    <div style={{ height: '100vh', display: 'flex', background: BG, overflow: 'hidden', position: 'relative' }}>
      {/* Cohort reveal overlay */}
      {currentStep === 'youarein' && (
        <CohortReveal cohort={cohort} cohortInfo={cohortInfo} name={fullName} onContinue={goNext} />
      )}

      {/* Left panel — profile card */}
      {showPanel && (
        <div style={{ width: '38%', minWidth: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px 40px 40px', flexShrink: 0 }}>
          <ProfilePreviewCard ps={profileState} />
        </div>
      )}

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        {!isFullScreen && (
          <div style={{ padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <img src="/dilly-logo.png" alt="dilly" style={{ height: 28, objectFit: 'contain' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              {visibleSteps.filter(s => s !== 'youarein').map((s, i) => {
                const vIdx = visibleSteps.indexOf(currentStep);
                const done = i < vIdx;
                const active = i === vIdx;
                return <div key={s} style={{ width: active ? 20 : 7, height: 7, borderRadius: 4, background: active ? BLUE : done ? `${BLUE}50` : '#d1d5db', transition: 'all 0.3s ease' }} />;
              })}
            </div>
          </div>
        )}

        {/* Thin progress line */}
        {!isFullScreen && (
          <div style={{ height: 2, background: '#e8e5e0', flexShrink: 0 }}>
            <div style={{ height: '100%', background: BLUE, width: `${((visibleIdx + 1) / visibleSteps.length) * 100}%`, transition: 'width 500ms cubic-bezier(0.16,1,0.3,1)', borderRadius: '0 2px 2px 0' }} />
          </div>
        )}

        {/* Step content */}
        <div style={{ flex: 1, overflow: 'auto', padding: currentStep === 'scanning' ? 0 : '32px 48px 0', display: 'flex', flexDirection: 'column' }}>
          <div
            key={currentStep}
            style={{ flex: 1, animation: `ob-slide-${direction > 0 ? 'right' : 'left'} 360ms cubic-bezier(0.16,1,0.3,1)` }}
          >
            {renderStep()}
          </div>
        </div>

        {/* Footer */}
        {showFooter && (
          <div style={{ padding: '24px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            {showBack
              ? <button onClick={goPrev} style={{ padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 500, border: '1.5px solid #e5e5e5', background: 'white', color: '#6b7280', cursor: 'pointer' }}>← Back</button>
              : <div />}
            {currentStep === 'welcome' && <button onClick={sendVerificationCode} disabled={!canContinue.welcome} style={ctaBtn(!canContinue.welcome)}>{sendingCode ? 'Sending...' : 'Continue'}</button>}
            {currentStep === 'verify' && <button onClick={verifyCode} disabled={!canContinue.verify} style={ctaBtn(!canContinue.verify)}>{verifying ? 'Verifying...' : 'Verify'}</button>}
            {currentStep === 'profile' && <button onClick={saveProfile} disabled={!canContinue.profile || saving} style={ctaBtn(!canContinue.profile || saving)}>{saving ? 'Saving...' : 'Continue'}</button>}
            {currentStep === 'interests' && <button onClick={goNext} style={ctaBtn(false)}>{interests.length === 0 ? 'Skip for now' : `Continue (${interests.length})`}</button>}
            {currentStep === 'industry' && <button onClick={saveIndustryTarget} disabled={!canContinue.industry || saving} style={ctaBtn(!canContinue.industry || saving)}>{saving ? 'Saving...' : 'Continue'}</button>}
            {currentStep === 'anticipation' && <button onClick={goNext} style={ctaBtn(false)}>Let&apos;s go</button>}
            {currentStep === 'upload' && <button onClick={() => { goNext(); setTimeout(runFirstAudit, 300); }} style={ctaBtn(false)}>{resumeFile ? 'Scan my resume' : 'Skip for now'}</button>}
            {currentStep === 'results' && <button onClick={finishOnboarding} disabled={saving} style={ctaBtn(saving)}>{saving ? 'Loading...' : 'Enter the Career Center →'}</button>}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ob-slide-right { from { opacity:0; transform:translateX(32px); } to { opacity:1; transform:translateX(0); } }
        @keyframes ob-slide-left  { from { opacity:0; transform:translateX(-32px); } to { opacity:1; transform:translateX(0); } }
        @keyframes ob-shimmer { 0%{background-position:-500px 0} 100%{background-position:500px 0} }
        @keyframes ob-write-in { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ob-photo-reveal { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        @keyframes ob-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes ob-particle { 0%{opacity:0;transform:translateY(0) scale(0)} 20%{opacity:1} 80%{opacity:0.5} 100%{opacity:0;transform:translateY(-120px) scale(1)} }
        @keyframes ob-reveal-fade { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ob-reveal-scale { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }

        .ob-skeleton {
          background: linear-gradient(90deg, #e8e5e0 25%, #f0ede8 50%, #e8e5e0 75%);
          background-size: 1000px 100%;
          animation: ob-shimmer 1.6s ease-in-out infinite;
        }
        .ob-write-in {
          animation: ob-write-in 0.4s cubic-bezier(0.16,1,0.3,1) both;
        }
        .ob-photo-reveal {
          animation: ob-photo-reveal 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .ob-hidden { opacity:0; }
        .ob-reveal-fade {
          animation: ob-reveal-fade 0.6s cubic-bezier(0.16,1,0.3,1) both;
        }
        .ob-reveal-scale {
          animation: ob-reveal-scale 0.7s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .ob-particle {
          position: absolute;
          left: var(--px);
          top: var(--py);
          width: 4px; height: 4px;
          border-radius: 50%;
          background: var(--pc);
          animation: ob-particle var(--pd) var(--ps) ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
