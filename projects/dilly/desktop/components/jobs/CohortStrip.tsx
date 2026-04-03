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
  activeCohorts: Set<string>;
  onToggle: (cohort: string) => void;
  onClearAll: () => void;
  matchCounts: Record<string, number>;
}

export default function CohortStrip({ cohorts, activeCohorts, onToggle, onClearAll, matchCounts }: Props) {
  if (!cohorts.length) return null;
  const anyActive = activeCohorts.size > 0;

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      <button
        onClick={onClearAll}
        className={`flex-shrink-0 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all duration-150
          ${!anyActive
            ? 'bg-dilly-blue text-white shadow-[0_2px_8px_rgba(59,76,192,0.3)]'
            : 'bg-surface-2 text-txt-3 hover:text-txt-2 hover:bg-surface-2/80'
          }`}
      >
        All
      </button>
      {cohorts.map(c => {
        const active = activeCohorts.has(c.cohort);
        const score = Math.round(c.dilly_score);
        const color = score >= 75 ? '#34C759' : score >= 55 ? '#FF9F0A' : '#FF453A';
        const count = matchCounts[c.cohort] || 0;
        const levelTag = c.level === 'major' ? 'M' : c.level === 'minor' ? 'm' : 'i';

        return (
          <button
            key={c.cohort}
            onClick={() => onToggle(c.cohort)}
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
      {anyActive && (
        <div className="flex items-center gap-1.5 mt-1.5 ml-1 flex-wrap">
          {cohorts.filter(c => activeCohorts.has(c.cohort)).map(c => {
            const sc = Math.round(c.dilly_score);
            const col = sc >= 75 ? '#34C759' : sc >= 55 ? '#FF9F0A' : '#FF453A';
            const short = c.cohort.replace('Software Engineering & CS', 'CS').replace('Data Science & Analytics', 'Data Sci').replace('Entrepreneurship & Innovation', 'Startup').replace('Physical Sciences & Math', 'Math').replace('Consulting & Strategy', 'Consulting').replace('Social Sciences & Nonprofit', 'Social Sci');
            return (
              <span key={c.cohort} style={{ color: col, background: col + '14', border: `1px solid ${col}30` }}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full">
                {short}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
