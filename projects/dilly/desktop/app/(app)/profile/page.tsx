'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { dilly } from '@/lib/dilly';

// ── Types ────────────────────────────────────────────────────────────────────

interface FactItem {
  id: string;
  category: string;
  label: string;
  value: string;
  confidence: string;
  source: string;
  created_at: string;
}

interface MemorySurface {
  narrative: string | null;
  narrative_updated_at: string | null;
  narrative_updated_relative?: string;
  items: FactItem[];
  grouped: Record<string, FactItem[]>;
}

// ── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  achievement:          { label: 'Achievements',         color: '#2B3A8E' },
  goal:                 { label: 'Goals',                color: '#34C759' },
  skill_unlisted:       { label: 'Unlisted Skills',      color: '#2B3A8E' },
  project_detail:       { label: 'Project Details',      color: '#34C759' },
  motivation:           { label: 'Motivations',          color: '#FF6B8A' },
  personality:          { label: 'Personality & Style',   color: '#5E5CE6' },
  soft_skill:           { label: 'Soft Skills',          color: '#5E5CE6' },
  hobby:                { label: 'Hobbies & Interests',  color: '#FF9F0A' },
  life_context:         { label: 'Life Context',         color: '#FF9F0A' },
  company_culture_pref: { label: 'Culture Preferences',  color: '#2B3A8E' },
  strength:             { label: 'Strengths',            color: '#34C759' },
  weakness:             { label: 'Growth Areas',         color: '#FF453A' },
  challenge:            { label: 'Challenges',           color: '#FF453A' },
  concern:              { label: 'Concerns',             color: '#FF9F0A' },
  availability:         { label: 'Availability',         color: '#2B3A8E' },
  deadline:             { label: 'Deadlines',            color: '#FF453A' },
  interview:            { label: 'Interviews',           color: '#2B3A8E' },
  rejection:            { label: 'Rejections',           color: '#FF453A' },
  preference:           { label: 'Preferences',          color: '#5E5CE6' },
  mentioned_but_not_done: { label: 'To Do',             color: '#FF9F0A' },
  person_to_follow_up:  { label: 'Follow Up',            color: '#34C759' },
};

