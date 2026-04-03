'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { dilly } from '@/lib/dilly';
import { useProfile } from '../layout';

interface CohortScore {
  cohort: string; level: string; field: string;
  smart: number; grit: number; build: number;
  dilly_score: number; weight: number;
}

type SimScores = Record<string, { smart: number; grit: number; build: number }>;

const SHORT_NAMES: [string, string][] = [
  ['Software Engineering & CS', 'CS'],
  ['Data Science & Analytics', 'Data Science'],
  ['Entrepreneurship & Innovation', 'Startup'],
  ['Physical Sciences & Math', 'Math & Physics'],
  ['Consulting & Strategy', 'Consulting'],
  ['Social Sciences & Nonprofit', 'Social Sci'],
  ['Architecture & Urban Planning', 'Architecture'],
  ['Public Administration & Government', 'Public Admin'],
  ['Foreign Languages & Linguistics', 'Languages'],
  ['Marketing & Advertising', 'Marketing'],
  ['Finance & Accounting', 'Finance'],
  ['Management & Operations', 'Mgmt & Ops'],
  ['Healthcare & Clinical', 'Healthcare'],
  ['Life Sciences & Research', 'Life Sciences'],
  ['Cybersecurity & IT', 'Cybersecurity'],
  ['Media & Communications', 'Media'],
  ['Law & Government', 'Law'],
  ['Education & Teaching', 'Education'],
  ['Fashion & Apparel', 'Fashion'],
  ['Real Estate & Construction', 'Real Estate'],
  ['Mechanical & Aerospace Engineering', 'Mech & Aero'],
  ['Electrical & Computer Engineering', 'Elec & CompE'],
  ['Civil & Environmental Engineering', 'Civil & Env'],
  ['Chemical & Biomedical Engineering', 'Chem & BioE'],
  ['Biotech & Pharmaceutical', 'Biotech'],
  ['Economics & Public Policy', 'Economics'],
  ['Industrial & Systems Engineering', 'Ind & Sys Eng'],
];

function shorten(name: string, maxLen = 18) {
  for (const [full, short] of SHORT_NAMES) {
    if (name.includes(full)) { name = name.replace(full, short); break; }
  }
  if (name.length > maxLen) name = name.slice(0, maxLen) + '…';
  return name;
}

