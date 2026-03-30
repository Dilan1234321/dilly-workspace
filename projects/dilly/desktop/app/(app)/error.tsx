'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: 32 }}>
      <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Something went wrong loading this page.</p>
      <button onClick={reset} style={{ fontSize: 12, padding: '6px 16px', borderRadius: 8, background: 'var(--surface-1)', border: '1px solid var(--border-main)', color: 'var(--text-2)', cursor: 'pointer' }}>
        Try again
      </button>
    </div>
  );
}
