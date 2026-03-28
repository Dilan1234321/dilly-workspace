'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import CompanyLogo from '@/components/jobs/CompanyLogo';

function AnimNum({ value, delay = 0 }: { value: number; delay?: number }) {
  const [d, setD] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const s = performance.now();
      function tick(now: number) {
        const p = Math.min((now - s) / 1000, 1);
        setD(Math.round((1 - Math.pow(1 - p, 3)) * value));
        if (p < 1) ref.current = requestAnimationFrame(tick);
      }
      ref.current = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(t); cancelAnimationFrame(ref.current); };
  }, [value, delay]);
  return <>{d}</>;
}

function AnimBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), delay); return () => clearTimeout(t); }, [pct, delay]);
  return (
    <div style={{ height: 4, background: 'var(--border-main)', borderRadius: 2 }}>
      <div style={{ height: '100%', borderRadius: 2, backgroundColor: color, width: w + '%', transition: 'width 900ms cubic-bezier(0.16, 1, 0.3, 1)' }} />
    </div>
  );
}

function DillyNote({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div className="animate-fade-in" style={{ animationDelay: delay + 'ms', display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0' }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: '#3B4CC0', flexShrink: 0, letterSpacing: -0.3 }}>dilly</span>
      <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65, margin: 0 }}>{children}</p>
    </div>
  );
}

