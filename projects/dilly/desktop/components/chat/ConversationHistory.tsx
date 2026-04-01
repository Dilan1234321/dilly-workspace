'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { dilly } from '@/lib/dilly';

/* ── Types ─────────────────────────────────────────── */

interface ActionItem {
  id: string;
  text: string;
  dimension: 'smart' | 'grit' | 'build' | null;
  estimated_pts: number | null;
  effort: 'low' | 'medium' | 'high';
  done: boolean;
}

interface ScoreImpact {
  total_pts: number;
  dimension_breakdown: Record<string, number>;
  confidence: string;
  qualifying_note: string;
}

interface ConversationOutput {
  id: string;
  conv_id: string;
  generated_at: string;
  session_title: string;
  session_topic: string;
  action_items_created: ActionItem[];
  deadlines_created: { id: string; label: string; date: string }[];
  profile_updates: { id: string; field: string; new_value: unknown; confirmed: boolean }[];
  score_impact: ScoreImpact | null;
}

/* ── Constants ─────────────────────────────────────── */

const TOPIC_COLORS: Record<string, string> = {
  interview_prep: '#6366f1',
  resume_feedback: '#d97706',
  job_search: '#22c55e',
  company_research: '#14b8a6',
};

const DIM_COLORS: Record<string, string> = {
  smart: '#5B8DEF',
  grit: '#2B3A8E',
  build: '#6366f1',
};

/* ── Helpers ───────────────────────────────────────── */

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ── Main Component ────────────────────────────────── */

