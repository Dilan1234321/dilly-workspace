'use client';
import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';

interface CohortScore {
  cohort: string; level: string; field: string;
  smart: number; grit: number; build: number;
  dilly_score: number; weight: number;
}

export default function ScoresPage() {
  const [cohorts, setCohorts] = useState<CohortScore[]>([]);
  const [overall, setOverall] = useState({ smart: 0, grit: 0, build: 0, dilly: 0 });
  const [stats, setStats] = useState<any>(null);
  const [hoveredCohort, setHoveredCohort] = useState<string | null>(null);
  const [simAdjust, setSimAdjust] = useState({ smart: 0, grit: 0, build: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState(600);

  useEffect(() => {
    Promise.all([
      apiFetch('/profile').then(p => {
        const cs = Object.values(p.cohort_scores || {}) as CohortScore[];
        setCohorts(cs);
        setOverall({ smart: p.overall_smart || 0, grit: p.overall_grit || 0, build: p.overall_build || 0, dilly: p.overall_dilly_score || 0 });
      }),
      apiFetch('/v2/internships/stats').then(setStats),
    ]);
  }, []);

  // Resize canvas to fit container
  useEffect(() => {
    function resize() {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        const h = window.innerHeight - 200;
        setCanvasSize(Math.min(w - 40, h, 700));
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
    const maxR = size / 2 - 80;
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

        // Ring labels
        if (ring < 4) {
          ctx.save();
          ctx.font = '9px Inter, system-ui';
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.textAlign = 'left';
          ctx.fillText(String(ring * 25), cx + 4, cy - r + 3);
          ctx.restore();
        }
      }

      // Axis lines
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

        // Labels
        const labelR = maxR + 45;
        const lx = cx + Math.cos(angle) * labelR * breathe;
        const ly = cy + Math.sin(angle) * labelR * breathe;
        ctx.save();
        const isHovered = hoveredCohort === c.cohort;
        ctx.font = isHovered ? '600 13px Inter, system-ui' : '11px Inter, system-ui';
        ctx.fillStyle = isHovered ? '#2B3A8E' : 'rgba(142,142,147,0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const shortName = c.cohort
          .replace('Software Engineering & CS', 'CS')
          .replace('Data Science & Analytics', 'Data Science')
          .replace('Entrepreneurship & Innovation', 'Entrepreneurship')
          .replace('Physical Sciences & Math', 'Math & Physics')
          .replace('Consulting & Strategy', 'Consulting')
          .replace('Social Sciences & Nonprofit', 'Social Sciences');
        ctx.fillText(shortName, lx, ly);

        // Score under label
        const score = Math.round(c.dilly_score);
        ctx.font = isHovered ? 'italic 16px Cormorant Garamond, serif' : 'italic 14px Cormorant Garamond, serif';
        const scoreColor = score >= 75 ? '#34C759' : score >= 55 ? '#FF9F0A' : '#FF453A';
        ctx.fillStyle = isHovered ? scoreColor : scoreColor + '80';
        ctx.fillText(String(score), lx, ly + 16);

        // Level tag
        ctx.font = '8px Inter, system-ui';
        ctx.fillStyle = 'rgba(142,142,147,0.4)';
        const tag = c.level === 'major' ? 'MAJOR' : c.level === 'minor' ? 'MINOR' : 'INTEREST';
        ctx.fillText(tag, lx, ly + 28);
        ctx.restore();
      });

      // Data polygons
      drawPoly(ctx, cohorts, cx, cy, maxR, breathe, n, 'smart', 'rgba(59,76,192,0.12)', 'rgba(59,76,192,0.6)', simAdjust.smart);
      drawPoly(ctx, cohorts, cx, cy, maxR, breathe, n, 'grit', 'rgba(201,168,76,0.08)', 'rgba(201,168,76,0.5)', simAdjust.grit);
      drawPoly(ctx, cohorts, cx, cy, maxR, breathe, n, 'build', 'rgba(52,199,89,0.08)', 'rgba(52,199,89,0.5)', simAdjust.build);

      // Vertex dots
      cohorts.forEach((c, i) => {
        const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
        const val = Math.min(c.dilly_score / 100, 1);
        const r = maxR * val * breathe;
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
      const dillyScore = Math.round(overall.dilly + (simAdjust.smart + simAdjust.grit + simAdjust.build) / 3);
      ctx.save();
      ctx.font = 'italic 56px Cormorant Garamond, serif';
      ctx.fillStyle = '#f5f5f7';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(dillyScore), cx, cy - 10);
      ctx.font = '10px Inter, system-ui';
      ctx.fillStyle = 'rgba(142,142,147,0.5)';
      ctx.letterSpacing = '3px';
      ctx.fillText('DILLY SCORE', cx, cy + 22);
      ctx.restore();

      animRef.current = requestAnimationFrame(() => draw(performance.now()));
    }

    animRef.current = requestAnimationFrame(() => draw(performance.now()));
    return () => cancelAnimationFrame(animRef.current);
  }, [cohorts, hoveredCohort, simAdjust, overall, canvasSize]);

  const simMatches = stats ? Math.max(0, Math.round(stats.ready + (simAdjust.smart + simAdjust.grit + simAdjust.build) * 0.3)) : 0;

  return (
    <div className="h-full overflow-y-auto" ref={containerRef}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 pt-5 pb-2">
        <div>
          <h1 className="font-display text-[28px] text-txt-1 tracking-tight">Career genome</h1>
          <p className="text-[13px] text-txt-3">Your unique career readiness fingerprint</p>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="text-[9px] text-txt-3 font-bold uppercase tracking-widest">Live matches</p>
            <p className="text-[28px] font-bold font-mono text-ready leading-none mt-1">{simMatches}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-txt-3 font-bold uppercase tracking-widest">Percentile</p>
            <p className="text-[28px] font-bold font-mono text-dilly-blue leading-none mt-1">Top 15%</p>
          </div>
        </div>
      </div>

      {/* Radar - centered, full width */}
      <div className="flex justify-center py-2">
        <canvas ref={canvasRef}
          className="cursor-crosshair"
          onMouseMove={(e) => {
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
          }}
          onMouseLeave={() => setHoveredCohort(null)}
        />
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-8 mb-6">
        <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full" style={{background:'#2B3A8E'}}/><span className="text-[11px] text-txt-3">Smart</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full" style={{background:'#2B3A8E'}}/><span className="text-[11px] text-txt-3">Grit</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full" style={{background:'#34C759'}}/><span className="text-[11px] text-txt-3">Build</span></div>
      </div>

      {/* Bottom section: Simulator + Cohort cards */}
      <div className="px-8 pb-8">
        <div className="grid grid-cols-3 gap-4">
          {/* Simulator */}
          <div className="bg-surface-1 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold text-dilly-blue tracking-[0.15em] uppercase">What-if simulator</h3>
              <span className="text-[13px] font-mono text-ready font-bold">{simMatches} matches</span>
            </div>
            <SimSlider label="Smart" value={simAdjust.smart} color="#2B3A8E" onChange={v => setSimAdjust(p => ({ ...p, smart: v }))} />
            <SimSlider label="Grit" value={simAdjust.grit} color="#2B3A8E" onChange={v => setSimAdjust(p => ({ ...p, grit: v }))} />
            <SimSlider label="Build" value={simAdjust.build} color="#34C759" onChange={v => setSimAdjust(p => ({ ...p, build: v }))} />
            {(simAdjust.smart !== 0 || simAdjust.grit !== 0 || simAdjust.build !== 0) && (
              <button onClick={() => setSimAdjust({ smart: 0, grit: 0, build: 0 })}
                className="text-[11px] text-txt-3 hover:text-dilly-blue mt-3 transition-colors">
                Reset
              </button>
            )}
          </div>

          {/* Cohort cards */}
          {cohorts.slice(0, 2).map(c => {
            const score = Math.round(c.dilly_score);
            const color = score >= 75 ? '#34C759' : score >= 55 ? '#FF9F0A' : '#FF453A';
            const tag = c.level === 'major' ? 'MAJOR' : c.level === 'minor' ? 'MINOR' : 'INTEREST';
            const isH = hoveredCohort === c.cohort;
            return (
              <div key={c.cohort}
                onMouseEnter={() => setHoveredCohort(c.cohort)}
                onMouseLeave={() => setHoveredCohort(null)}
                className={`bg-surface-1 rounded-xl p-5 transition-all duration-200 cursor-pointer border
                  ${isH ? 'border-dilly-blue/30 -translate-y-[1px] shadow-[0_4px_20px_rgba(59,76,192,0.08)]' : 'border-transparent'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[8px] font-bold text-txt-3 tracking-widest bg-surface-2 px-1.5 py-0.5 rounded">{tag}</span>
                  <span className="text-[13px] font-semibold text-txt-1 truncate">{c.cohort}</span>
                  <span className="text-[20px] font-bold font-mono ml-auto" style={{ color }}>{score}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <MiniScore label="Smart" value={c.smart} color="#2B3A8E" />
                  <MiniScore label="Grit" value={c.grit} color="#2B3A8E" />
                  <MiniScore label="Build" value={c.build} color="#34C759" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Remaining cohort cards */}
        <div className="grid grid-cols-4 gap-3 mt-3">
          {cohorts.slice(2).map(c => {
            const score = Math.round(c.dilly_score);
            const color = score >= 75 ? '#34C759' : score >= 55 ? '#FF9F0A' : '#FF453A';
            const tag = c.level === 'major' ? 'MAJOR' : c.level === 'minor' ? 'MINOR' : 'INTEREST';
            const isH = hoveredCohort === c.cohort;
            return (
              <div key={c.cohort}
                onMouseEnter={() => setHoveredCohort(c.cohort)}
                onMouseLeave={() => setHoveredCohort(null)}
                className={`bg-surface-1 rounded-xl p-4 transition-all duration-200 cursor-pointer border
                  ${isH ? 'border-dilly-blue/30 -translate-y-[1px]' : 'border-transparent'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[8px] font-bold text-txt-3 tracking-widest">{tag}</span>
                  <span className="text-[16px] font-bold font-mono" style={{ color }}>{score}</span>
                </div>
                <p className="text-[12px] font-semibold text-txt-1 truncate">{c.cohort}</p>
                <div className="flex gap-3 mt-2 text-[10px]">
                  <span><span className="text-txt-3">S</span> <span className="font-bold font-mono text-dilly-blue">{Math.round(c.smart)}</span></span>
                  <span><span className="text-txt-3">G</span> <span className="font-bold font-mono text-dilly-gold">{Math.round(c.grit)}</span></span>
                  <span><span className="text-txt-3">B</span> <span className="font-bold font-mono text-ready">{Math.round(c.build)}</span></span>
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Resilience Panel */}
        <AIResiliencePanel build={overall.build} grit={overall.grit} smart={overall.smart} cohorts={cohorts} />
      </div>
    </div>
  );
}

function SimSlider({ label, value, color, onChange }: { label: string; value: number; color: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3 mb-3 last:mb-0">
      <span className="text-[12px] font-semibold w-12" style={{ color }}>{label}</span>
      <input type="range" min="-20" max="20" value={value} step="1"
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 cursor-pointer" style={{ accentColor: color }} />
      <span className="text-[12px] font-mono font-bold w-10 text-right"
        style={{ color: value > 0 ? '#34C759' : value < 0 ? '#FF453A' : '#48484A' }}>
        {value > 0 ? '+' : ''}{value}
      </span>
    </div>
  );
}

function MiniScore({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <p className="text-[9px] text-txt-3 mb-0.5">{label}</p>
      <p className="text-[16px] font-bold font-mono" style={{ color }}>{Math.round(value)}</p>
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
    <div style={{ marginTop: 16, background: tier.bg, border: '1px solid ' + tier.border, borderRadius: 14, padding: '20px 24px' }}>
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

function drawPoly(ctx: CanvasRenderingContext2D, cohorts: CohortScore[], cx: number, cy: number,
  maxR: number, breathe: number, n: number, dim: 'smart' | 'grit' | 'build',
  fill: string, stroke: string, simAdj: number) {
  ctx.beginPath();
  cohorts.forEach((c, i) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const val = Math.min((c[dim] + simAdj) / 100, 1);
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