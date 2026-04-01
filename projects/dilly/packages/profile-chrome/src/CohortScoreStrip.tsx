'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { scoreBandForValue } from './scoreColors';
import './styles.css';

export type CohortRow = { cohort: string; dilly_score: number };

function shortCohortLabel(name: string): string {
  return name
    .replace('Software Engineering & CS', 'CS')
    .replace('Data Science & Analytics', 'Data Sci')
    .replace('Entrepreneurship & Innovation', 'Startup')
    .replace('Physical Sciences & Math', 'Math & Phys')
    .replace('Consulting & Strategy', 'Consulting')
    .replace('Social Sciences & Nonprofit', 'Social Sci');
}

function AnimNum({ value, delay = 0 }: { value: number; delay?: number }) {
  const [d, setD] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const s = performance.now();
      function tick(now: number) {
        const p = Math.min((now - s) / 900, 1);
        setD(Math.round((1 - Math.pow(1 - p, 3)) * value));
        if (p < 1) ref.current = requestAnimationFrame(tick);
      }
      ref.current = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(ref.current);
    };
  }, [value, delay]);
  return <>{d}</>;
}

export type CohortScoreStripProps = {
  cohorts: CohortRow[];
  emptyMessage?: string;
};

export function CohortScoreStrip({ cohorts, emptyMessage }: CohortScoreStripProps) {
  if (!cohorts.length) {
    return (
      <div className="dilly-profile-chrome__cohorts" style={{ justifyContent: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--dpc-subtle)', maxWidth: 280, textAlign: 'right', lineHeight: 1.5 }}>
          {emptyMessage ?? 'Cohort scores appear after your profile is scored.'}
        </p>
      </div>
    );
  }

  return (
    <div className="dilly-profile-chrome__cohorts">
      {cohorts.map((c, i) => {
        const sc = Math.round(c.dilly_score);
        const band = scoreBandForValue(sc);
        return (
          <div
            key={c.cohort}
            className="dilly-profile-chrome__cohort-card animate-fade-in"
            style={
              {
                ['--cb-color' as string]: band.color,
                ['--cb-bg' as string]: band.bg,
                ['--cb-border' as string]: band.border,
                animationDelay: `${120 + i * 70}ms`,
              } as CSSProperties
            }
          >
            <p className="dilly-profile-chrome__cohort-label" title={c.cohort}>
              {shortCohortLabel(c.cohort)}
            </p>
            <p className="dilly-profile-chrome__cohort-value">
              <AnimNum value={sc} delay={180 + i * 80} />
            </p>
          </div>
        );
      })}
    </div>
  );
}
