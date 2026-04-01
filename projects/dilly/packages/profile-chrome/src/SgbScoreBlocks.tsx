'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { scoreBandForValue } from './scoreColors';
import './styles.css';

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

export type SgbScoreBlocksProps = {
  smart: number;
  grit: number;
  build: number;
  staggerDelay?: number;
};

export function SgbScoreBlocks({ smart, grit, build, staggerDelay = 0 }: SgbScoreBlocksProps) {
  const dims: { key: 'smart' | 'grit' | 'build'; label: string; value: number; delay: number }[] = [
    { key: 'smart', label: 'Smart', value: smart, delay: staggerDelay },
    { key: 'grit', label: 'Grit', value: grit, delay: staggerDelay + 90 },
    { key: 'build', label: 'Build', value: build, delay: staggerDelay + 180 },
  ];

  return (
    <div className="dilly-profile-chrome__sgb">
      {dims.map(({ key, label, value, delay }) => {
        const band = scoreBandForValue(value);
        return (
          <div
            key={key}
            className="dilly-profile-chrome__sgb-block animate-fade-in"
            style={
              {
                ['--sb-color' as string]: band.color,
                ['--sb-bg' as string]: band.bg,
                ['--sb-border' as string]: band.border,
                animationDelay: `${delay}ms`,
              } as CSSProperties
            }
          >
            <p className="dilly-profile-chrome__sgb-label">{label}</p>
            <p className="dilly-profile-chrome__sgb-value">
              <AnimNum value={Math.round(value)} delay={delay + 120} />
            </p>
          </div>
        );
      })}
    </div>
  );
}
