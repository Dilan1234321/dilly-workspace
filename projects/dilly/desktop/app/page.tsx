'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function detectMobile(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && window.innerWidth < 1024;
}

export default function Root() {
  const router = useRouter();
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (detectMobile()) {
      setMobile(true);
      return;
    }
    const token = localStorage.getItem('dilly_token');
    router.replace(token ? '/home' : '/onboarding');
  }, [router]);

  if (mobile) return <MobileGate />;

  // Brief branded loading shown while auth check + redirect fires
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4' }}>
      <p style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: 700, color: '#2B3A8E', letterSpacing: -0.5 }}>dilly</p>
    </div>
  );
}

function MobileGate() {
  return (
    <div style={{
      height: '100vh', background: '#f8f7f4',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '0 32px', textAlign: 'center',
    }}>
      <p style={{ fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700, color: '#2B3A8E', letterSpacing: -0.5, margin: '0 0 32px' }}>dilly</p>

      <div style={{ width: 64, height: 64, borderRadius: 16, background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2B3A8E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111', margin: '0 0 10px', lineHeight: 1.2 }}>
        Dilly is a desktop app
      </h1>
      <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.65, margin: '0 0 36px', maxWidth: 340 }}>
        Open this on your laptop or PC for the full Career Center experience — resume scoring, internship matching, and your AI coach.
      </p>

      <a
        href="https://testflight.apple.com/join/REPLACE_WITH_YOUR_CODE"
        style={{
          display: 'inline-block', padding: '14px 32px', borderRadius: 12,
          background: '#2B3A8E', color: 'white', fontSize: 15, fontWeight: 700,
          textDecoration: 'none', marginBottom: 12, letterSpacing: -0.2,
        }}
      >
        Get the iOS app
      </a>
      <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>Available via TestFlight · Android coming soon</p>

      <style>{`
        @keyframes mg-rise { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        body > div > * { animation: mg-rise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      `}</style>
    </div>
  );
}
