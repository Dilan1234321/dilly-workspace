'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { getScoreColor } from '@/lib/scores';

/* ── Types ─────────────────────────────────────────── */
interface Recommendation {
  type: 'generic' | 'line_edit' | 'action';
  title: string;
  action: string;
  current_line?: string;
  suggested_line?: string;
  score_target?: string;
  diagnosis?: string;
}

interface AuditResult {
  id?: string;
  candidate_name: string;
  detected_track: string;
  major: string;
  scores: { smart: number; grit: number; build: number };
  final_score: number;
  audit_findings: string[];
  evidence: { smart: string; grit: string; build: string };
  evidence_quotes?: { smart: string; grit: string; build: string } | null;
  recommendations: Recommendation[];
  dilly_take?: string | null;
  strongest_signal_sentence?: string | null;
  consistency_findings?: string[] | null;
  red_flags?: { message: string; line?: string }[] | null;
  peer_percentiles?: { smart: number; grit: number; build: number } | null;
  peer_cohort_n?: number | null;
  benchmark_copy?: { smart: string; grit: string; build: string } | null;
}

interface HistoryItem {
  id: string;
  ts: number;
  scores: { smart: number; grit: number; build: number };
  final_score: number;
  detected_track: string;
  candidate_name?: string;
  major?: string;
  dilly_take?: string;
  peer_percentiles?: { smart: number; grit: number; build: number };
}

/* ── Constants ─────────────────────────────────────── */
const DIM = {
  smart: { label: 'Smart', color: '#FF9F0A', bg: 'rgba(255,159,10,0.08)', border: 'rgba(255,159,10,0.18)' },
  grit:  { label: 'Grit',  color: '#34C759', bg: 'rgba(52,199,89,0.08)',  border: 'rgba(52,199,89,0.18)' },
  build: { label: 'Build', color: '#2B3A8E', bg: 'rgba(59,76,192,0.08)',  border: 'rgba(59,76,192,0.18)' },
} as const;

type DimKey = keyof typeof DIM;

function tierInfo(score: number) {
  if (score >= 85) return { label: 'Elite', color: '#34C759' };
  if (score >= 70) return { label: 'Strong', color: '#FF9F0A' };
  if (score >= 55) return { label: 'Average', color: 'var(--text-2)' };
  return { label: 'At Risk', color: '#FF453A' };
}

const scoreColor = getScoreColor;