export default function ConversationHistory({ onClose, onOpenConversation }: { onClose: () => void; onOpenConversation?: (convId: string) => void }) {
  const [items, setItems] = useState<ConversationOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ConversationOutput | null>(null);
  const [search, setSearch] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: ConversationOutput } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null); // conv_id being renamed
  const [renameValue, setRenameValue] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  const handleRename = useCallback(async (convId: string, newTitle: string) => {
    if (!newTitle.trim()) { setRenaming(null); return; }
    try {
      await dilly.patch(`/voice/history/${encodeURIComponent(convId)}/rename`, { session_title: newTitle.trim() });
      setItems(prev => prev.map(i => i.conv_id === convId ? { ...i, session_title: newTitle.trim() } : i));
    } catch { /* silently fail — title stays as-is */ }
    setRenaming(null);
  }, []);

  const handleDelete = useCallback(async (convId: string) => {
    try {
      await dilly.delete(`/voice/history/${encodeURIComponent(convId)}`);
      setItems(prev => prev.filter(i => i.conv_id !== convId));
    } catch { /* silently fail */ }
  }, []);

  const fetchList = useCallback(async (q?: string) => {
    try {
      setLoading(true);
      const qs = q ? `?limit=50&search=${encodeURIComponent(q)}` : '?limit=50';
      const data = await dilly.get(`/voice/history${qs}`);
      setItems(data.items ?? data ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Debounced search
  useEffect(() => {
    if (!search) { fetchList(); return; }
    const t = setTimeout(() => fetchList(search), 350);
    return () => clearTimeout(t);
  }, [search, fetchList]);

  /* ── Detail view ── */
  if (detail) {
    return <DetailView item={detail} onBack={() => setDetail(null)} onClose={onClose} />;
  }

  /* ── List view ── */
  return (
    <div ref={panelRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-0)', position: 'relative' }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '1px solid var(--border-main)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--text-2)', display: 'flex', alignItems: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Conversation History</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{items.length} total</span>
      </div>

      {/* Search */}
      <div style={{ flexShrink: 0, padding: '10px 14px 6px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search conversations..."
          style={{
            width: '100%', fontSize: 12, color: 'var(--text-1)', background: 'var(--surface-1)',
            border: '1px solid var(--border-main)', borderRadius: 8, padding: '8px 10px',
            outline: 'none',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px 14px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', padding: '32px 0' }}>Loading...</p>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>No conversations yet</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Chat with Dilly to see history here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map(item => {
              const actionCount = item.action_items_created?.length || 0;
              const pts = item.score_impact?.total_pts || 0;
              const topicColor = TOPIC_COLORS[item.session_topic] || 'var(--text-3)';
              const isRenaming = renaming === item.conv_id;
              return (
                <button
                  key={item.conv_id}
                  type="button"
                  onClick={() => { if (!isRenaming) { onOpenConversation ? onOpenConversation(item.conv_id) : setDetail(item); } }}
                  onContextMenu={e => {
                    e.preventDefault();
                    const rect = panelRef.current?.getBoundingClientRect();
                    const x = e.clientX - (rect?.left || 0);
                    const y = e.clientY - (rect?.top || 0);
                    setCtxMenu({ x, y, item });
                  }}
                  style={{
                    textAlign: 'left', width: '100%', cursor: isRenaming ? 'default' : 'pointer',
                    background: 'var(--surface-1)', border: '1px solid var(--border-main)',
                    borderRadius: 12, padding: '10px 12px',
                    transition: 'border-color 140ms ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(59,76,192,0.35)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-main)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>{relativeDate(item.generated_at)}</p>
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleRename(item.conv_id, renameValue); }
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          onBlur={() => handleRename(item.conv_id, renameValue)}
                          onClick={e => e.stopPropagation()}
                          style={{
                            fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '2px 0 0',
                            width: '100%', background: 'var(--surface-0)', border: '1px solid rgba(59,76,192,0.4)',
                            borderRadius: 6, padding: '2px 6px', outline: 'none',
                          }}
                        />
                      ) : (
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '2px 0 0', lineHeight: 1.35,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.session_title}
                        </p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        {actionCount > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                            {actionCount} action{actionCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {pts > 0 && (
                          <span style={{ fontSize: 10, color: DIM_COLORS[
                            Object.entries(item.score_impact?.dimension_breakdown || {}).sort(([,a],[,b]) => b - a)[0]?.[0] || 'grit'
                          ] || 'var(--text-3)' }}>
                            +{pts} pts
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                      background: topicColor, color: 'rgba(255,255,255,0.9)',
                      borderRadius: 4, padding: '2px 6px', flexShrink: 0, marginTop: 2,
                    }}>
                      {item.session_topic.replace(/_/g, ' ')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{
            position: 'absolute', left: ctxMenu.x, top: ctxMenu.y, zIndex: 30,
            background: 'var(--surface-1)', border: '1px solid var(--border-main)',
            borderRadius: 10, padding: 4, minWidth: 140,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setRenaming(ctxMenu.item.conv_id);
              setRenameValue(ctxMenu.item.session_title);
              setCtxMenu(null);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '7px 10px', borderRadius: 6, fontSize: 12, color: 'var(--text-1)',
              transition: 'background 100ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            Rename
          </button>
          <button
            onClick={() => {
              handleDelete(ctxMenu.item.conv_id);
              setCtxMenu(null);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '7px 10px', borderRadius: 6, fontSize: 12, color: '#ef4444',
              transition: 'background 100ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Detail View ───────────────────────────────────── */

function DetailView({
  item,
  onBack,
  onClose,
}: {
  item: ConversationOutput;
  onBack: () => void;
  onClose: () => void;
}) {
  const topicColor = TOPIC_COLORS[item.session_topic] || 'var(--text-3)';
  const impact = item.score_impact;
  const topDim = impact?.dimension_breakdown
    ? Object.entries(impact.dimension_breakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || 'grit'
    : 'grit';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-0)' }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px', borderBottom: '1px solid var(--border-main)',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: 'var(--text-2)', display: 'flex', alignItems: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.session_title}
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: 'var(--text-3)', display: 'flex', alignItems: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {new Date(item.generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
            background: topicColor, color: 'rgba(255,255,255,0.9)',
            borderRadius: 4, padding: '2px 6px',
          }}>
            {item.session_topic.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Score impact */}
        {impact && impact.total_pts > 0 && (
          <div style={{
            background: 'var(--surface-1)', border: '1px solid var(--border-main)',
            borderRadius: 12, padding: '10px 12px', marginBottom: 14,
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: DIM_COLORS[topDim] || '#5B8DEF', margin: 0 }}>
              +{impact.total_pts} pts potential
            </p>
            {impact.qualifying_note && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>{impact.qualifying_note}</p>
            )}
          </div>
        )}

        {/* Action items */}
        {item.action_items_created.length > 0 && (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-3)', margin: '0 0 8px' }}>
              Action items
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {item.action_items_created.map(a => (
                <div key={a.id} style={{
                  background: 'var(--surface-1)', border: '1px solid var(--border-main)',
                  borderRadius: 10, padding: '8px 10px',
                  opacity: a.done ? 0.5 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0, marginTop: 1,
                      border: a.done ? 'none' : '1.5px solid var(--border-main)',
                      background: a.done ? '#22c55e' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {a.done && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-1)', margin: 0, lineHeight: 1.45, textDecoration: a.done ? 'line-through' : 'none' }}>
                        {a.text}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        {a.dimension && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                            color: DIM_COLORS[a.dimension] || 'var(--text-3)',
                          }}>
                            {a.dimension}
                          </span>
                        )}
                        {a.estimated_pts != null && a.estimated_pts > 0 && (
                          <span style={{ fontSize: 9, color: 'var(--text-3)' }}>+{a.estimated_pts} pts</span>
                        )}
                        <span style={{
                          fontSize: 9,
                          color: a.effort === 'low' ? '#22c55e' : a.effort === 'high' ? '#ef4444' : '#d97706',
                        }}>
                          {a.effort}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Deadlines */}
        {item.deadlines_created.length > 0 && (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-3)', margin: '0 0 8px' }}>
              Deadlines
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {item.deadlines_created.map(dl => (
                <div key={dl.id} style={{
                  background: 'var(--surface-1)', border: '1px solid var(--border-main)',
                  borderRadius: 10, padding: '8px 10px',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{dl.label}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>{dl.date}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Profile updates */}
        {item.profile_updates.length > 0 && (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-3)', margin: '0 0 8px' }}>
              Profile updates
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {item.profile_updates.map(pu => (
                <div key={pu.id} style={{
                  background: 'var(--surface-1)', border: '1px solid var(--border-main)',
                  borderRadius: 10, padding: '8px 10px',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{pu.field}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>
                    {pu.confirmed ? 'Confirmed' : 'Suggested'}: {String(pu.new_value ?? '')}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
