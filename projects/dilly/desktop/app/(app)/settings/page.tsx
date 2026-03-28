'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    apiFetch('/profile').then(setProfile).catch(() => {});
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('dilly_theme', next ? 'dark' : 'light');
  }

  const shortcuts = [
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[700px] mx-auto px-8 py-6">
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 24, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 0.5, marginBottom: 24 }}>Settings</h1>

        {/* Profile section */}
        <Section title="Profile">
          {profile && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-dilly-blue/10 flex items-center justify-center">
                  <span className="text-[20px] font-bold text-dilly-blue">
                    {(profile.name || 'U').charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-[16px] font-semibold text-txt-1">{profile.name || 'Student'}</p>
                  <p className="text-[13px] text-txt-2">{profile.email || ''}</p>
                  <p className="text-[12px] text-txt-3">{profile.school || 'University of Tampa'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Majors" value={(profile.majors || []).join(', ') || 'Not set'} />
                <InfoField label="Minors" value={(profile.minors || []).join(', ') || 'Not set'} />
                <InfoField label="Graduation" value={profile.graduation_year || 'Not set'} />
                <InfoField label="Cohorts" value={Object.keys(profile.cohort_scores || {}).length + ' active'} />
              </div>
            </div>
          )}
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] font-semibold text-txt-1">Dark mode</p>
              <p className="text-[12px] text-txt-3">Toggle between dark and light themes</p>
            </div>
            <button onClick={toggleTheme}
              className={`w-12 h-7 rounded-full transition-colors duration-200 flex items-center px-1
                ${dark ? 'bg-dilly-blue' : 'bg-surface-2'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                ${dark ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </Section>

        {/* Keyboard shortcuts */}
        <Section title="Keyboard shortcuts">
          <div className="space-y-0">
            {shortcuts.map((s, i) => (
              <div key={i} className={`flex items-center justify-between py-2.5 ${i < shortcuts.length - 1 ? 'border-b border-border-main' : ''}`}>
                <span className="text-[13px] text-txt-2">{s.action}</span>
                <span className="text-[12px] font-mono text-txt-3 bg-surface-2 px-2.5 py-1 rounded-md">{s.keys}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Account */}
        <Section title="Account">
          <div className="space-y-3">
            <button className="text-[13px] text-txt-2 hover:text-txt-1 transition-colors">Export my data</button>
            <br />
            <button className="text-[13px] text-gap hover:text-gap/80 transition-colors">Sign out</button>
          </div>
        </Section>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border-main text-center">
          <p className="text-[11px] text-txt-3">Dilly v1.0 \u00b7 Built by Dilan Kochhar</p>
          <p className="text-[10px] text-txt-3 mt-1">app.hellodilly.com</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-[11px] font-bold text-txt-3 uppercase tracking-widest mb-4">{title}</h2>
      <div className="bg-surface-1 rounded-xl p-5">{children}</div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-lg p-3">
      <p className="text-[10px] text-txt-3 font-semibold uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[13px] text-txt-1 font-medium">{value}</p>
    </div>
  );
}