/* ── Page ──────────────────────────────────────────── */
export default function AuditPage() {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [target, setTarget] = useState<'internship' | 'full_time' | 'exploring'>('internship');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Toggle loading cursor on app shell (cleanup on unmount)
  useEffect(() => {
    const shell = document.querySelector('.dilly-app-shell') as HTMLElement | null;
    if (shell) shell.dataset.loading = uploading ? 'true' : 'false';
    return () => { if (shell) shell.dataset.loading = 'false'; };
  }, [uploading]);

  // Load history on mount
  useEffect(() => {
    setLoading(true);
    apiFetch('/audit/history')
      .then((h: HistoryItem[]) => {
        setHistory(h);
        if (h.length > 0) {
          // Load most recent audit
          loadAudit(h[0].id);
          setSelectedHistoryId(h[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadAudit = useCallback((id: string) => {
    setLoading(true);
    apiFetch(`/audit/history/${id}`)
      .then((a: AuditResult) => { setAudit(a); setSelectedHistoryId(id); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('application_target', target);
      const token = getToken() || '';
      const base = typeof window !== 'undefined' ? '/api/proxy' : (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000');
      const res = await fetch(`${base}/audit/v2`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error('Audit failed');
      const result: AuditResult = await res.json();
      setAudit(result);
      // Refresh history
      apiFetch('/audit/history').then(setHistory).catch(() => {});
      if (result.id) setSelectedHistoryId(result.id);
      // Sync parsed resume to editor as a new variant
      try {
        const editedData = await apiFetch('/resume/edited');
        const parsedSections = editedData?.resume?.sections ?? editedData?.sections ?? [];
        if (parsedSections.length > 0) {
          const label = `${result.detected_track || 'Audit'} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          const newVar = await apiFetch('/resume/variants', {
            method: 'POST',
            body: JSON.stringify({ label, cohort: result.detected_track || 'General' }),
          });
          const varId = newVar?.variant?.id;
          if (varId) {
            await apiFetch(`/resume/variants/${varId}`, { method: 'PUT', body: JSON.stringify({ sections: parsedSections }) });
          }
        }
      } catch { /* resume sync is best-effort */ }
    } catch {
      // Could add toast here
    } finally {
      setUploading(false);
    }
  }, [target]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  /* ── Upload / Empty State ──────────────────────── */
  if (!audit && !loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '36px 44px' }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            width: 520, padding: '56px 48px', borderRadius: 20,
            border: `2px dashed ${dragOver ? '#2B3A8E' : 'var(--border-main)'}`,
            background: dragOver ? 'rgba(59,76,192,0.04)' : 'var(--surface-1)',
            textAlign: 'center', transition: 'all 200ms ease',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>📄</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
            Resume Audit
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.5 }}>
            Drop your resume here or click to upload.<br />
            Get scored on Smart, Grit, and Build with personalized recommendations.
          </p>

          {/* Target selector */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
            {(['internship', 'full_time', 'exploring'] as const).map(t => (
              <button key={t} onClick={() => setTarget(t)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                  border: `1px solid ${target === t ? '#2B3A8E' : 'var(--border-main)'}`,
                  background: target === t ? 'rgba(59,76,192,0.08)' : 'transparent',
                  color: target === t ? '#2B3A8E' : 'var(--text-3)',
                  cursor: 'pointer', transition: 'all 150ms ease',
                }}>
                {t === 'full_time' ? 'Full-time' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <button onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '10px 28px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: '#2B3A8E', color: '#fff', border: 'none', cursor: 'pointer',
              opacity: uploading ? 0.5 : 1, transition: 'opacity 150ms',
            }}>
            {uploading ? 'Auditing...' : 'Upload Resume'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={onFileChange} style={{ display: 'none' }} />
        </div>
      </div>
    );
  }

  /* ── Loading skeleton ──────────────────────────── */
  if (loading && !audit) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: '36px 44px' }}>
        <div style={{ display: 'flex', gap: 32 }}>
          <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[200, 280, 240].map((h, i) => (
              <div key={i} className="skeleton" style={{ height: h, borderRadius: 14 }} />
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[80, 300, 200, 160].map((h, i) => (
              <div key={i} className="skeleton" style={{ height: h, borderRadius: 14 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!audit) return null;

  const tier = tierInfo(audit.final_score);
  const dims: DimKey[] = ['smart', 'grit', 'build'];

  /* ── Results ───────────────────────────────────── */
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '36px 44px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            Resume Audit
          </h1>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {audit.detected_track} · {audit.major}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {history.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{history.length} audit{history.length !== 1 ? 's' : ''}</span>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: '#2B3A8E', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
            {uploading ? 'Auditing...' : 'Re-audit'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={onFileChange} style={{ display: 'none' }} />
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>

        {/* ── LEFT COLUMN ──────────────────────── */}
        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Final Score Hero */}
          <div data-cursor-score={Math.round(audit.final_score)} data-cursor-score-color={scoreColor(audit.final_score)} style={{
            borderRadius: 14, padding: '28px 24px', textAlign: 'center',
            background: 'var(--surface-1)', border: '1px solid var(--border-main)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
              Dilly Score
            </div>
            <AnimNum value={audit.final_score} style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: 64, fontWeight: 300,
              color: scoreColor(audit.final_score), lineHeight: 1,
            }} />
            <div style={{ marginTop: 8 }}>
              <span style={{
                display: 'inline-block', padding: '3px 12px', borderRadius: 20,
                fontSize: 11, fontWeight: 600, color: tier.color,
                background: `${tier.color}14`, border: `1px solid ${tier.color}30`,
              }}>
                {tier.label}
              </span>
            </div>
            {audit.peer_percentiles && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>
                Top {Math.max(1, 100 - Math.round((audit.peer_percentiles.smart + audit.peer_percentiles.grit + audit.peer_percentiles.build) / 3))}%
                {audit.peer_cohort_n ? ` of ${audit.peer_cohort_n} peers` : ''}
              </p>
            )}
            {/* Score bar */}
            <div style={{ marginTop: 14, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <AnimBar value={audit.final_score} color={scoreColor(audit.final_score)} />
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div style={{
              borderRadius: 14, padding: '16px 20px', background: 'var(--surface-1)', border: '1px solid var(--border-main)',
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10 }}>
                Past Audits
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {history.map(h => {
                  const isSelected = h.id === selectedHistoryId;
                  return (
                    <button key={h.id} onClick={() => loadAudit(h.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: isSelected ? 'rgba(59,76,192,0.08)' : 'transparent',
                        transition: 'background 120ms ease', width: '100%', textAlign: 'left',
                      }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: isSelected ? 600 : 400, color: isSelected ? '#2B3A8E' : 'var(--text-1)', margin: 0 }}>
                          {new Date(h.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>{h.detected_track}</p>
                      </div>
                      <span style={{
                        fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 400,
                        color: scoreColor(h.final_score),
                      }}>
                        {Math.round(h.final_score)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dimension Cards */}
          {dims.map(d => (
            <div key={d} data-cursor-score={Math.round(audit.scores[d])} data-cursor-score-color={DIM[d].color} style={{
              borderRadius: 14, padding: '18px 20px',
              background: DIM[d].bg, border: `1px solid ${DIM[d].border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: DIM[d].color }}>{DIM[d].label}</span>
                <AnimNum value={audit.scores[d]} style={{
                  fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 400,
                  color: DIM[d].color, lineHeight: 1,
                }} />
              </div>
              <div style={{ height: 5, borderRadius: 3, background: `${DIM[d].color}18`, overflow: 'hidden' }}>
                <AnimBar value={audit.scores[d]} color={DIM[d].color} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                {audit.peer_percentiles && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    Top {Math.max(1, 100 - audit.peer_percentiles[d])}%
                  </span>
                )}
                {audit.benchmark_copy?.[d] && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{audit.benchmark_copy[d]}</span>
                )}
              </div>
            </div>
          ))}

          {/* Radar Chart */}
          <div style={{
            borderRadius: 14, padding: '20px', background: 'var(--surface-1)', border: '1px solid var(--border-main)',
          }}>
            <RadarChart scores={audit.scores} />
          </div>
        </div>

        {/* ── RIGHT COLUMN ─────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Dilly Take */}
          {audit.dilly_take && (
            <div style={{
              borderRadius: 14, padding: '18px 24px',
              background: 'rgba(59,76,192,0.04)', border: '1px solid rgba(59,76,192,0.12)',
            }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1.55, margin: 0 }}
                dangerouslySetInnerHTML={{ __html: audit.dilly_take.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
              />
              {audit.strongest_signal_sentence && (
                <p style={{ fontSize: 12, color: '#2B3A8E', marginTop: 10, fontWeight: 500, margin: '10px 0 0' }}>
                  {audit.strongest_signal_sentence}
                </p>
              )}
            </div>
          )}

          {/* Recommendations */}
          {audit.recommendations.length > 0 && (
            <div style={{
              borderRadius: 14, padding: '20px 24px',
              background: 'var(--surface-1)', border: '1px solid var(--border-main)',
            }}>
              <SectionHeader>Recommendations</SectionHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                {audit.recommendations.map((rec, i) => (
                  rec.type === 'line_edit' && rec.current_line && rec.suggested_line ? (
                    <RewriteCard key={i} rec={rec} />
                  ) : (
                    <ActionCard key={i} rec={rec} />
                  )
                ))}
              </div>
            </div>
          )}

          {/* Evidence */}
          <div style={{
            borderRadius: 14, padding: '20px 24px',
            background: 'var(--surface-1)', border: '1px solid var(--border-main)',
          }}>
            <SectionHeader>Evidence</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
              {dims.map(d => (
                <div key={d}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: DIM[d].color }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: DIM[d].color }}>{DIM[d].label}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.55, margin: 0 }}>
                    {audit.evidence[d]}
                  </p>
                  {audit.evidence_quotes?.[d] && (
                    <div style={{
                      marginTop: 8, padding: '10px 14px', borderRadius: 8,
                      borderLeft: `3px solid ${DIM[d].color}`,
                      background: DIM[d].bg, fontSize: 12, color: 'var(--text-2)',
                      fontStyle: 'italic', lineHeight: 1.5,
                    }}>
                      &ldquo;{audit.evidence_quotes[d]}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Audit Findings */}
          {audit.audit_findings.length > 0 && (
            <div style={{
              borderRadius: 14, padding: '20px 24px',
              background: 'var(--surface-1)', border: '1px solid var(--border-main)',
            }}>
              <SectionHeader>Key Findings</SectionHeader>
              <ul style={{ margin: '14px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {audit.audit_findings.map((f, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Consistency & Red Flags */}
          {((audit.consistency_findings?.length ?? 0) > 0 || (audit.red_flags?.length ?? 0) > 0) && (
            <div style={{
              borderRadius: 14, padding: '20px 24px',
              background: 'var(--surface-1)', border: '1px solid var(--border-main)',
            }}>
              <SectionHeader>Flags</SectionHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                {audit.consistency_findings?.map((c, i) => (
                  <FlagCard key={`c${i}`} type="consistency" message={c} />
                ))}
                {audit.red_flags?.map((r, i) => (
                  <FlagCard key={`r${i}`} type="red" message={r.message} line={r.line} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--text-3)', margin: 0,
    }}>
      {children}
    </h3>
  );
}

function AnimNum({ value, style }: { value: number; style: React.CSSProperties }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const target = Math.round(value);
    const start = performance.now();
    const duration = 700;
    const from = 0;
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * ease));
      if (t < 1) ref.current = requestAnimationFrame(tick);
    }
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value]);

  return <div style={style}>{display}</div>;
}

function AnimBar({ value, color }: { value: number; color: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(Math.min(value, 100)), 50);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div style={{
      height: '100%', borderRadius: 3, background: color,
      width: `${width}%`, transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
    }} />
  );
}

function RewriteCard({ rec }: { rec: Recommendation }) {
  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border-main)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{rec.title}</span>
        {rec.diagnosis && (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
            background: 'rgba(255,159,10,0.1)', color: '#FF9F0A',
          }}>
            {rec.diagnosis}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ padding: '10px 14px', background: 'rgba(255,69,58,0.04)', borderTop: '1px solid var(--border-main)', borderRight: '1px solid var(--border-main)' }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FF453A', marginBottom: 4, margin: 0 }}>Before</p>
          <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{rec.current_line}</p>
        </div>
        <div style={{ padding: '10px 14px', background: 'rgba(52,199,89,0.04)', borderTop: '1px solid var(--border-main)' }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#34C759', marginBottom: 4, margin: 0 }}>After</p>
          <p style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5, margin: 0 }}>{rec.suggested_line}</p>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ rec }: { rec: Recommendation }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      border: '1px solid var(--border-main)', background: 'var(--surface-2)',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{ marginTop: 2, fontSize: 14 }}>💡</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{rec.title}</span>
          {rec.score_target && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
              background: DIM[rec.score_target.toLowerCase() as DimKey]?.bg || 'var(--surface-2)',
              color: DIM[rec.score_target.toLowerCase() as DimKey]?.color || 'var(--text-3)',
            }}>
              {rec.score_target}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{rec.action}</p>
      </div>
    </div>
  );
}

function FlagCard({ type, message, line }: { type: 'consistency' | 'red'; message: string; line?: string }) {
  const isRed = type === 'red';
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10,
      background: isRed ? 'rgba(255,69,58,0.04)' : 'rgba(255,159,10,0.04)',
      border: `1px solid ${isRed ? 'rgba(255,69,58,0.15)' : 'rgba(255,159,10,0.15)'}`,
      display: 'flex', gap: 8,
    }}>
      <span style={{ fontSize: 13 }}>{isRed ? '🚩' : '⚠️'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5, margin: 0 }}>{message}</p>
        {line && <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', margin: '4px 0 0' }}>&ldquo;{line}&rdquo;</p>}
      </div>
    </div>
  );
}