export default function ScoresPage() {
  const { profile } = useProfile();
  const router = useRouter();
  const cohorts = (Object.values(profile.cohort_scores || {}) as CohortScore[]).filter(c => c && c.cohort);
  const overall = { smart: profile.overall_smart || 0, grit: profile.overall_grit || 0, build: profile.overall_build || 0, dilly: profile.overall_dilly_score || 0 };
  const [stats, setStats] = useState<any>(null);
  const [hoveredCohort, setHoveredCohort] = useState<string | null>(null);
  const [expandedCohort, setExpandedCohort] = useState<string | null>(null);

  // Per-cohort sim scores: initialized from each cohort's actual scores
  const [simCohortScores, setSimCohortScores] = useState<SimScores>({});
  const simInit = useRef(false);

  // Initialise once cohorts are loaded
  useEffect(() => {
    if (!simInit.current && cohorts.length > 0) {
      const init: SimScores = {};
      cohorts.forEach(c => { init[c.cohort] = { smart: c.smart, grit: c.grit, build: c.build }; });
      setSimCohortScores(init);
      simInit.current = true;
    }
  }, [cohorts.length]); // eslint-disable-line

  // Helpers
  const getSimFor = (c: CohortScore) => simCohortScores[c.cohort] ?? { smart: c.smart, grit: c.grit, build: c.build };

  const setSimDim = (cohort: string, dim: 'smart' | 'grit' | 'build', val: number) => {
    setSimCohortScores(prev => ({
      ...prev,
      [cohort]: { ...(prev[cohort] ?? { smart: 0, grit: 0, build: 0 }), [dim]: val },
    }));
  };

  const cohortHasChanges = (c: CohortScore) => {
    const s = simCohortScores[c.cohort];
    if (!s) return false;
    return Math.round(s.smart) !== Math.round(c.smart)
      || Math.round(s.grit) !== Math.round(c.grit)
      || Math.round(s.build) !== Math.round(c.build);
  };

  const resetCohort = (c: CohortScore) =>
    setSimCohortScores(prev => ({ ...prev, [c.cohort]: { smart: c.smart, grit: c.grit, build: c.build } }));

  const resetAll = () => {
    const init: SimScores = {};
    cohorts.forEach(c => { init[c.cohort] = { smart: c.smart, grit: c.grit, build: c.build }; });
    setSimCohortScores(init);
  };

  const anyChanges = cohorts.some(c => cohortHasChanges(c));

  // Weighted-average delta across cohorts (for center score + match estimate)
  const avgDelta = cohorts.length > 0
    ? cohorts.reduce((sum, c) => {
        const s = getSimFor(c);
        return sum + (s.smart - c.smart) * 0.40 + (s.grit - c.grit) * 0.35 + (s.build - c.build) * 0.25;
      }, 0) / cohorts.length
    : 0;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState(600);

  useEffect(() => {
    dilly.get('/v2/internships/stats').then(setStats).catch(() => {});
  }, []);

  // Resize canvas to fit left column
  useEffect(() => {
    function resize() {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        const availH = window.innerHeight - 360;
        setCanvasSize(Math.min(w - 48, availH, 460));
      }
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Render radar
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cohorts.length) return;
    const ctx = canvas.getContext('2d')!;

    const dpr = window.devicePixelRatio || 1;
    const size = canvasSize;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 96;
    const n = cohorts.length;

    function draw(t: number) {
      ctx.clearRect(0, 0, size, size);
      const breathe = 1 + Math.sin(t * 0.0008) * 0.006;

      // Grid rings
      for (let ring = 1; ring <= 4; ring++) {
        const r = (maxR * ring / 4) * breathe;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = ring === 4 ? 'rgba(59,76,192,0.2)' : 'rgba(255,255,255,0.03)';
        ctx.lineWidth = ring === 4 ? 1.5 : 0.5;
        ctx.stroke();

        if (ring < 4) {
          ctx.save();
          ctx.font = '9px Inter, system-ui';
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.textAlign = 'left';
          ctx.fillText(String(ring * 25), cx + 4, cy - r + 3);
          ctx.restore();
        }
      }

      // Axis lines + labels
      cohorts.forEach((c, i) => {
        const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
        const ex = cx + Math.cos(angle) * maxR * breathe;
        const ey = cy + Math.sin(angle) * maxR * breathe;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = hoveredCohort === c.cohort ? 'rgba(59,76,192,0.6)' : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = hoveredCohort === c.cohort ? 2 : 0.5;
        ctx.stroke();

        const labelR = maxR + 45;
        const lx = cx + Math.cos(angle) * labelR * breathe;
        const ly = cy + Math.sin(angle) * labelR * breathe;
        ctx.save();
        const isHovered = hoveredCohort === c.cohort;
        ctx.font = isHovered ? '600 13px Inter, system-ui' : '11px Inter, system-ui';
        ctx.fillStyle = isHovered ? '#2B3A8E' : 'rgba(142,142,147,0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shorten(c.cohort), lx, ly);

        // Score under label — use simulated dilly for that cohort
        const s = simCohortScores[c.cohort] ?? c;
        const projectedScore = Math.min(100, Math.round(0.40 * s.smart + 0.35 * s.grit + 0.25 * s.build));
        ctx.font = isHovered ? 'italic 16px Cormorant Garamond, serif' : 'italic 14px Cormorant Garamond, serif';
        const scoreColor = projectedScore >= 75 ? '#34C759' : projectedScore >= 55 ? '#FF9F0A' : '#FF453A';
        ctx.fillStyle = isHovered ? scoreColor : scoreColor + '80';
        ctx.fillText(String(projectedScore), lx, ly + 16);

        // Level tag
        ctx.font = '8px Inter, system-ui';
        ctx.fillStyle = 'rgba(142,142,147,0.4)';
        const tag = c.level === 'major' ? 'MAJOR' : c.level === 'minor' ? 'MINOR' : 'INTEREST';
        ctx.fillText(tag, lx, ly + 28);
        ctx.restore();
      });

      // Data polygons (per-cohort sim values)
      drawPoly(ctx, cohorts, cx, cy, maxR, breathe, n, 'smart', 'rgba(59,76,192,0.12)', 'rgba(59,76,192,0.6)', simCohortScores);
      drawPoly(ctx, cohorts, cx, cy, maxR, breathe, n, 'grit', 'rgba(201,168,76,0.08)', 'rgba(201,168,76,0.5)', simCohortScores);
      drawPoly(ctx, cohorts, cx, cy, maxR, breathe, n, 'build', 'rgba(52,199,89,0.08)', 'rgba(52,199,89,0.5)', simCohortScores);

      // Vertex dots
      cohorts.forEach((c, i) => {
        const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
        const s = simCohortScores[c.cohort] ?? c;
        const projVal = Math.min((0.40 * s.smart + 0.35 * s.grit + 0.25 * s.build) / 100, 1);
        const r = maxR * projVal * breathe;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        const isH = hoveredCohort === c.cohort;

        if (isH) {
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(59,76,192,0.1)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, isH ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = isH ? '#2B3A8E' : '#f5f5f7';
        ctx.fill();

        if (isH) {
          ctx.strokeStyle = 'rgba(59,76,192,0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });

      // Center score
      const projectedDilly = Math.round(overall.dilly + avgDelta);
      ctx.save();
      ctx.font = 'italic 56px Cormorant Garamond, serif';
      ctx.fillStyle = '#f5f5f7';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(projectedDilly), cx, cy - 10);
      ctx.font = '10px Inter, system-ui';
      ctx.fillStyle = 'rgba(142,142,147,0.5)';
      ctx.letterSpacing = '3px';
      ctx.fillText('DILLY SCORE', cx, cy + 22);
      ctx.restore();

      animRef.current = requestAnimationFrame(() => draw(performance.now()));
    }

    animRef.current = requestAnimationFrame(() => draw(performance.now()));
    return () => cancelAnimationFrame(animRef.current);
  }, [cohorts, hoveredCohort, simCohortScores, overall, canvasSize, avgDelta]); // eslint-disable-line

  const simMatches = stats ? Math.max(0, Math.round(stats.ready + avgDelta * 0.3)) : 0;

  const radarInteract = {
    onMouseMove: (e: React.MouseEvent) => {
      if (!cohorts.length) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = canvasSize / 2, cy = canvasSize / 2, maxR = canvasSize / 2 - 80;
      let closest: string | null = null;
      let closestDist = 60;
      cohorts.forEach((c, i) => {
        const angle = (Math.PI * 2 * i / cohorts.length) - Math.PI / 2;
        const val = c.dilly_score / 100;
        const r = maxR * Math.min(val, 1);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        const dist = Math.sqrt((mx - x) ** 2 + (my - y) ** 2);
        if (dist < closestDist) { closest = c.cohort; closestDist = dist; }
      });
      setHoveredCohort(closest);
    },
    onMouseLeave: () => setHoveredCohort(null),
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* LEFT COLUMN */}
      <div ref={containerRef} className="flex flex-col overflow-hidden border-r border-border-main" style={{ width: '52%' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1 flex-shrink-0">
          <div>
            <h1 className="font-display text-[26px] text-txt-1 tracking-tight">Career genome</h1>
            <p className="text-[12px] text-txt-3">Your unique career readiness fingerprint</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[9px] text-txt-3 font-bold uppercase tracking-widest">Live matches</p>
              <p className="text-[24px] font-bold font-mono text-ready leading-none mt-0.5">{simMatches}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-txt-3 font-bold uppercase tracking-widest">Percentile</p>
              <p className="text-[24px] font-bold font-mono text-dilly-blue leading-none mt-0.5">Top 15%</p>
            </div>
          </div>
        </div>

        {/* Radar */}
        <div className="flex justify-center flex-shrink-0">
          <canvas ref={canvasRef} className="cursor-crosshair" {...radarInteract} />
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 flex-shrink-0 mb-1">
          <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full" style={{background:'#2B3A8E'}}/><span className="text-[11px] text-txt-3">Smart</span></div>
          <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full" style={{background:'#C9A84C'}}/><span className="text-[11px] text-txt-3">Grit</span></div>
          <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full" style={{background:'#34C759'}}/><span className="text-[11px] text-txt-3">Build</span></div>
        </div>

        {/* Scrollable: per-cohort simulator */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-none">
          <div className="bg-surface-1 rounded-xl p-4">
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-bold text-dilly-blue tracking-[0.15em] uppercase">What-if simulator</h3>
              <div className="flex items-center gap-3">
                {anyChanges && (
                  <button onClick={resetAll}
                    className="text-[11px] text-txt-3 hover:text-dilly-blue transition-colors">
                    Reset all
                  </button>
                )}
                <span className="text-[12px] font-mono text-ready font-bold">{simMatches} matches</span>
              </div>
            </div>

            {/* Per-cohort accordion rows */}
            <div className="space-y-0.5">
              {cohorts.map(c => {
                const sim = getSimFor(c);
                const projected = Math.min(100, Math.round(0.40 * sim.smart + 0.35 * sim.grit + 0.25 * sim.build));
                const current = Math.round(isNaN(c.dilly_score) ? 0 : c.dilly_score);
                const diff = projected - current;
                const projColor = projected >= 75 ? '#34C759' : projected >= 55 ? '#FF9F0A' : '#FF453A';
                const isExpanded = expandedCohort === c.cohort;
                const hasChanges = cohortHasChanges(c);
                const name = shorten(c.cohort, 20);

                return (
                  <div key={c.cohort} className="rounded-lg overflow-hidden">
                    {/* Row header */}
                    <button
                      onClick={() => setExpandedCohort(isExpanded ? null : c.cohort)}
                      className="w-full flex items-center gap-2 px-2 py-2 hover:bg-surface-2 transition-colors rounded-lg"
                    >
                      {/* Chevron */}
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                        style={{ flexShrink: 0, color: 'var(--text-3)', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}>
                        <path d="M2 1.5l3.5 2.5L2 6.5" />
                      </svg>
                      <span className="text-[11px] text-txt-2 flex-1 text-left truncate">{name}</span>
                      {/* Change indicator dot */}
                      {hasChanges && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#2B3A8E' }} />}
                      {/* Projected score */}
                      <span className="text-[12px] font-mono font-bold flex-shrink-0" style={{ color: projColor }}>{projected}</span>
                      {/* Delta */}
                      {diff !== 0
                        ? <span className="text-[10px] font-mono w-8 text-right flex-shrink-0"
                            style={{ color: diff > 0 ? '#34C759' : '#FF453A' }}>
                            {diff > 0 ? '+' : ''}{diff}
                          </span>
                        : <span className="w-8 flex-shrink-0" />
                      }
                    </button>

                    {/* Expanded sliders */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-0.5 border-t border-border-main mt-0.5">
                        <SimSlider label="Smart" value={sim.smart} base={c.smart} color="#2B3A8E"
                          onChange={v => setSimDim(c.cohort, 'smart', v)} />
                        <SimSlider label="Grit" value={sim.grit} base={c.grit} color="#C9A84C"
                          onChange={v => setSimDim(c.cohort, 'grit', v)} />
                        <SimSlider label="Build" value={sim.build} base={c.build} color="#34C759"
                          onChange={v => setSimDim(c.cohort, 'build', v)} />
                        {hasChanges && (
                          <button onClick={() => resetCohort(c)}
                            className="text-[11px] text-txt-3 hover:text-dilly-blue transition-colors mt-1">
                            Reset
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN — AI Resilience + Cohort cards, scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        <AIResiliencePanel build={overall.build} grit={overall.grit} smart={overall.smart} cohorts={cohorts} />

        {/* Cohort score cards — 2-col grid below AI Resilience */}
        {cohorts.length > 0 && (
          <div className="px-5 pb-6">
            <p className="text-[9px] font-bold text-txt-3 tracking-[0.15em] uppercase mb-3">Cohort Scores</p>
            <div className="grid grid-cols-2 gap-3">
              {cohorts.map(c => {
                const score = Math.round(isNaN(c.dilly_score) ? 0 : c.dilly_score);
                const color = score >= 75 ? '#34C759' : score >= 55 ? '#FF9F0A' : '#FF453A';
                const tag = c.level === 'major' ? 'MAJOR' : c.level === 'minor' ? 'MINOR' : 'INTEREST';
                const isH = hoveredCohort === c.cohort;
                return (
                  <button key={c.cohort}
                    onClick={() => router.push(`/audit?cohort=${encodeURIComponent(c.cohort)}`)}
                    onMouseEnter={() => setHoveredCohort(c.cohort)}
                    onMouseLeave={() => setHoveredCohort(null)}
                    className={`bg-surface-1 rounded-xl p-4 transition-all duration-200 cursor-pointer border text-left w-full
                      ${isH ? 'border-dilly-blue/30 -translate-y-[1px] shadow-[0_4px_16px_rgba(59,76,192,0.08)]' : 'border-transparent'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[8px] font-bold text-txt-3 tracking-widest bg-surface-2 px-1.5 py-0.5 rounded">{tag}</span>
                      <span className="text-[18px] font-bold font-mono" style={{ color }}>{score}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-txt-1 truncate mb-2">{c.cohort}</p>
                    <div className="flex gap-3 text-[10px]">
                      <span><span className="text-txt-3">S</span> <span className="font-bold font-mono text-dilly-blue">{Math.round(c.smart)}</span></span>
                      <span><span className="text-txt-3">G</span> <span className="font-bold font-mono text-dilly-gold">{Math.round(c.grit)}</span></span>
                      <span><span className="text-txt-3">B</span> <span className="font-bold font-mono text-ready">{Math.round(c.build)}</span></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SimSlider({ label, value, base, color, onChange }: {
  label: string; value: number; base: number; color: string; onChange: (v: number) => void;
}) {
  const delta = Math.round(value - base);
  return (
    <div className="flex items-center gap-2 mb-2 last:mb-0">
      <span className="text-[11px] font-semibold w-10 flex-shrink-0" style={{ color }}>{label}</span>
      <input type="range" min="0" max="100" value={Math.round(value)} step="1"
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 cursor-pointer" style={{ accentColor: color }} />
      <span className="text-[11px] font-mono font-bold w-7 text-right flex-shrink-0 text-txt-1">{Math.round(value)}</span>
      <span className="text-[10px] font-mono w-8 text-right flex-shrink-0"
        style={{ color: delta > 0 ? '#34C759' : delta < 0 ? '#FF453A' : '#48484A' }}>
        {delta > 0 ? '+' : ''}{delta !== 0 ? delta : ''}
      </span>
    </div>
  );
}

function AIResiliencePanel({ build, grit, smart, cohorts }: { build: number; grit: number; smart: number; cohorts: CohortScore[] }) {
  const techCohorts = /software|computer science|data science|machine learning|cs/i;
  const hasTechMajor = cohorts.some(c => c.level === 'major' && techCohorts.test(c.cohort));
  const base = Math.round(build * 0.60 + grit * 0.25 + smart * 0.15);
  const aiScore = Math.min(100, base + (hasTechMajor ? 8 : 0));

  const tier = aiScore >= 80 ? { label: 'AI-Amplified', sub: 'Your profile is built for the AI era', color: '#34C759', bg: 'rgba(52,199,89,0.06)', border: 'rgba(52,199,89,0.25)' }
    : aiScore >= 65 ? { label: 'Adapting', sub: 'Strong foundation — sharpen your edge', color: '#FF9F0A', bg: 'rgba(255,159,10,0.06)', border: 'rgba(255,159,10,0.25)' }
    : aiScore >= 50 ? { label: 'Developing', sub: 'Time to build AI-resilient habits', color: '#FF9F0A', bg: 'rgba(255,159,10,0.04)', border: 'rgba(255,159,10,0.2)' }
    : { label: 'At Risk', sub: 'Prioritize AI-proof skills now', color: '#FF453A', bg: 'rgba(255,69,58,0.06)', border: 'rgba(255,69,58,0.25)' };

  const actions = aiScore >= 80
    ? ['Pursue AI research or publish a project on GitHub to signal thought leadership', 'Get certified in a high-signal framework (AWS ML Specialty, TensorFlow Developer)', 'Contribute to an open-source AI tool — recruiters notice pull requests']
    : aiScore >= 65
    ? ['Build one end-to-end ML or automation project and ship it publicly', 'Learn prompt engineering and LLM APIs (OpenAI, Anthropic) — it\'s now a baseline skill', 'Add a data/analytics layer to your resume projects to show quantified impact']
    : aiScore >= 50
    ? ['Start a 30-day coding streak: LeetCode, HackerRank, or a personal Python project', 'Take one free Coursera/edX course on AI fundamentals (Stanford ML, DeepLearning.AI)', 'Reframe your resume around outcomes — not tasks. AI replaces tasks, not impact-makers']
    : ['Immediately identify which of your target roles are high automation risk (see job flags)', 'Pivot toward roles requiring human judgment: strategy, sales, creative, management', 'Start building technical fluency now: Python basics, data analysis, no-code AI tools'];

  const bars = [
    { label: 'Build', value: build, weight: '60%', color: '#34C759', desc: 'Projects, code, tools built' },
    { label: 'Grit', value: grit, weight: '25%', color: '#2B3A8E', desc: 'Persistence under pressure' },
    { label: 'Smart', value: smart, weight: '15%', color: '#2B3A8E', desc: 'Breadth of knowledge' },
  ];

  return (
    <div style={{ background: tier.bg, border: '1px solid ' + tier.border, borderRadius: 14, padding: '20px 24px', margin: '20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, color: tier.color, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>AI Resilience Score</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 42, fontWeight: 700, fontStyle: 'italic', color: tier.color, lineHeight: 1 }}>{aiScore}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{tier.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{tier.sub}</p>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {hasTechMajor && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.25)' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34C759' }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: '#34C759', letterSpacing: 0.3, textTransform: 'uppercase' as const }}>Tech Major Bonus +8</span>
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Contribution bars */}
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Score Breakdown</p>
          {bars.map(b => {
            const pct = Math.min(b.value, 100);
            const barColor = pct >= 75 ? '#34C759' : pct >= 55 ? '#FF9F0A' : '#FF453A';
            return (
              <div key={b.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: b.color }}>{b.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{b.weight}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: barColor }}>{Math.round(b.value)}</span>
                </div>
                <div style={{ height: 3, background: 'var(--border-main)', borderRadius: 2 }}>
                  <div style={{ height: '100%', borderRadius: 2, background: barColor, width: pct + '%', opacity: 0.8 }} />
                </div>
                <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{b.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Recommended Actions</p>
          {actions.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: tier.color, background: tier.border, borderRadius: 3, padding: '2px 5px', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function drawPoly(
  ctx: CanvasRenderingContext2D,
  cohorts: CohortScore[],
  cx: number, cy: number,
  maxR: number, breathe: number, n: number,
  dim: 'smart' | 'grit' | 'build',
  fill: string, stroke: string,
  simCohortScores: SimScores,
) {
  ctx.beginPath();
  cohorts.forEach((c, i) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const simVal = simCohortScores[c.cohort]?.[dim] ?? c[dim];
    const val = Math.min(simVal / 100, 1);
    const r = maxR * Math.max(val, 0) * breathe;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
