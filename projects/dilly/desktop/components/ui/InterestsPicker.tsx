'use client';

import { ALL_COHORTS, getCohortColor } from '@/lib/cohorts';

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
  /** Compact = smaller chips, no subtitle. Default: false */
  compact?: boolean;
}

export function InterestsPicker({ selected, onChange, compact = false }: Props) {
  function toggle(cohort: string) {
    if (selected.includes(cohort)) {
      onChange(selected.filter(c => c !== cohort));
    } else {
      onChange([...selected, cohort]);
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 6 : 8 }}>
      {ALL_COHORTS.map(c => {
        const on = selected.includes(c);
        const color = getCohortColor(c);
        return (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: compact ? '4px 10px' : '5px 12px',
              borderRadius: 20,
              fontSize: compact ? 11 : 12,
              fontWeight: on ? 600 : 400,
              cursor: 'pointer',
              border: `1px solid ${on ? color : 'var(--border-main)'}`,
              background: on ? `${color}15` : 'transparent',
              color: on ? color : 'var(--text-2)',
              transition: 'all 0.12s',
              lineHeight: 1.4,
            }}
            onMouseEnter={e => {
              if (!on) {
                e.currentTarget.style.borderColor = `${color}60`;
                e.currentTarget.style.color = color;
              }
            }}
            onMouseLeave={e => {
              if (!on) {
                e.currentTarget.style.borderColor = 'var(--border-main)';
                e.currentTarget.style.color = 'var(--text-2)';
              }
            }}
          >
            <span style={{ width: compact ? 5 : 6, height: compact ? 5 : 6, borderRadius: '50%', background: color, flexShrink: 0, opacity: on ? 1 : 0.4 }} />
            {c}
          </button>
        );
      })}
    </div>
  );
}