/* ── Radar Chart (Canvas) ──────────────────────────── */
function RadarChart({ scores }: { scores: { smart: number; grit: number; build: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const size = 280;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 40;
    const dims: { key: DimKey; angle: number }[] = [
      { key: 'smart', angle: -Math.PI / 2 },
      { key: 'grit',  angle: Math.PI / 6 },
      { key: 'build', angle: (5 * Math.PI) / 6 },
    ];

    ctx.clearRect(0, 0, size, size);

    // Grid rings
    for (let ring = 1; ring <= 4; ring++) {
      const r = maxR * ring / 4;
      ctx.beginPath();
      dims.forEach((d, i) => {
        const x = cx + Math.cos(d.angle) * r;
        const y = cy + Math.sin(d.angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = 'var(--border-main)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Axes
    dims.forEach(d => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(d.angle) * maxR, cy + Math.sin(d.angle) * maxR);
      ctx.strokeStyle = 'var(--border-main)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Data polygon
    ctx.beginPath();
    dims.forEach((d, i) => {
      const r = maxR * (scores[d.key] / 100);
      const x = cx + Math.cos(d.angle) * r;
      const y = cy + Math.sin(d.angle) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(59, 76, 192, 0.08)';
    ctx.fill();
    ctx.strokeStyle = '#2B3A8E';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vertices + labels
    dims.forEach(d => {
      const r = maxR * (scores[d.key] / 100);
      const x = cx + Math.cos(d.angle) * r;
      const y = cy + Math.sin(d.angle) * r;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = DIM[d.key].color;
      ctx.fill();

      // Label
      const labelR = maxR + 20;
      const lx = cx + Math.cos(d.angle) * labelR;
      const ly = cy + Math.sin(d.angle) * labelR;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillStyle = DIM[d.key].color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${DIM[d.key].label} ${Math.round(scores[d.key])}`, lx, ly);
    });
  }, [scores]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
