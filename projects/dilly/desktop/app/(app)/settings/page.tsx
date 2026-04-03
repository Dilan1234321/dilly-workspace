'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '../layout';
import { dilly } from '@/lib/dilly';
import { clearToken } from '@/lib/auth';
import { InterestsPicker } from '@/components/ui/InterestsPicker';
import { ALL_COHORTS } from '@dilly/api';

const API_BASE_PHOTO = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

/* ═══════════════════════════════════════════════════════════════════════
   SHARED UI
   ═══════════════════════════════════════════════════════════════════════ */

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? '' : 'opacity-60'}`}
      style={{ background: on ? '#2B3A8E' : 'var(--surface-2)' }}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function SectionCard({ children, accent = '#2B3A8E' }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)', borderLeft: `3px solid ${accent}` }}>
      {children}
    </div>
  );
}

function Row({ children, border = true }: { children: React.ReactNode; border?: boolean }) {
  return <div className="px-5 py-4" style={border ? { borderBottom: '1px solid var(--border-main)' } : {}}>{children}</div>;
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold text-txt-3 uppercase tracking-widest mb-2">{children}</p>;
}

function NavItem({ id, label, icon, active, onClick }: { id: string; label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <a href={`#${id}`} onClick={e => { e.preventDefault(); onClick(); const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{ background: active ? 'rgba(59,76,192,0.08)' : 'transparent', color: active ? '#2B3A8E' : 'var(--text-3)' }}>
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
      {label}
    </a>
  );
}

