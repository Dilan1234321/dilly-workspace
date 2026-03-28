'use client';

interface CohortScore {
  cohort: string;
  level: string;
  smart: number;
  grit: number;
  build: number;
  dilly_score: number;
}

interface Props {
  cohorts: CohortScore[];
  activeCohort: string | null;
  onSelect: (cohort: string | null) => void;
  matchCounts: Record<string, number>;
}

export default function CohortStrip({ cohorts, activeCohort, onSelect, matchCounts }: Props) {
  if (!cohorts.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      <button
        onClick={() => onSelect(null)}
        className={`flex-shrink-0 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all duration-150
          ${!activeCohort
            ? 'bg-dilly-blue text-white shadow-[0_2px_8px_rgba(59,76,192,0.3)]'
            : 'bg-surface-2 text-txt-3 hover:text-txt-2 hover:bg-surface-2/80'
          }`}
      >
        All
      </button>
      {cohorts.map(c => {
        const active = activeCohort === c.cohort;
        const score = Math.round(c.dilly_score);
        const color = score >= 75 ? '#34C759' : score >= 55 ? '#FF9F0A' : '#FF453A';
        const count = matchCounts[c.cohort] || 0;
        const levelTag = c.level === 'major' ? 'M' : c.level === 'minor' ? 'm' : 'i';

        return (
          <button
            key={c.cohort}
            onClick={() => onSelect(active ? null : c.cohort)}
            className={`flex-shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-lg transition-all duration-150
              ${active
                ? 'bg-surface-2 ring-1 shadow-[0_2px_8px_rgba(0,0,0,0.15)]'
                : 'bg-surface-1 hover:bg-surface-2 border border-transparent hover:border-border-main'
              }`}
            style={active ? { borderColor: color + '40', boxShadow: `0 0 0 1px ${color}30` } : {}}
          >
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-txt-3 uppercase tracking-wider bg-surface-2 w-4 h-4 rounded flex items-center justify-center">{levelTag}</span>
                <span className={`text-[12px] font-semibold ${active ? 'text-txt-1' : 'text-txt-2'} whitespace-nowrap`}>
                  {c.cohort.replace(' & ', ' & ')}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[14px] font-bold font-mono tabular-nums" style={{ color }}>{score}</span>
              <span className="text-[9px] text-txt-3 -mt-0.5">{count} jobs</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}