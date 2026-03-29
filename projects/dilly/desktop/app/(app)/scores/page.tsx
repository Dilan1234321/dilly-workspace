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
  const [selectedCohort, setSelectedCohort] = useState<string | null>(null);
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
        ctx.fillStyle = isHovered ? '#3B4CC0' : 'rgba(142,142,147,0.8)';
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
        ctx.fillStyle = isH ? '#3B4CC0' : '#f5f5f7';
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
        <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full" style={{background:'#3B4CC0'}}/><span className="text-[11px] text-txt-3">Smart</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full" style={{background:'#C9A84C'}}/><span className="text-[11px] text-txt-3">Grit</span></div>
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
            <SimSlider label="Smart" value={simAdjust.smart} color="#3B4CC0" onChange={v => setSimAdjust(p => ({ ...p, smart: v }))} />
            <SimSlider label="Grit" value={simAdjust.grit} color="#C9A84C" onChange={v => setSimAdjust(p => ({ ...p, grit: v }))} />
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
            const isSel = selectedCohort === c.cohort;
            return (
              <div key={c.cohort}
                onMouseEnter={() => setHoveredCohort(c.cohort)}
                onMouseLeave={() => setHoveredCohort(null)}
                onClick={() => setSelectedCohort(isSel ? null : c.cohort)}
                className={`bg-surface-1 rounded-xl p-5 transition-all duration-200 cursor-pointer border
                  ${isSel ? 'border-dilly-blue/40 shadow-[0_4px_20px_rgba(59,76,192,0.12)]' : isH ? 'border-dilly-blue/30 -translate-y-[1px] shadow-[0_4px_20px_rgba(59,76,192,0.08)]' : 'border-transparent'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[8px] font-bold text-txt-3 tracking-widest bg-surface-2 px-1.5 py-0.5 rounded">{tag}</span>
                  <span className="text-[13px] font-semibold text-txt-1 truncate">{c.cohort}</span>
                  <span className="text-[20px] font-bold font-mono ml-auto" style={{ color }}>{score}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <MiniScore label="Smart" value={c.smart} color="#3B4CC0" />
                  <MiniScore label="Grit" value={c.grit} color="#C9A84C" />
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
            const isSel = selectedCohort === c.cohort;
            return (
              <div key={c.cohort}
                onMouseEnter={() => setHoveredCohort(c.cohort)}
                onMouseLeave={() => setHoveredCohort(null)}
                onClick={() => setSelectedCohort(isSel ? null : c.cohort)}
                className={`bg-surface-1 rounded-xl p-4 transition-all duration-200 cursor-pointer border
                  ${isSel ? 'border-dilly-blue/40' : isH ? 'border-dilly-blue/30 -translate-y-[1px]' : 'border-transparent'}`}>
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

        {/* ── Cohort Detail Panel ────────────────────────────────────── */}
        {selectedCohort && (() => {
          const c = cohorts.find(x => x.cohort === selectedCohort);
          if (!c) return null;
          const score = Math.round(c.dilly_score);
          const scoreColor = score >= 75 ? '#34C759' : score >= 55 ? '#FF9F0A' : '#FF453A';
          const tag = c.level === 'major' ? 'MAJOR' : c.level === 'minor' ? 'MINOR' : 'INTEREST';
          const dims = [
            { key: 'smart', label: 'Smart', value: c.smart, color: '#3B4CC0', avg: 62 },
            { key: 'grit', label: 'Grit', value: c.grit, color: '#C9A84C', avg: 58 },
            { key: 'build', label: 'Build', value: c.build, color: '#34C759', avg: 55 },
          ];
          const weakest = dims.reduce((w, d) => d.value < w.value ? d : w, dims[0]);

          return (
            <div className="mt-4 bg-surface-1 rounded-xl p-6 border border-dilly-blue/20 animate-fade-in">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <span className="text-[8px] font-bold text-txt-3 tracking-widest bg-surface-2 px-2 py-1 rounded">{tag}</span>
                  <h3 className="text-[18px] font-bold text-txt-1" style={{ fontFamily: "'Cinzel', serif" }}>{c.cohort}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[36px] font-bold font-mono leading-none" style={{ color: scoreColor }}>{score}</span>
                  <button onClick={() => setSelectedCohort(null)} className="p-1 hover:bg-surface-2 rounded transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-3)' }}>
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Dimension Bars */}
              <div className="flex flex-col gap-4 mb-5">
                {dims.map(d => {
                  const val = Math.round(d.value);
                  const valColor = val >= 75 ? '#34C759' : val >= 55 ? '#FF9F0A' : '#FF453A';
                  return (
                    <div key={d.key}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-3)', fontFamily: "'Cinzel', serif" }}>{d.label}</span>
                        <span className="text-[22px] font-bold font-mono" style={{ color: valColor }}>{val}</span>
                      </div>
                      <div className="relative h-2 rounded-full overflow-visible" style={{ background: 'var(--surface-2)' }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(val, 100)}%`, background: d.color, opacity: 0.85 }} />
                        {/* Peer avg marker */}
                        <div className="absolute top-[-3px]" style={{ left: `${d.avg}%` }}>
                          <div className="w-0.5 h-3.5 rounded-sm" style={{ background: 'var(--text-1)', opacity: 0.4 }} />
                        </div>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>You</span>
                        <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>&#9662; Peer avg {d.avg}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Gap Callout */}
              <div className="rounded-lg p-4" style={{ background: 'var(--surface-2)', borderLeft: `3px solid ${weakest.value >= 75 ? '#34C759' : weakest.value >= 55 ? '#FF9F0A' : '#FF453A'}` }}>
                <p className="text-[13px] font-bold text-txt-1 mb-1">
                  {weakest.label} is your biggest opportunity
                </p>
                <p className="text-[12px] text-txt-2 leading-relaxed">
                  Your {weakest.label} is {Math.round(weakest.value)} in {c.cohort}. Peer average is around {weakest.avg}. Close this gap to move up.
                </p>
              </div>
            </div>
          );
        })()}
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