const CATEGORY_ORDER = [
  'achievement', 'goal',
  'skill_unlisted', 'project_detail',
  'motivation', 'personality', 'soft_skill',
  'hobby', 'life_context', 'company_culture_pref',
  'strength', 'weakness', 'challenge',
  'concern', 'availability', 'deadline',
  'interview', 'rejection', 'preference',
  'mentioned_but_not_done', 'person_to_follow_up',
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DillyProfilePage() {
  const searchParams = useSearchParams();
  const deepCategory = searchParams.get('category');
  const deepAdd = searchParams.get('add') === '1';

  const [data, setData] = useState<MemorySurface | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(deepCategory);
  const [addingTo, setAddingTo] = useState<string | null>(deepAdd && deepCategory ? deepCategory : null);
  const [addLabel, setAddLabel] = useState('');
  const [addValue, setAddValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editValue, setEditValue] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const json = await dilly.get('/memory');
      setData(json);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function startEdit(fact: FactItem) {
    setEditingId(fact.id);
    setEditLabel(fact.label);
    setEditValue(fact.value);
  }

  async function saveEdit(id: string) {
    if (!editLabel.trim()) return;
    try {
      await dilly.patch(`/memory/items/${id}`, { label: editLabel.trim(), value: editValue.trim() || editLabel.trim(), confidence: 'high' });
      setData(prev => {
        if (!prev) return prev;
        const items = prev.items.map(i => i.id === id ? { ...i, label: editLabel.trim(), value: editValue.trim() || editLabel.trim(), confidence: 'high' } : i);
        const grouped: Record<string, FactItem[]> = {};
        for (const item of items) {
          if (!grouped[item.category]) grouped[item.category] = [];
          grouped[item.category].push(item);
        }
        return { ...prev, items, grouped };
      });
    } catch {} finally {
      setEditingId(null);
    }
  }

  async function deleteFact(id: string) {
    if (!confirm('Remove this fact? Dilly will forget it.')) return;
    try {
      await dilly.delete(`/memory/items/${id}`);
      setData(prev => {
        if (!prev) return prev;
        const items = prev.items.filter(i => i.id !== id);
        const grouped: Record<string, FactItem[]> = {};
        for (const item of items) {
          if (!grouped[item.category]) grouped[item.category] = [];
          grouped[item.category].push(item);
        }
        return { ...prev, items, grouped };
      });
    } catch {}
  }

  async function seedFromResume() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const res = await dilly.post('/memory/seed-from-resume', {});
      setSeedMsg(res?.seeded > 0 ? `Added ${res.seeded} facts from your resume.` : 'No new facts found — try re-uploading your resume.');
      if ((res?.seeded ?? 0) > 0) fetchData();
    } catch {
      setSeedMsg('Something went wrong. Try again.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleAddFact() {
    if (!addingTo || !addLabel.trim()) return;
    try {
      await dilly.post('/memory/items', {
        category: addingTo,
        label: addLabel.trim().slice(0, 80),
        value: addValue.trim() || addLabel.trim(),
        source: 'profile',
        confidence: 'high',
      });
      setAddLabel('');
      setAddValue('');
      setAddingTo(null);
      fetchData();
    } catch {}
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const totalFacts = data?.items?.length ?? 0;
  const sessionCount = new Set(data?.items?.map(i => (i as any).conv_id).filter(Boolean)).size;
  const orderedCategories = CATEGORY_ORDER.filter(cat => data?.grouped?.[cat]?.length);

  const CORE_CATEGORIES = [
    { key: 'goal', nudge: 'Career goals' },
    { key: 'skill_unlisted', nudge: 'Skills not on resume' },
    { key: 'project_detail', nudge: 'Projects you have worked on' },
    { key: 'motivation', nudge: 'What drives you' },
    { key: 'hobby', nudge: 'Hobbies and interests' },
    { key: 'personality', nudge: 'Work style and personality' },
    { key: 'strength', nudge: 'Your strengths' },
    { key: 'company_culture_pref', nudge: 'Ideal workplace' },
    { key: 'availability', nudge: 'When you can start' },
  ];
  const filledCore = CORE_CATEGORIES.filter(c => (data?.grouped?.[c.key]?.length ?? 0) > 0);
  const missingCore = CORE_CATEGORIES.filter(c => (data?.grouped?.[c.key]?.length ?? 0) === 0);
  const completeness = CORE_CATEGORIES.length > 0 ? Math.round((filledCore.length / CORE_CATEGORIES.length) * 100) : 0;
  const compColor = completeness >= 70 ? '#34C759' : completeness >= 40 ? '#FF9F0A' : '#FF453A';

  const selectedCfg = selected ? (CATEGORY_CONFIG[selected] || { label: selected, color: '#888' }) : null;
  const selectedFacts = selected ? (data?.grouped?.[selected] ?? []) : [];

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-3)' }}>
        Loading your Dilly Profile...
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--surface-0)' }}>

      {/* ── Left column: overview + category list ─────────────────────── */}
      <div style={{ width: 320, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border-main)', padding: '32px 20px 32px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div>
          <h1
            className="text-xl font-bold tracking-wide mb-1"
            style={{ fontFamily: "'Cinzel', serif", color: 'var(--text-1)' }}
          >
            My Dilly Profile
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-3)', lineHeight: 1.5 }}>
            Everything Dilly knows about you.
          </p>
        </div>

        {/* Narrative Card */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface-1)', border: '1px solid rgba(201,168,76,0.25)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: '#2B3A8E', fontSize: 13 }}>✦</span>
            <span
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ fontFamily: "'Cinzel', serif", color: '#2B3A8E' }}
            >
              What Dilly Knows
            </span>
            {data?.narrative_updated_relative && (
              <span className="ml-auto text-[10px]" style={{ color: 'var(--text-3)' }}>
                {data.narrative_updated_relative}
              </span>
            )}
          </div>
          {data?.narrative ? (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
              {data.narrative}
            </p>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {totalFacts === 0 ? 'Your profile is empty. Populate it from your resume or chat with Dilly.' : 'Chat with Dilly to keep building your profile.'}
            </p>
          )}
          {totalFacts < 5 && (
            <div style={{ marginTop: data?.narrative || totalFacts > 0 ? 10 : 8 }}>
              <button
                onClick={seedFromResume}
                disabled={seeding}
                style={{
                  width: '100%', height: 30, borderRadius: 7, fontSize: 11, fontWeight: 700,
                  color: '#fff', background: seeding ? 'var(--surface-2)' : '#2B3A8E',
                  border: 'none', cursor: seeding ? 'default' : 'pointer', transition: 'opacity 140ms',
                }}
              >
                {seeding ? 'Reading your resume…' : 'Populate from resume ✦'}
              </button>
              {seedMsg && (
                <p className="text-xs mt-2" style={{ color: seedMsg.startsWith('Added') ? '#34C759' : 'var(--text-3)' }}>
                  {seedMsg}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Completeness */}
        {totalFacts > 0 && completeness < 100 && (
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ fontFamily: "'Cinzel', serif", color: 'var(--text-3)' }}>
                Profile Strength
              </p>
              <span className="text-sm font-bold font-mono" style={{ color: compColor }}>{completeness}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${completeness}%`, background: compColor }} />
            </div>
            {missingCore.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {missingCore.slice(0, 3).map(m => {
                  const cfg = CATEGORY_CONFIG[m.key];
                  return (
                    <span key={m.key} className="text-[10px] px-2 py-1 rounded-md"
                      style={{ background: 'var(--surface-2)', color: cfg?.color || 'var(--text-2)' }}>
                      {m.nudge}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Add to profile */}
        <button
          onClick={() => { setSelected('__add__'); setAddingTo(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
            borderRadius: 10, border: '1.5px dashed var(--border-main)', background: 'none',
            cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 140ms ease',
            color: 'var(--text-2)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2B3A8E'; (e.currentTarget as HTMLElement).style.color = '#2B3A8E'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-main)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
        >
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(59,76,192,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2B3A8E" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Add to profile</span>
        </button>

        {/* Category list */}
        {orderedCategories.length > 0 && (
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ fontFamily: "'Cinzel', serif", color: 'var(--text-3)' }}>
              What Dilly Knows About You
            </p>
            <div className="flex flex-col gap-1">
              {orderedCategories.map(cat => {
                const cfg = CATEGORY_CONFIG[cat] || { label: cat, color: '#888' };
                const facts = data!.grouped[cat];
                const isSelected = selected === cat;

                return (
                  <button
                    key={cat}
                    onClick={() => setSelected(isSelected ? null : cat)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 10, textAlign: 'left',
                      background: isSelected ? `${cfg.color}15` : 'transparent',
                      border: `1px solid ${isSelected ? `${cfg.color}35` : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                      width: '100%',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-1)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                      background: cfg.color + '20', color: cfg.color,
                    }}>
                      {facts.length}
                    </div>
                    <span style={{
                      flex: 1, fontSize: 13, fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? cfg.color : 'var(--text-1)',
                    }}>
                      {cfg.label}
                    </span>
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke={cfg.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats footer */}
        {totalFacts > 0 && (
          <p className="text-[10px] text-center" style={{ color: 'var(--text-3)', marginTop: 'auto', paddingTop: 8 }}>
            {totalFacts} fact{totalFacts !== 1 ? 's' : ''} learned
            {sessionCount > 0 ? ` · ${sessionCount} conversation${sessionCount !== 1 ? 's' : ''}` : ''}
          </p>
        )}

        {/* Empty state */}
        {orderedCategories.length === 0 && !loading && (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="text-3xl mb-3" style={{ color: 'var(--text-3)' }}>💬</div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-1)', fontFamily: "'Cinzel', serif" }}>Your profile is empty</p>
            <p className="text-xs max-w-[220px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Every time you chat with Dilly, it learns about you. The more you talk, the more personalized your experience becomes.
            </p>
          </div>
        )}
      </div>

      {/* ── Right column: detail panel ────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 32px' }}>
        {selected === '__add__' ? (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
              Add to your profile
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.6 }}>
              Pick a category, then tell Dilly what you want to add.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {CATEGORY_ORDER.map(cat => {
                const cfg = CATEGORY_CONFIG[cat];
                if (!cfg) return null;
                return (
                  <button
                    key={cat}
                    onClick={() => { setSelected(cat); setAddingTo(cat); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                      borderRadius: 10, border: '1px solid var(--border-main)',
                      background: 'var(--surface-1)', cursor: 'pointer', textAlign: 'left',
                      transition: 'all 140ms ease',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = cfg.color + '60'; (e.currentTarget as HTMLElement).style.background = cfg.color + '0a'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-main)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-1)'; }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)' }}>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : selected && selectedCfg ? (
          <div style={{ maxWidth: 600 }}>
            {/* Detail header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: selectedCfg.color + '20', color: selectedCfg.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700,
              }}>
                {selectedFacts.length}
              </div>
              <div>
                <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: 16, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
                  {selectedCfg.label}
                </h2>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  {selectedFacts.length} fact{selectedFacts.length !== 1 ? 's' : ''} Dilly knows about this
                </p>
              </div>
            </div>

            {/* Fact cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {selectedFacts.map((fact) => {
                const isEditing = editingId === fact.id;
                return (
                  <div
                    key={fact.id}
                    className="group"
                    style={{
                      padding: '14px 16px', borderRadius: 12,
                      background: 'var(--surface-1)',
                      border: `1px solid ${isEditing ? selectedCfg.color + '40' : 'var(--border-main)'}`,
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          style={{
                            width: '100%', borderRadius: 7, padding: '7px 10px', fontSize: 13, fontWeight: 600,
                            outline: 'none', background: 'var(--surface-2)',
                            border: '1px solid var(--border-main)', color: 'var(--text-1)',
                          }}
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          placeholder="Title"
                          autoFocus
                          onKeyDown={e => e.key === 'Escape' && setEditingId(null)}
                        />
                        <textarea
                          style={{
                            width: '100%', borderRadius: 7, padding: '7px 10px', fontSize: 12,
                            outline: 'none', background: 'var(--surface-2)',
                            border: '1px solid var(--border-main)', color: 'var(--text-1)',
                            resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 56,
                          }}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          placeholder="Details"
                          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(fact.id); if (e.key === 'Escape') setEditingId(null); }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            style={{
                              padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                              background: selectedCfg.color, color: '#1a1400', cursor: 'pointer', border: 'none',
                            }}
                            onClick={() => saveEdit(fact.id)}
                          >
                            Save
                          </button>
                          <button
                            style={{
                              padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                              background: 'transparent', border: '1px solid var(--border-main)', color: 'var(--text-3)',
                            }}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%', background: selectedCfg.color,
                          flexShrink: 0, marginTop: 6,
                        }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>
                            {fact.label}
                          </p>
                          <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                            {fact.value}
                          </p>
                          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                            {fact.confidence === 'high' ? 'High confidence' : fact.confidence === 'low' ? 'Low confidence' : 'Medium confidence'}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            style={{ padding: '4px 6px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                            title="Edit"
                            onClick={() => startEdit(fact)}
                            onMouseEnter={e => (e.currentTarget.style.color = selectedCfg.color)}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button
                            style={{ padding: '4px 6px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                            title="Remove"
                            onClick={() => deleteFact(fact.id)}
                            onMouseEnter={e => (e.currentTarget.style.color = '#FF453A')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add fact */}
            {addingTo === selected ? (
              <div
                style={{
                  padding: '16px', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10,
                  background: 'var(--surface-1)', border: `1px solid ${selectedCfg.color}30`,
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 600, color: selectedCfg.color, marginBottom: 2 }}>
                  Add to {selectedCfg.label}
                </p>
                <input
                  style={{
                    width: '100%', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none',
                    background: 'var(--surface-2)', border: '1px solid var(--border-main)', color: 'var(--text-1)',
                  }}
                  placeholder="Title (e.g. Rock climbing)"
                  value={addLabel}
                  onChange={e => setAddLabel(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addValue.trim() && handleAddFact()}
                />
                <textarea
                  style={{
                    width: '100%', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none',
                    background: 'var(--surface-2)', border: '1px solid var(--border-main)', color: 'var(--text-1)',
                    resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 64,
                  }}
                  placeholder="Details (e.g. Play club soccer at UTampa, midfielder, 3x/week)"
                  value={addValue}
                  onChange={e => setAddValue(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{
                      padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: selectedCfg.color, color: '#1a1400', cursor: 'pointer', border: 'none',
                      fontFamily: "'Cinzel', serif", letterSpacing: '0.4px',
                    }}
                    onClick={handleAddFact}
                  >
                    Add to Profile
                  </button>
                  <button
                    style={{
                      padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      background: 'transparent', border: '1px solid var(--border-main)', color: 'var(--text-3)',
                    }}
                    onClick={() => { setAddingTo(null); setAddLabel(''); setAddValue(''); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
                  borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: selectedCfg.color, background: selectedCfg.color + '10',
                  border: `1px dashed ${selectedCfg.color}40`, width: '100%',
                }}
                onClick={() => setAddingTo(selected)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                Add a {selectedCfg.label.toLowerCase().replace(/s$/, '')}
              </button>
            )}
          </div>
        ) : (
          /* Empty state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', opacity: 0.5 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
            <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 200, lineHeight: 1.6 }}>
              Select a category on the left to see what Dilly knows
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
