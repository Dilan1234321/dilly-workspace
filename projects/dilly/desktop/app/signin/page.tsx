'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
const BLUE = '#2B3A8E';

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'verify'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    const existing = typeof window !== 'undefined' ? localStorage.getItem('dilly_token') : null;
    if (!existing) return;
    fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${existing}` } })
      .then(r => { if (r.ok) router.replace('/home'); })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function sendCode() {
    setSending(true); setEmailError('');
    try {
      const res = await fetch(`${API_BASE}/auth/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const det = data?.detail;
        setEmailError(typeof det === 'string' ? det : det?.message || 'Could not send code. Try again.');
        return;
      }
      if (data?.dev_code) { setDevCode(data.dev_code); setCode(data.dev_code); }
      setResendCooldown(30);
      setStep('verify');
    } catch {
      setEmailError('Could not reach Dilly. Check your connection and try again.');
    } finally { setSending(false); }
  }

  async function verify() {
    setVerifying(true); setCodeError('');
    try {
      const res = await fetch(`${API_BASE}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) { setCodeError('Invalid code. Please try again.'); setVerifying(false); return; }
      const data = await res.json();
      if (data?.token) setToken(data.token);
      // Route based on onboarding status
      try {
        const profileRes = await fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${data.token}` } });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          router.replace(profile?.onboarding_complete ? '/home' : '/onboarding');
          return;
        }
      } catch { /* fall through */ }
      router.replace('/home');
    } catch { setCodeError('Something went wrong. Try again.'); }
    finally { setVerifying(false); }
  }

  function resendCode() {
    if (resendCooldown > 0) return;
    setResendCooldown(30);
    fetch(`${API_BASE}/auth/send-verification-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 16px', fontSize: 15, borderRadius: 10,
    border: '1.5px solid #e5e5e5', background: 'white', color: '#111',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s ease',
  };

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '13px 36px', borderRadius: 10, fontSize: 14, fontWeight: 700,
    border: 'none', background: disabled ? '#e5e5e5' : BLUE,
    color: disabled ? '#aaa' : 'white', cursor: disabled ? 'default' : 'pointer',
    transition: 'all 0.2s ease', width: '100%',
  });

  return (
    <div style={{ height: '100vh', background: '#f8f7f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
      <div className="si-card" style={{ width: '100%', maxWidth: 440, background: 'white', borderRadius: 24, padding: '48px 44px', boxShadow: '0 2px 40px rgba(0,0,0,0.07)' }}>

        <p style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: 700, color: BLUE, letterSpacing: -0.5, margin: '0 0 40px' }}>dilly</p>

        {step === 'email' && (
          <div className="si-step">
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', margin: '0 0 8px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              Welcome back.
            </h1>
            <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 32px', lineHeight: 1.6 }}>
              Enter your .edu email to pick up where you left off.
            </p>
            <input
              type="email" value={email} autoFocus
              onChange={e => { setEmail(e.target.value); setEmailError(''); }}
              placeholder="you@school.edu"
              onKeyDown={e => { if (e.key === 'Enter' && email.includes('.edu') && !sending) sendCode(); }}
              style={{ ...inputStyle, marginBottom: 10, borderColor: email && !email.includes('.edu') ? '#ef4444' : '#e5e5e5' }}
            />
            {email && !email.includes('.edu') && (
              <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>Please use a .edu email address</p>
            )}
            {emailError && (
              <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 12, background: '#fff5f5', padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca' }}>{emailError}</div>
            )}
            <button onClick={sendCode} disabled={!email.includes('.edu') || sending} style={{ ...btnStyle(!email.includes('.edu') || sending), marginTop: 4 }}>
              {sending ? 'Sending…' : 'Send code'}
            </button>
            <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 24 }}>
              New to Dilly?{' '}
              <a href="/onboarding" style={{ color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Create an account →</a>
            </p>
          </div>
        )}

        {step === 'verify' && (
          <div className="si-step">
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', margin: '0 0 8px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              Check your inbox.
            </h1>
            <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 32px', lineHeight: 1.6 }}>
              We sent a 6-digit code to <strong style={{ color: '#111' }}>{email}</strong>.
              Check spam if you don&apos;t see it.
            </p>
            <input
              type="text" inputMode="numeric" maxLength={6}
              value={code} autoFocus
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setCodeError(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && code.length === 6 && !verifying) verify(); }}
              placeholder="000000"
              style={{ ...inputStyle, marginBottom: codeError ? 8 : 12, fontSize: 28, fontFamily: 'monospace', letterSpacing: '0.25em', textAlign: 'center', borderColor: codeError ? '#ef4444' : '#e5e5e5' }}
            />
            {codeError && <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{codeError}</p>}
            {devCode && (
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, background: '#f5f4f0', padding: '8px 12px', borderRadius: 8 }}>
                Dev mode — code pre-filled: <strong style={{ fontFamily: 'monospace', color: '#6b7280' }}>{devCode}</strong>
              </p>
            )}
            <button onClick={verify} disabled={code.length !== 6 || verifying} style={btnStyle(code.length !== 6 || verifying)}>
              {verifying ? 'Signing in…' : 'Sign in'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
              <button onClick={() => { setStep('email'); setCode(''); setCodeError(''); }} style={{ fontSize: 13, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                ← Back
              </button>
              <button onClick={resendCode} disabled={resendCooldown > 0} style={{ fontSize: 13, color: resendCooldown > 0 ? '#aaa' : BLUE, background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'default' : 'pointer', padding: 0, fontWeight: 500 }}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .si-card { animation: si-rise 0.45s cubic-bezier(0.16,1,0.3,1) both; }
        .si-step { animation: si-slide 0.32s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes si-rise { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes si-slide { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
      `}</style>
    </div>
  );
}