const NAV = [
  { id: 'account', label: 'Account', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'interests', label: 'Interests', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { id: 'subscription', label: 'Plan', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'appearance', label: 'Appearance', icon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' },
  { id: 'notifications', label: 'Notifications', icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9a6 6 0 00-12 0v.75a8.967 8.967 0 01-2.311 6.022 23.848 23.848 0 005.454 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0' },
  { id: 'privacy', label: 'Privacy', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3' },
  { id: 'integrations', label: 'Data', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
  { id: 'support', label: 'Support', icon: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z' },
  { id: 'danger', label: 'Account', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
];

const SHORTCUTS = [
  { keys: '\u2318 + K', action: 'Command palette' },
  { keys: '\u2318 + \\', action: 'Toggle right panel' },
  { keys: '\u2191 / \u2193', action: 'Navigate job list' },
  { keys: 'Enter', action: 'Select / expand job' },
  { keys: '\u2318 + Enter', action: 'Quick apply' },
  { keys: 'S', action: 'Save selected job' },
  { keys: 'D', action: 'Dismiss selected job' },
  { keys: 'Esc', action: 'Close panel / modal' },
  { keys: 'Type anything', action: 'Start searching' },
];

/* ═══════════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════════ */

export default function SettingsPage() {
  const router = useRouter();
  const { profile, setProfile, refreshProfile } = useProfile();
  const [dark, setDark] = useState(true);
  const [activeSection, setActiveSection] = useState('account');
  const [saving, setSaving] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(profile?.notification_prefs?.enabled !== false);
  const [deadlineReminders, setDeadlineReminders] = useState(true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(profile?.leaderboard_opt_in !== false);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [giftCode, setGiftCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const validProfileInterests = (profile?.interests ?? []).filter((i: string) => (ALL_COHORTS as readonly string[]).includes(i));
  const [interests, setInterests] = useState<string[]>(validProfileInterests);
  const [pendingInterests, setPendingInterests] = useState<string[]>(validProfileInterests);
  const [interestsSaving, setInterestsSaving] = useState(false);
  const [interestsSaved, setInterestsSaved] = useState(false);
  const interestsDirty = JSON.stringify([...pendingInterests].sort()) !== JSON.stringify([...interests].sort());

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  useEffect(() => {
    dilly.get('/auth/me').then((data: { subscribed?: boolean }) => {
      setSubscribed(data?.subscribed ?? false);
    }).catch(() => setSubscribed(false));
  }, []);

  async function saveInterests() {
    setInterestsSaving(true);
    setInterestsSaved(false);
    try {
      await dilly.patch('/profile', { interests: pendingInterests });
      setInterests(pendingInterests);
      await refreshProfile();
      setInterestsSaved(true);
      setTimeout(() => setInterestsSaved(false), 2000);
    }
    catch { /* ignore */ }
    finally { setInterestsSaving(false); }
  }

  const save = async (data: Record<string, unknown>) => {
    setSaving(true);
    try { await dilly.patch('/profile', data); await refreshProfile(); }
    catch { /* ignore */ }
    finally { setSaving(false); }
  };

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('dilly_theme', next ? 'dark' : 'light');
  }

  function handleSignOut() {
    clearToken();
    // Clear all dilly_ keys
    try { Object.keys(localStorage).filter(k => k.startsWith('dilly_')).forEach(k => localStorage.removeItem(k)); } catch {}
    router.push('/onboarding');
  }

  async function handleExport() {
    setExportLoading(true);
    try {
      const token = localStorage.getItem('dilly_token');
      const res = await fetch(`${API_BASE}/profile/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dilly-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { /* ignore */ }
    finally { setExportLoading(false); }
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true);
    try {
      const token = localStorage.getItem('dilly_token');
      const res = await fetch(`${API_BASE}/account/delete`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        clearToken();
        try { Object.keys(localStorage).filter(k => k.startsWith('dilly_')).forEach(k => localStorage.removeItem(k)); } catch {}
        router.replace('/onboarding');
        return;
      }
    } catch { /* ignore */ }
    finally { setDeleteLoading(false); }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('dilly_token');
      const res = await fetch(`${API_BASE_PHOTO}/profile/photo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (res.ok) await refreshProfile();
    } catch { /* ignore */ }
    finally { setPhotoUploading(false); }
  }

  const name = profile?.name || 'Student';
  const email = profile?.email || '';
  const school = profile?.school_id === 'utampa' ? 'University of Tampa' : (profile?.school_id || '');
  const major = (profile?.majors || [])[0] || profile?.major || '';
  const photoUrl = profile?.photo_url || null;

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--surface-0)' }}>
      {/* ═══ HERO ═══ */}
      <div style={{ background: dark ? 'linear-gradient(180deg, var(--surface-1) 0%, var(--surface-0) 100%)' : 'linear-gradient(180deg, var(--surface-2) 0%, var(--surface-0) 100%)', borderBottom: '1px solid var(--border-main)' }}>
        <div className="max-w-[840px] mx-auto px-8 pt-8 pb-6">
          <div className="flex items-start gap-5">
            {/* Photo avatar — click to upload */}
            <button className="relative w-20 h-20 rounded-2xl shrink-0 group overflow-hidden"
              style={{ background: 'rgba(59,76,192,0.08)', border: '2px solid rgba(59,76,192,0.2)' }}
              onClick={() => photoInputRef.current?.click()}
              title="Change photo">
              {photoUrl ? (
                <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold" style={{ color: '#2B3A8E' }}>{name.charAt(0).toUpperCase()}</span>
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'rgba(0,0,0,0.45)' }}>
                {photoUploading ? (
                  <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </div>
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            <div className="flex-1 min-w-0 pt-1">
              <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: 0.3 }}>{name}</h1>
              <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-2)' }}>{email}</p>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {school && <span className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border-main)' }}>{school}</span>}
                {major && <span className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(59,76,192,0.08)', color: '#2B3A8E', border: '1px solid rgba(59,76,192,0.15)' }}>{major}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BODY: Sidebar + Content ═══ */}
      <div className="max-w-[840px] mx-auto px-8 py-6 flex gap-8">
        {/* Sidebar */}
        <nav className="w-44 shrink-0 sticky top-6 self-start">
          <div className="space-y-0.5">
            {NAV.map(n => <NavItem key={n.id} {...n} active={activeSection === n.id} onClick={() => setActiveSection(n.id)} />)}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-8">

          {/* Account */}
          <section id="account">
            <h2 className="text-[11px] font-bold text-txt-3 uppercase tracking-widest mb-3" style={{ color: '#2B3A8E' }}>Account</h2>
            <SectionCard>
              <Row>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-txt-3 text-xs">Name</span><p className="font-medium mt-0.5 text-txt-1">{name}</p></div>
                  <div><span className="text-txt-3 text-xs">Email</span><p className="font-medium mt-0.5 text-txt-1">{email}</p></div>
                  <div><span className="text-txt-3 text-xs">School</span><p className="font-medium mt-0.5 text-txt-1">{school || 'Not set'}</p></div>
                  <div><span className="text-txt-3 text-xs">Majors</span><p className="font-medium mt-0.5 text-txt-1">{(profile?.majors || []).join(', ') || 'Not set'}</p></div>
                  <div><span className="text-txt-3 text-xs">Minors</span><p className="font-medium mt-0.5 text-txt-1">{(profile?.minors || []).join(', ') || 'Not set'}</p></div>
                  <div><span className="text-txt-3 text-xs">Graduation</span><p className="font-medium mt-0.5 text-txt-1">{profile?.graduation_year || 'Not set'}</p></div>
                </div>
              </Row>
            </SectionCard>
          </section>

          {/* Interests */}
          <section id="interests">
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#2B3A8E' }}>Career Interests</h2>
            <SectionCard>
              <Row>
                <p className="text-xs text-txt-3 mb-4">Pick the fields you want to explore — Dilly will tailor job matches, coaching, and resume templates to your interests.</p>
                <InterestsPicker selected={pendingInterests} onChange={setPendingInterests} />
              </Row>
              <Row border={false}>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-txt-3">{pendingInterests.length === 0 ? 'No interests selected' : `${pendingInterests.length} field${pendingInterests.length === 1 ? '' : 's'} selected`}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: interestsSaved ? '#16a34a' : 'transparent', fontWeight: 600, transition: 'color 0.2s' }}>
                      Saved
                    </span>
                    {interestsDirty && (
                      <button
                        onClick={saveInterests}
                        disabled={interestsSaving}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                        style={{ background: 'rgba(59,76,192,0.1)', color: '#2B3A8E', border: '1px solid rgba(59,76,192,0.2)', opacity: interestsSaving ? 0.6 : 1 }}
                      >
                        {interestsSaving ? 'Saving…' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              </Row>
            </SectionCard>
          </section>

          {/* Subscription */}
          <section id="subscription">
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#2B3A8E' }}>Plan</h2>
            <SectionCard accent="#2B3A8E">
              <Row>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-bold text-txt-1">{subscribed ? 'Dilly' : 'Dilly Starter'}</p>
                    <p className="text-xs mt-1 text-txt-3">
                      {subscribed
                        ? 'Unlimited audits · AI coaching · all jobs · full score history'
                        : 'Score + leaderboard rank + 2 audit recommendations'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                    style={{ background: subscribed ? 'rgba(43,58,142,0.12)' : 'var(--surface-2)', color: subscribed ? '#2B3A8E' : 'var(--text-3)' }}>
                    {subscribed ? 'Active' : 'Free'}
                  </span>
                </div>
              </Row>

              {subscribed ? (
                <Row border={false}>
                  <button
                    disabled={billingLoading}
                    onClick={async () => {
                      setBillingLoading(true);
                      try {
                        const data = await dilly.post('/auth/create-billing-portal-session', {});
                        if (data?.url) window.open(data.url, '_blank');
                        else alert('Could not open billing portal. Please contact support.');
                      } finally { setBillingLoading(false); }
                    }}
                    className="w-full py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border-main)' }}>
                    {billingLoading ? 'Opening…' : 'Manage billing →'}
                  </button>
                  <p className="text-[11px] text-center mt-2 text-txt-3">Cancel, update payment method, or view invoices</p>
                </Row>
              ) : (
                <>
                  <Row>
                    <button
                      disabled={upgradeLoading}
                      onClick={async () => {
                        setUpgradeLoading(true);
                        try {
                          const data = await dilly.post('/auth/create-checkout-session', {});
                          if (data?.url) window.location.href = data.url;
                          else alert('Payment is not configured yet. Check back soon.');
                        } finally { setUpgradeLoading(false); }
                      }}
                      className="w-full py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ background: '#2B3A8E', color: 'white' }}>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      {upgradeLoading ? 'Loading…' : 'Upgrade to Dilly · $9.99/mo'}
                    </button>
                    <p className="text-[11px] text-center mt-2 text-txt-3">Unlimited audits, AI coaching, all jobs, score history</p>
                  </Row>
                  <Row border={false}>
                    <RowLabel>Redeem a gift</RowLabel>
                    <div className="flex gap-2">
                      <input value={giftCode} onChange={e => setGiftCode(e.target.value.toUpperCase())} placeholder="GIFT-XXXX" className="flex-1 text-sm font-mono px-3 py-2 rounded-lg outline-none" style={{ border: '1px solid var(--border-main)', background: 'var(--surface-2)', color: 'var(--text-1)' }} />
                      <button disabled={!giftCode.trim() || redeemLoading} onClick={async () => {
                        setRedeemLoading(true);
                        try {
                          const token = localStorage.getItem('dilly_token');
                          const res = await fetch(`${API_BASE}/auth/redeem-gift`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ code: giftCode.trim() }) });
                          if (res.ok) { setGiftCode(''); setSubscribed(true); }
                        } finally { setRedeemLoading(false); }
                      }} className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40" style={{ background: '#2B3A8E' }}>
                        {redeemLoading ? '...' : 'Redeem'}
                      </button>
                    </div>
                  </Row>
                </>
              )}
            </SectionCard>
          </section>

          {/* Appearance */}
          <section id="appearance">
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#2B3A8E' }}>Appearance</h2>
            <SectionCard>
              <Row border={false}>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-txt-1">Dark mode</p><p className="text-xs text-txt-3">Toggle between dark and light themes</p></div>
                  <Toggle on={dark} onChange={toggleTheme} />
                </div>
              </Row>
            </SectionCard>
          </section>

          {/* Notifications */}
          <section id="notifications">
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#2B3A8E' }}>Notifications</h2>
            <SectionCard>
              <Row>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-txt-1">Push notifications</p><p className="text-xs text-txt-3">Score updates, coaching tips, job matches</p></div>
                  <Toggle on={notifEnabled} onChange={v => { setNotifEnabled(v); save({ notification_prefs: { enabled: v } }); }} />
                </div>
              </Row>
              <Row border={false}>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-txt-1">Deadline reminders</p><p className="text-xs text-txt-3">Get reminded before interviews and deadlines</p></div>
                  <Toggle on={deadlineReminders} onChange={setDeadlineReminders} />
                </div>
              </Row>
            </SectionCard>
          </section>

          {/* Privacy */}
          <section id="privacy">
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#2B3A8E' }}>Privacy</h2>
            <SectionCard>
              <Row>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-txt-1">Show on leaderboard</p><p className="text-xs text-txt-3">Other students can see your rank and score</p></div>
                  <Toggle on={leaderboardOptIn} onChange={v => { setLeaderboardOptIn(v); save({ leaderboard_opt_in: v }); }} />
                </div>
              </Row>
              <Row border={false}>
                <p className="text-sm font-semibold text-txt-1 mb-1">Your data is yours. We never sell it.</p>
                <p className="text-xs text-txt-3">Dilly stores your data to help you. We do not sell, rent, or share with advertisers. We do not train AI on your data.</p>
              </Row>
            </SectionCard>
          </section>

          {/* Keyboard shortcuts */}
          <section id="shortcuts">
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#2B3A8E' }}>Keyboard Shortcuts</h2>
            <SectionCard>
              {SHORTCUTS.map((s, i) => (
                <Row key={i} border={i < SHORTCUTS.length - 1}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-txt-2">{s.action}</span>
                    <span className="text-xs font-mono px-2.5 py-1 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>{s.keys}</span>
                  </div>
                </Row>
              ))}
            </SectionCard>
          </section>

          {/* Integrations */}
          <section id="integrations">
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#2B3A8E' }}>Data & Integrations</h2>
            <SectionCard>
              <Row>
                <button onClick={handleExport} disabled={exportLoading} className="flex items-center justify-between w-full group">
                  <div><p className="text-sm font-medium text-txt-1">Download everything</p><p className="text-xs text-txt-3">Profile, audits, applications, deadlines</p></div>
                  {exportLoading
                    ? <span className="text-xs text-txt-3">Exporting...</span>
                    : <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5 text-txt-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  }
                </button>
              </Row>
              <Row border={false}>
                <RowLabel>Coming soon</RowLabel>
                <ul className="text-xs space-y-1 text-txt-3">
                  <li>LinkedIn &mdash; sync experience, suggest profile updates</li>
                  <li>Email &mdash; parse recruiter emails for deadlines</li>
                </ul>
              </Row>
            </SectionCard>
          </section>

          {/* Support */}
          <section id="support">
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#2B3A8E' }}>Support</h2>
            <SectionCard>
              <Row>
                <a href="mailto:support@trydilly.com?subject=Dilly%20Feedback" className="flex items-center justify-between group">
                  <div><p className="text-sm font-medium text-txt-1">Send feedback</p><p className="text-xs text-txt-3">Help us make Dilly better</p></div>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5 text-txt-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </a>
              </Row>
              <Row>
                <a href="mailto:support@trydilly.com" className="flex items-center justify-between group">
                  <div><p className="text-sm font-medium text-txt-1">Contact support</p><p className="text-xs text-txt-3">support@trydilly.com</p></div>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5 text-txt-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </a>
              </Row>
              <Row>
                <a href="/privacy" className="flex items-center justify-between group">
                  <p className="text-sm font-medium text-txt-1">Privacy policy</p>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5 text-txt-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </a>
              </Row>
              <Row border={false}>
                <a href="/terms" className="flex items-center justify-between group">
                  <p className="text-sm font-medium text-txt-1">Terms of service</p>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5 text-txt-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </a>
              </Row>
            </SectionCard>
          </section>

          {/* Danger Zone */}
          <section id="danger" className="pb-12">
            <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#FF453A' }}>Danger Zone</h2>
            <SectionCard accent="#FF453A">
              <Row>
                <button onClick={handleSignOut} className="flex items-center justify-between w-full group">
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#FF9F0A' }}>Sign out</p>
                    <p className="text-xs text-txt-3">You&apos;ll need to verify your email again to sign back in</p>
                  </div>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" style={{ color: '#FF9F0A' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                </button>
              </Row>
              <Row border={false}>
                {!deleteConfirm ? (
                  <button onClick={() => setDeleteConfirm(true)} className="flex items-center justify-between w-full group">
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#FF453A' }}>Delete my account</p>
                      <p className="text-xs text-txt-3">Permanently delete your profile, scores, and all data</p>
                    </div>
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" style={{ color: '#FF453A' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                ) : (
                  <div>
                    <p className="text-sm mb-3" style={{ color: '#FF453A' }}>Are you sure? This cannot be undone.</p>
                    <div className="flex gap-3">
                      <button onClick={() => setDeleteConfirm(false)} disabled={deleteLoading} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors" style={{ border: '1px solid var(--border-main)', color: 'var(--text-2)', background: 'transparent' }}>Cancel</button>
                      <button onClick={handleDeleteAccount} disabled={deleteLoading} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60" style={{ background: '#FF453A' }}>
                        {deleteLoading ? 'Deleting...' : 'Yes, delete everything'}
                      </button>
                    </div>
                  </div>
                )}
              </Row>
            </SectionCard>
          </section>

          {/* Footer */}
          <div className="text-center pb-8">
            <p className="text-[11px] text-txt-3" style={{ fontFamily: 'Cinzel, serif', letterSpacing: 1 }}>Dilly v1.0</p>
            <p className="text-[10px] text-txt-3 mt-1 italic">Made for students who want to win.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
