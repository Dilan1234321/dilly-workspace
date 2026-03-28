'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Parity with mobile `/onboarding/upload` — deep-link to the resume step. */
export default function OnboardingUploadRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/onboarding?step=resume');
  }, [router]);
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-0)',
      }}
    >
      <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Opening resume upload…</p>
    </div>
  );
}
