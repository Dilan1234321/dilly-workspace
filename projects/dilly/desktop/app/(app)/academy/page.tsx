'use client';

import { useState } from 'react';
import { dilly } from '@/lib/dilly';
import { useProfile } from '../layout';
import { InterestsPicker } from '@/components/ui/InterestsPicker';
import { getCohortColor } from '@/lib/cohorts';

const COHORT_TIPS: Record<string, string> = {
  'Software Engineering & CS':   'GitHub link and a Projects section are table stakes at top SWE internships. Skip the summary.',
  'Data Science & Analytics':    'List tools explicitly: Python, SQL, TensorFlow, Tableau. Quantify model outcomes (accuracy %, rows processed).',
  'Cybersecurity & IT':          'Certifications (CompTIA, CEH, CISSP) near the top. CTF wins and CVEs are strong Build signals.',
  'Finance & Accounting':        'Wall Street standard: centered header, Garamond, Education first. Goldman informally screens for 3.7+ GPA.',
  'Marketing & Advertising':     'Quantify campaign impact: CTR, ROAS, follower growth. A portfolio link is more powerful than GPA here.',
  'Consulting & Strategy':       'MBB standard: left-aligned, dense text, Leadership section required. Every bullet needs a metric.',
  'Management & Operations':     'Highlight team size managed and process improvements. Operations roles want numbers: cost savings, throughput gains.',
  'Economics & Public Policy':   'Policy employers value research, publications, and government exposure. List languages and statistical tools.',
  'Entrepreneurship & Innovation': 'VCs and accelerators care about what you shipped, not your GPA. Lead with outcomes: revenue, users, funding raised.',
  'Healthcare & Clinical':       'Certifications go near the top — hospital recruiters confirm licensure before reading anything else.',
  'Life Sciences & Research':    'List lab techniques explicitly — CRISPR, PCR, flow cytometry. These are ATS keywords for biotech hiring.',
  'Physical Sciences & Math':    'Math and physics employers want proof of rigor: coursework, competition results, and research outcomes.',
  'Social Sciences & Nonprofit': 'Nonprofits weight mission alignment heavily. Quantify community impact: people served, funds raised, programs launched.',
  'Media & Communications':      'Portfolio and bylined work matter most. A published piece outweighs honor roll at media companies.',
  'Design & Creative':           'Portfolio link is the most important thing on this resume. Figma, Adobe CC, and UX process keywords are ATS gold.',
  'Legal & Compliance':          'Law firms expect GPA front and center. Moot court, law review, and clerkship experience carry heavy weight.',
  'Human Resources & People':    'SHRM certifications and headcount metrics (time-to-hire reduced, retention improved) are strong HR signals.',
  'Supply Chain & Logistics':    'Quantify inventory impact, cost savings, and lead time reductions. APICS certification is a strong differentiator.',
  'Education & Teaching':        'Teaching licenses and student outcome data (proficiency gains, pass rates) are expected in education resumes.',
  'Real Estate & Construction':  'Deal volume and square footage matter in real estate. List licenses near the top and quantify project budgets.',
  'Environmental & Sustainability': 'GIS proficiency, field experience, and EPA/DEQ project work are ATS keywords in environmental recruiting.',
  'Hospitality & Events':        'Highlight event scale (attendees, budget managed) and software proficiency (Eventbrite, Cvent, OPERA).',
};

export default function AcademyPage() {
  const { profile } = useProfile();
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleChange(next: string[]) {
    setInterests(next);
    setSaving(true);
    setSaved(false);
    try {
      await dilly.patch('/profile', { interests: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--surface-0)' }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-6" style={{ borderBottom: '1px solid var(--border-main)' }}>
        <div className="flex items-start justify-between">
          <div>
            <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 24, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 0.5 }}>Career Center</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--text-3)' }}>
              Tell Dilly which fields you&apos;re exploring — your resume templates, job matches, and coaching will align to your interests.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            {interests.length > 0 && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(59,76,192,0.08)', color: '#2B3A8E' }}>
                {interests.length} selected
              </span>
            )}
            <span className="text-[11px] font-semibold transition-all" style={{ color: saved ? '#16a34a' : 'transparent' }}>
              {saving ? 'Saving...' : 'Saved ✓'}
            </span>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[900px]">
        {/* Picker */}
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-3)' }}>
            Select fields you&apos;re interested in
          </p>
          <InterestsPicker selected={interests} onChange={handleChange} />
        </div>

        {/* Tips for selected interests */}
        {interests.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-3)' }}>
              Recruiting tips for your fields
            </p>
            <div className="grid grid-cols-1 gap-3">
              {interests.map(cohort => {
                const color = getCohortColor(cohort);
                const tip = COHORT_TIPS[cohort];
                if (!tip) return null;
                return (
                  <div key={cohort} className="rounded-xl p-4 flex gap-4"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)', borderLeft: `3px solid ${color}` }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold mb-1" style={{ color }}>{cohort}</p>
                      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-2)' }}>{tip}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {interests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(59,76,192,0.08)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B3A8E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
              </svg>
            </div>
            <p className="text-[14px] font-semibold" style={{ color: 'var(--text-2)' }}>No interests selected yet</p>
            <p className="text-[12px] text-center max-w-[280px]" style={{ color: 'var(--text-3)' }}>
              Pick the fields above to get personalized recruiting tips and tailored job matches.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