function SGBBox({ label, value, delay }: { label: string; value: number; delay: number }) {
  const color = value >= 75 ? '#34C759' : value >= 55 ? '#FF9F0A' : '#FF453A';
  const bgColor = value >= 75 ? 'rgba(52,199,89,0.08)' : value >= 55 ? 'rgba(255,159,10,0.08)' : 'rgba(255,69,58,0.08)';
  const borderColor = value >= 75 ? 'rgba(52,199,89,0.2)' : value >= 55 ? 'rgba(255,159,10,0.2)' : 'rgba(255,69,58,0.2)';
  return (
    <div className="animate-fade-in" style={{
      animationDelay: delay + 'ms',
      width: 110, padding: '14px 14px 16px', textAlign: 'center' as const,
      border: '1px solid ' + borderColor, borderRadius: 4, background: bgColor,
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700, color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
        <AnimNum value={value} delay={delay + 200} />
      </p>
    </div>
  );
}

function MiniSGB({ label, s, g, b, delay }: { label: string; s: number; g: number; b: number; delay: number }) {
  return (
    <div className="animate-fade-in" style={{ animationDelay: delay + 'ms', display: 'flex', gap: 8 }}>
      <MiniBar label="S" value={s} color="#3B4CC0" delay={delay + 200} />
      <MiniBar label="G" value={g} color="#C9A84C" delay={delay + 300} />
      <MiniBar label="B" value={b} color="#34C759" delay={delay + 400} />
    </div>
  );
}

function CohortSGBCard({ label, value, delay, isDilly, small }: { label: string; value: number; delay: number; isDilly?: boolean; small?: boolean }) {
  const color = value >= 75 ? '#34C759' : value >= 55 ? '#FF9F0A' : '#FF453A';
  const bg = value >= 75 ? 'rgba(52,199,89,0.04)' : value >= 55 ? 'rgba(255,159,10,0.04)' : 'rgba(255,69,58,0.04)';
  const border = value >= 75 ? 'rgba(52,199,89,0.12)' : value >= 55 ? 'rgba(255,159,10,0.12)' : 'rgba(255,69,58,0.12)';
  return (
    <div className="animate-fade-in" style={{
      animationDelay: delay + 'ms',
      padding: small ? '14px 10px' : '18px 14px', textAlign: 'center' as const, borderRadius: small ? 10 : 12,
      background: isDilly ? 'rgba(59,76,192,0.04)' : bg,
      border: '1px solid ' + (isDilly ? 'rgba(59,76,192,0.12)' : border),
      transition: 'transform 150ms ease',
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: small ? 6 : 8,
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}>
      <p style={{ fontSize: small ? 9 : 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: small ? 1 : 2, textTransform: 'uppercase', margin: 0 }}>{label}</p>
      {value > 0 ? (
        <p style={{ fontFamily: 'Cinzel, serif', fontSize: small ? 16 : 28, fontWeight: 700, color: isDilly ? '#3B4CC0' : color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
          <AnimNum value={value} delay={delay} />
        </p>
      ) : (
        <div style={{ width: '50%', height: small ? 3 : 4, background: 'var(--border-main)', borderRadius: 2, margin: small ? '4px 0' : '8px 0' }}>
          <div style={{ height: '100%', borderRadius: 2, backgroundColor: isDilly ? '#3B4CC0' : color, width: '100%' }} />
        </div>
      )}
    </div>
  );
}

function MiniBar({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)' }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: 3, background: 'var(--border-main)', borderRadius: 2 }}>
        <div style={{ height: '100%', borderRadius: 2, backgroundColor: color, width: w + '%', transition: 'width 800ms cubic-bezier(0.16, 1, 0.3, 1)' }} />
      </div>
    </div>
  );
}

function smartCapitalize(name: string): string {
  // Known patterns that need special casing
  const special: Record<string, string> = {};
  return name.split(' ').map(word => {
    if (!word) return word;
    const lower = word.toLowerCase();
    // If the original already has mixed case like DeLoe or McLaughlin, keep it
    if (word.length > 2 && word !== word.toLowerCase() && word !== word.toUpperCase() && word.charAt(0) === word.charAt(0).toUpperCase()) {
      return word;
    }
    // Handle O'Brien, O'Connor
    if (lower.startsWith("o'") && word.length > 2) {
      return "O'" + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
    }
    // Handle D'Angelo
    if (lower.startsWith("d'") && word.length > 2) {
      return "D'" + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
    }
    // Handle Mc prefix (McDonald, McLaughlin)
    if (lower.startsWith('mc') && word.length > 2) {
      return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
    }
    // Handle Mac prefix (MacArthur) - only if original had it
    if (lower.startsWith('mac') && word.length > 3 && word.charAt(3) === word.charAt(3).toUpperCase()) {
      return 'Mac' + word.charAt(3).toUpperCase() + word.slice(4).toLowerCase();
    }
    // Standard: first letter upper, rest lower
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

export default function HomePage() {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [topJobs, setTopJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      apiFetch('/profile').then(setProfile),
      fetch('http://10.106.52.22:8000/profile/photo', {
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('dilly_token') || 'CDGRr6KLXjUEO7n6SUAmNolOsSl1ur1zWsXGleL5QHE') }
      }).then(r => r.ok ? r.blob() : null).then(b => { if (b) setPhotoUrl(URL.createObjectURL(b)); }).catch(() => {}),
      apiFetch('/v2/internships/stats').then(setStats),
      apiFetch('/v2/internships/feed?readiness=ready&limit=8').then(d => {
        const usStates = /^(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)$/i;
        const intl = /argentina|colombia|poland|ireland|london|berlin|paris|tokyo|singapore|sydney|mumbai|india|israel|amsterdam|dublin|hong kong|brazil|mexico|uk|europe|emea|apac|latam|germany|france|italy|spain/i;
        const filtered = (d.listings || []).filter((l: any) => {
          const st = (l.location_state || '').trim(); const ci = (l.location_city || '').toLowerCase();
          if (intl.test(ci + ' ' + st.toLowerCase())) return false;
          return l.work_mode === 'remote' || usStates.test(st) || (!ci && !st);
        });
        setTopJobs(filtered.slice(0, 6).map((l: any) => ({ id: l.id, title: l.title, company: l.company, location: [l.location_city, l.location_state].filter(Boolean).join(', ') })));
      }),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="skeleton" style={{ width: 40, height: 40, borderRadius: 20 }} /></div>;

  const cohorts = (Object.values(profile?.cohort_scores || {}) as any[]).sort((a: any, b: any) => b.dilly_score - a.dilly_score);
  const fullName = profile?.name || 'Student';
  const name = fullName;
  const smart = Math.round(profile?.overall_smart || 0);
  const grit = Math.round(profile?.overall_grit || 0);
  const build = Math.round(profile?.overall_build || 0);
  const dillyScore = Math.round(profile?.overall_dilly_score || 0);
  const majors = profile?.majors || [];
  const minors = profile?.minors || [];
  const strongestCohort = cohorts[0];
  const weakestCohort = cohorts[cohorts.length - 1];
  const strongestDim = build >= grit && build >= smart ? 'Build' : grit >= smart ? 'Grit' : 'Smart';
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '36px 44px' }}>

      {/* Profile header */}
      <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, paddingBottom: 28, borderBottom: '1px solid var(--border-main)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 180, height: 180, borderRadius: 90, background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            border: '3px solid var(--border-main)', overflow: 'hidden',
          }}>
            {photoUrl ? (
              <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 64, fontWeight: 600, color: 'var(--text-3)' }}>{name.charAt(0)}</span>
            )}
          </div>
          <div>
            <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 38, fontWeight: 700, color: 'var(--text-1)', letterSpacing: 0.5, margin: 0 }}>
              {smartCapitalize(name)}
            </h1>
            <div style={{ marginTop: 10 }}>
              <p style={{ fontFamily: 'Cinzel, serif', fontSize: 18, fontWeight: 600, color: '#3B4CC0', margin: 0, lineHeight: 1.3 }}>
                {majors.join(' & ')}
              </p>
              {minors.length > 0 && (
                <p style={{ fontFamily: 'Cinzel, serif', fontSize: 14, fontWeight: 700, color: '#C9A84C', margin: '4px 0 0', lineHeight: 1.3 }}>
                  {minors.join(' & ')}
                </p>
              )}
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>{profile?.school || 'University of Tampa'}</p>
          </div>
        </div>

        {/* Cohort Dilly scores in header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + cohorts.length + ', 1fr)', gap: 8 }}>
          {cohorts.map((c: any, i: number) => {
            const sc = Math.round(c.dilly_score);
            const col = sc >= 75 ? '#34C759' : sc >= 55 ? '#FF9F0A' : '#FF453A';
            const bg = sc >= 75 ? 'rgba(52,199,89,0.06)' : sc >= 55 ? 'rgba(255,159,10,0.06)' : 'rgba(255,69,58,0.06)';
            const border = sc >= 75 ? 'rgba(52,199,89,0.15)' : sc >= 55 ? 'rgba(255,159,10,0.15)' : 'rgba(255,69,58,0.15)';
            const shortName = c.cohort.replace('Software Engineering & CS', 'CS').replace('Data Science & Analytics', 'Data Sci').replace('Entrepreneurship & Innovation', 'Startup').replace('Physical Sciences & Math', 'Math').replace('Consulting & Strategy', 'Consulting').replace('Social Sciences & Nonprofit', 'Social Sci');
            return (
              <div key={c.cohort} className="animate-fade-in" style={{
                animationDelay: (300 + i * 80) + 'ms',
                padding: '24px 10px', minHeight: 190, textAlign: 'center' as const,
                border: '1px solid ' + border, borderRadius: 12, background: bg,
                display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'transform 150ms ease', cursor: 'pointer',
              }}
                onMouseEnter={(e: any) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e: any) => { e.currentTarget.style.transform = 'translateY(0)'; }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 2, textTransform: 'uppercase', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{shortName}</p>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 52, fontWeight: 700, color: col, margin: 0, fontStyle: 'italic' }}>
                  <AnimNum value={sc} delay={400 + i * 100} />
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>

        {/* Left: Dilly's advice + Ready jobs */}
        <div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 16px' }}>
            What Dilly recommends
          </h2>

          <DillyNote delay={300}>
            {greet}. You have <strong style={{ color: '#34C759' }}>{stats?.ready || 0} Ready matches</strong> right now.
            Your strongest dimension is <strong style={{ color: '#3B4CC0' }}>{strongestDim}</strong> — that's what sets you apart.
          </DillyNote>

          {strongestCohort && (
            <DillyNote delay={500}>
              Your <strong>{strongestCohort.cohort}</strong> score is <strong style={{ color: '#34C759' }}>{Math.round(strongestCohort.dilly_score)}</strong>.
              {weakestCohort && weakestCohort.cohort !== strongestCohort.cohort && (
                <> Your <strong>{weakestCohort.cohort}</strong> at <strong style={{ color: '#FF9F0A' }}>{Math.round(weakestCohort.dilly_score)}</strong> has the most room to grow. </>
              )}
              <button onClick={() => router.push('/scores')} style={{ color: '#3B4CC0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>View genome &rarr;</button>
            </DillyNote>
          )}

          <DillyNote delay={700}>
            {topJobs.length > 0 ? <>I found roles you're ready for. Apply this week — don't wait.</> : <>Upload your resume and I'll find matches.</>}
          </DillyNote>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: 1.5, textTransform: 'uppercase', margin: 0 }}>Apply this week</p>
              <button onClick={() => router.push('/jobs')} style={{ fontSize: 11, color: '#3B4CC0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>View all &rarr;</button>
            </div>
            {topJobs.map((job, i) => (
              <div key={job.id} className="animate-fade-in" style={{
                animationDelay: (800 + i * 60) + 'ms',
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 4,
                cursor: 'pointer', transition: 'background 150ms ease',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onClick={() => router.push('/jobs')}>
                <CompanyLogo company={job.company} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '1px 0 0' }}>{job.company}</p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#34C759', background: 'rgba(52,199,89,0.08)', padding: '2px 8px', borderRadius: 3 }}>Ready</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Cohort cards with mini S/G/B */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 1.5, textTransform: 'uppercase', margin: 0 }}>
              Cohort breakdown
            </h2>
            <button onClick={() => router.push('/scores')} style={{ fontSize: 11, color: '#3B4CC0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>View genome &rarr;</button>
          </div>

          {/* Per-cohort grids */}
          {cohorts.map((c: any, i: number) => {
            const sc = Math.round(c.dilly_score);
            const dillyCol = sc >= 75 ? '#34C759' : sc >= 55 ? '#FF9F0A' : '#FF453A';
            return (
              <div key={c.cohort} className="animate-fade-in" style={{ animationDelay: (400 + i * 120) + 'ms', marginBottom: 24, cursor: 'pointer' }} onClick={() => router.push('/scores')}>
                <p style={{ fontFamily: 'Cinzel, serif', fontSize: 20, fontWeight: 700, color: 'rgba(130,170,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' as const, margin: '0 0 12px' }}>
                  {c.cohort}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <CohortSGBCard label="Smart" value={Math.round(c.smart)} delay={500 + i * 120} small />
                  <CohortSGBCard label="Grit" value={Math.round(c.grit)} delay={600 + i * 120} small />
                  <CohortSGBCard label="Build" value={Math.round(c.build)} delay={700 + i * 120} small />
                </div>
              </div>
            );
          })}

          {/* Overall S/G/B */}
          <div className="animate-fade-in" style={{ animationDelay: (400 + cohorts.length * 120 + 100) + 'ms', marginTop: 24 }}>
            <p style={{ fontFamily: 'Cinzel, serif', fontSize: 20, fontWeight: 700, color: 'rgba(130,170,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' as const, margin: '0 0 12px' }}>
              Overall
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <CohortSGBCard label="Smart" value={smart} delay={400 + cohorts.length * 120 + 200} small />
              <CohortSGBCard label="Grit" value={grit} delay={400 + cohorts.length * 120 + 300} small />
              <CohortSGBCard label="Build" value={build} delay={400 + cohorts.length * 120 + 400} small />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}