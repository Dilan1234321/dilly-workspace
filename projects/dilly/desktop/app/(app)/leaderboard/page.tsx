'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

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

export default function LeaderboardPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filter, setFilter] = useState<'all' | 'school' | 'cohort'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load from API - for now use demo data
    const demo: Student[] = [
      { rank: 1, name: 'Kate H.', school: 'UTampa', dilly_score: 94, smart: 73, grit: 85, build: 77, cohort: 'Management & Operations' },
      { rank: 2, name: 'Kylee R.', school: 'UTampa', dilly_score: 89, smart: 79, grit: 87, build: 82, cohort: 'Marketing & Advertising' },
      { rank: 3, name: 'Victoria L.', school: 'UTampa', dilly_score: 87, smart: 79, grit: 84, build: 89, cohort: 'Marketing & Advertising' },
      { rank: 4, name: 'Dilan K.', school: 'UTampa', dilly_score: 85, smart: 79, grit: 84, build: 92, cohort: 'Data Science & Analytics', isYou: true },
      { rank: 5, name: 'Tyler S.', school: 'UTampa', dilly_score: 83, smart: 77, grit: 84, build: 67, cohort: 'Economics & Public Policy' },
      { rank: 6, name: 'Bridget K.', school: 'UTampa', dilly_score: 82, smart: 88, grit: 83, build: 79, cohort: 'Life Sciences & Research' },
      { rank: 7, name: 'Abbigail S.', school: 'UTampa', dilly_score: 80, smart: 71, grit: 85, build: 64, cohort: 'Entrepreneurship' },
      { rank: 8, name: 'Jaeden P.', school: 'UTampa', dilly_score: 78, smart: 74, grit: 68, build: 79, cohort: 'Software Engineering & CS' },
      { rank: 9, name: 'Sydney F.', school: 'UTampa', dilly_score: 76, smart: 74, grit: 83, build: 69, cohort: 'Marketing & Advertising' },
      { rank: 10, name: 'Gabriel M.', school: 'UTampa', dilly_score: 74, smart: 79, grit: 71, build: 53, cohort: 'Cybersecurity & IT' },
      { rank: 11, name: 'Michael Z.', school: 'UTampa', dilly_score: 72, smart: 73, grit: 68, build: 53, cohort: 'Data Science & Analytics' },
      { rank: 12, name: 'Aldana F.', school: 'UTampa', dilly_score: 70, smart: 74, grit: 68, build: 35, cohort: 'Cybersecurity & IT' },
    ];
    setStudents(demo);
    setLoading(false);
  }, []);

  const you = students.find(s => s.isYou);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 24, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 0.5 }}>Leaderboard</h1>
            <p className="text-[13px] text-txt-3 mt-1">See how you stack up</p>
          </div>
          <div className="flex gap-1">
            {(['all', 'school', 'cohort'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all capitalize
                  ${filter === f ? 'bg-dilly-blue text-white' : 'text-txt-3 hover:text-txt-2 hover:bg-surface-2'}`}>
                {f === 'all' ? 'Everyone' : f === 'school' ? 'My school' : 'My cohort'}
              </button>
            ))}
          </div>
        </div>

        {/* Your position highlight */}
        {you && (
          <div className="bg-dilly-blue/[0.06] border border-dilly-blue/20 rounded-xl p-5 mb-6 flex items-center gap-6">
            <div className="text-center">
              <p className="text-[36px] font-bold font-mono text-dilly-blue">#{you.rank}</p>
              <p className="text-[10px] text-txt-3 uppercase tracking-wider font-bold">Your rank</p>
            </div>
            <div className="h-12 w-px bg-border-main" />
            <div className="flex-1 flex items-center gap-8">
              <div>
                <p className="text-[11px] text-txt-3">Dilly Score</p>
                <p className="text-[24px] font-bold font-mono text-dilly-gold">{you.dilly_score}</p>
              </div>
              <div>
                <p className="text-[11px] text-txt-3">Smart</p>
                <p className="text-[20px] font-bold font-mono text-dilly-blue">{you.smart}</p>
              </div>
              <div>
                <p className="text-[11px] text-txt-3">Grit</p>
                <p className="text-[20px] font-bold font-mono text-dilly-gold">{you.grit}</p>
              </div>
              <div>
                <p className="text-[11px] text-txt-3">Build</p>
                <p className="text-[20px] font-bold font-mono text-ready">{you.build}</p>
              </div>
            </div>
            <div>
              <p className="text-[11px] text-txt-3">Top</p>
              <p className="text-[20px] font-bold font-mono text-dilly-blue">{Math.round(you.rank / students.length * 100)}%</p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-surface-1 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[60px_1fr_120px_80px_80px_80px_80px] px-5 py-3 border-b border-border-main">
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wider">Rank</span>
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wider">Student</span>
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wider">Cohort</span>
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wider text-right">Dilly</span>
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wider text-right">Smart</span>
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wider text-right">Grit</span>
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wider text-right">Build</span>
          </div>

          {/* Rows */}
          {students.map((s, i) => (
            <div key={i}
              className={`grid grid-cols-[60px_1fr_120px_80px_80px_80px_80px] px-5 py-3 transition-colors
                ${s.isYou ? 'bg-dilly-blue/[0.04] border-l-2 border-l-dilly-blue' : 'hover:bg-surface-2/50 border-l-2 border-l-transparent'}
                ${i < students.length - 1 ? 'border-b border-border-main' : ''}`}>
              <span className={`text-[14px] font-bold font-mono ${s.rank <= 3 ? 'text-dilly-gold' : 'text-txt-2'}`}>
                {s.rank <= 3 ? ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'][s.rank] : s.rank}
              </span>
              <div>
                <p className={`text-[13px] font-semibold ${s.isYou ? 'text-dilly-blue' : 'text-txt-1'}`}>
                  {s.name} {s.isYou && <span className="text-[10px] text-dilly-blue font-normal ml-1">(you)</span>}
                </p>
                <p className="text-[10px] text-txt-3">{s.school}</p>
              </div>
              <span className="text-[11px] text-txt-2 truncate self-center">{s.cohort.replace(' & ', ' & ').split(' ')[0]}</span>
              <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, fontWeight: 700, color: '#C9A84C', textAlign: 'right', alignSelf: 'center', fontStyle: 'italic' }}>{s.dilly_score}</span>
              <span className="text-[13px] font-mono text-dilly-blue text-right self-center">{s.smart}</span>
              <span className="text-[13px] font-mono text-dilly-gold text-right self-center">{s.grit}</span>
              <span className="text-[13px] font-mono text-ready text-right self-center">{s.build}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}