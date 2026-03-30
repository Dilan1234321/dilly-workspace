'use client';
import { useState, useEffect, useMemo } from 'react';
import { getScoreColor } from '@/lib/scores';

interface Student {
  rank: number;
  name: string;
  school: string;
  dilly_score: number;
  smart: number;
  grit: number;
  build: number;
  cohort: string;
  isYou?: boolean;
}

type SortCol = 'rank' | 'dilly' | 'smart' | 'grit' | 'build';
type SortDir = 'asc' | 'desc';

function SortArrow({ col, active, dir }: { col: SortCol; active: SortCol; dir: SortDir }) {
  if (col !== active) {
    return (
      <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 3 }}>↕</span>
    );
  }
  return (
    <span style={{ fontSize: 9, marginLeft: 3, color: '#2B3A8E' }}>{dir === 'asc' ? '↑' : '↓'}</span>
  );
}

export default function LeaderboardPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filter, setFilter] = useState<'all' | 'school' | 'cohort'>('all');
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    const demo: Student[] = [
      { rank: 1,  name: 'Kate H.',      school: 'UTampa', dilly_score: 94, smart: 73, grit: 85, build: 77, cohort: 'Management & Operations' },
      { rank: 2,  name: 'Kylee R.',     school: 'UTampa', dilly_score: 89, smart: 79, grit: 87, build: 82, cohort: 'Marketing & Advertising' },
      { rank: 3,  name: 'Victoria L.',  school: 'UTampa', dilly_score: 87, smart: 79, grit: 84, build: 89, cohort: 'Marketing & Advertising' },
      { rank: 4,  name: 'Dilan K.',     school: 'UTampa', dilly_score: 85, smart: 79, grit: 84, build: 92, cohort: 'Data Science & Analytics', isYou: true },
      { rank: 5,  name: 'Tyler S.',     school: 'UTampa', dilly_score: 83, smart: 77, grit: 84, build: 67, cohort: 'Economics & Public Policy' },
      { rank: 6,  name: 'Bridget K.',   school: 'UTampa', dilly_score: 82, smart: 88, grit: 83, build: 79, cohort: 'Life Sciences & Research' },
      { rank: 7,  name: 'Abbigail S.',  school: 'UTampa', dilly_score: 80, smart: 71, grit: 85, build: 64, cohort: 'Entrepreneurship' },
      { rank: 8,  name: 'Jaeden P.',    school: 'UTampa', dilly_score: 78, smart: 74, grit: 68, build: 79, cohort: 'Software Engineering & CS' },
      { rank: 9,  name: 'Sydney F.',    school: 'UTampa', dilly_score: 76, smart: 74, grit: 83, build: 69, cohort: 'Marketing & Advertising' },
      { rank: 10, name: 'Gabriel M.',   school: 'UTampa', dilly_score: 74, smart: 79, grit: 71, build: 53, cohort: 'Cybersecurity & IT' },
      { rank: 11, name: 'Michael Z.',   school: 'UTampa', dilly_score: 72, smart: 73, grit: 68, build: 53, cohort: 'Data Science & Analytics' },
      { rank: 12, name: 'Aldana F.',    school: 'UTampa', dilly_score: 70, smart: 74, grit: 68, build: 35, cohort: 'Cybersecurity & IT' },
    ];
    setStudents(demo);
    setLoading(false);
  }, []);

  const you = students.find(s => s.isYou);

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'rank' ? 'asc' : 'desc');
    }
  }

  const sorted = useMemo(() => {
    const list = [...students];
    list.sort((a, b) => {
      const valA = sortCol === 'rank' ? a.rank : sortCol === 'dilly' ? a.dilly_score : a[sortCol];
      const valB = sortCol === 'rank' ? b.rank : sortCol === 'dilly' ? b.dilly_score : b[sortCol];
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [students, sortCol, sortDir]);

  const topPct = you ? Math.round(you.rank / students.length * 100) : 0;
  const aheadPct = 100 - topPct;

  // Column header component
  function ColHeader({ col, label, right }: { col: SortCol; label: string; right?: boolean }) {
    return (
      <button
        onClick={() => handleSort(col)}
        className={`text-[10px] font-bold text-txt-3 uppercase tracking-wider flex items-center gap-0.5 transition-colors hover:text-txt-2 ${right ? 'justify-end ml-auto' : ''}`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {label}
        <SortArrow col={col} active={sortCol} dir={sortDir} />
      </button>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 24, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 0.5 }}>Leaderboard</h1>
            <p className="text-[13px] text-txt-3 mt-1">See how you stack up against peers</p>
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}>
            {(['all', 'school', 'cohort'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all capitalize"
                style={{
                  background: filter === f ? '#2B3A8E' : 'transparent',
                  color: filter === f ? 'white' : 'var(--text-3)',
                }}>
                {f === 'all' ? 'Everyone' : f === 'school' ? 'My school' : 'My cohort'}
              </button>
            ))}
          </div>
        </div>

        {/* Your position highlight */}
        {you && (
          <div className="border rounded-xl p-5 mb-6 flex items-center gap-6"
            style={{ background: 'rgba(59,76,192,0.04)', border: '1px solid rgba(59,76,192,0.18)' }}>
            <div className="text-center flex-shrink-0">
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 42, fontWeight: 700, fontStyle: 'italic', color: '#2B3A8E', lineHeight: 1 }}>#{you.rank}</p>
              <p className="text-[10px] text-txt-3 uppercase tracking-wider font-bold mt-1">Your rank</p>
            </div>
            <div className="h-12 w-px bg-border-main flex-shrink-0" />
            <div className="flex-1 flex items-center gap-8">
              <div>
                <p className="text-[11px] text-txt-3 mb-0.5">Dilly Score</p>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 28, fontWeight: 700, fontStyle: 'italic', color: '#2B3A8E', lineHeight: 1 }}>{you.dilly_score}</p>
              </div>
              <div>
                <p className="text-[11px] text-txt-3 mb-0.5">Smart</p>
                <p className="text-[22px] font-bold font-mono" style={{ color: getScoreColor(you.smart), lineHeight: 1 }}>{you.smart}</p>
              </div>
              <div>
                <p className="text-[11px] text-txt-3 mb-0.5">Grit</p>
                <p className="text-[22px] font-bold font-mono" style={{ color: getScoreColor(you.grit), lineHeight: 1 }}>{you.grit}</p>
              </div>
              <div>
                <p className="text-[11px] text-txt-3 mb-0.5">Build</p>
                <p className="text-[22px] font-bold font-mono" style={{ color: getScoreColor(you.build), lineHeight: 1 }}>{you.build}</p>
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-[22px] font-bold font-mono text-dilly-blue">Top {topPct}%</p>
              <p className="text-[10px] text-txt-3 mt-0.5">ahead of {aheadPct}% at UTampa</p>
              <p className="text-[10px] text-txt-3">({students.length} students total)</p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-surface-1 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-main)' }}>
          {/* Header */}
          <div className="grid grid-cols-[60px_1fr_130px_90px_90px_90px_90px] px-5 py-3 border-b border-border-main">
            <ColHeader col="rank" label="Rank" />
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wider">Student</span>
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wider">Cohort</span>
            <div className="flex justify-end"><ColHeader col="dilly" label="Dilly" right /></div>
            <div className="flex justify-end"><ColHeader col="smart" label="Smart" right /></div>
            <div className="flex justify-end"><ColHeader col="grit" label="Grit" right /></div>
            <div className="flex justify-end"><ColHeader col="build" label="Build" right /></div>
          </div>

          {/* Rows */}
          {sorted.map((s, i) => (
            <div key={s.rank}
              className="grid grid-cols-[60px_1fr_130px_90px_90px_90px_90px] px-5 py-3 transition-colors"
              style={{
                background: s.isYou ? 'rgba(59,76,192,0.035)' : undefined,
                borderLeft: s.isYou ? '2px solid #2B3A8E' : '2px solid transparent',
                borderBottom: i < sorted.length - 1 ? '1px solid var(--border-main)' : 'none',
              }}
              onMouseEnter={e => { if (!s.isYou) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (!s.isYou) e.currentTarget.style.background = ''; }}
            >
              {/* Rank */}
              <span className="text-[14px] font-bold font-mono self-center"
                style={{ color: s.rank <= 3 ? '#2B3A8E' : 'var(--text-2)' }}>
                {s.rank <= 3 ? ['', '🥇', '🥈', '🥉'][s.rank] : s.rank}
              </span>

              {/* Student */}
              <div className="self-center">
                <p className="text-[13px] font-semibold" style={{ color: s.isYou ? '#2B3A8E' : 'var(--text-1)' }}>
                  {s.name} {s.isYou && <span className="text-[10px] font-normal ml-1" style={{ color: '#2B3A8E' }}>(you)</span>}
                </p>
                <p className="text-[10px] text-txt-3">{s.school}</p>
              </div>

              {/* Cohort */}
              <span className="text-[11px] text-txt-2 self-center truncate pr-2">{s.cohort.split(' ')[0]}</span>

              {/* Dilly Score — serif italic, gold */}
              <span className="self-center text-right"
                style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 17, fontWeight: 700, fontStyle: 'italic', color: '#2B3A8E' }}>
                {s.dilly_score}
              </span>

              {/* Smart — consistent color scale */}
              <span className="text-[13px] font-mono self-center text-right font-bold"
                style={{ color: getScoreColor(s.smart) }}>
                {s.smart}
              </span>

              {/* Grit */}
              <span className="text-[13px] font-mono self-center text-right font-bold"
                style={{ color: getScoreColor(s.grit) }}>
                {s.grit}
              </span>

              {/* Build */}
              <span className="text-[13px] font-mono self-center text-right font-bold"
                style={{ color: getScoreColor(s.build) }}>
                {s.build}
              </span>
            </div>
          ))}
        </div>

        {/* Score legend */}
        <div className="flex gap-4 mt-3 justify-end">
          {[{ label: 'Strong', color: '#34C759' }, { label: 'Developing', color: '#FF9F0A' }, { label: 'Gap', color: '#FF453A' }].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
              <span className="text-[10px] text-txt-3 font-medium">≥{l.label === 'Strong' ? '80' : l.label === 'Developing' ? '60' : '<60'} {l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
