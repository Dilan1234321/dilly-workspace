'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

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
  achievement:          { label: 'Achievements',         color: '#C9A84C' },
  goal:                 { label: 'Goals',                color: '#34C759' },
  target_company:       { label: 'Target Companies',     color: '#3B4CC0' },
  skill_unlisted:       { label: 'Unlisted Skills',      color: '#3B4CC0' },
  project_detail:       { label: 'Project Details',      color: '#34C759' },
  motivation:           { label: 'Motivations',          color: '#FF6B8A' },
  personality:          { label: 'Personality & Style',   color: '#5E5CE6' },
  soft_skill:           { label: 'Soft Skills',          color: '#5E5CE6' },
  hobby:                { label: 'Hobbies & Interests',  color: '#FF9F0A' },
  life_context:         { label: 'Life Context',         color: '#FF9F0A' },
  company_culture_pref: { label: 'Culture Preferences',  color: '#C9A84C' },
  strength:             { label: 'Strengths',            color: '#34C759' },
  weakness:             { label: 'Growth Areas',         color: '#FF453A' },
  challenge:            { label: 'Challenges',           color: '#FF453A' },
  concern:              { label: 'Concerns',             color: '#FF9F0A' },
  availability:         { label: 'Availability',         color: '#3B4CC0' },
  deadline:             { label: 'Deadlines',            color: '#FF453A' },
  interview:            { label: 'Interviews',           color: '#C9A84C' },
  rejection:            { label: 'Rejections',           color: '#FF453A' },
  preference:           { label: 'Preferences',          color: '#5E5CE6' },
  mentioned_but_not_done: { label: 'To Do',             color: '#FF9F0A' },
  person_to_follow_up:  { label: 'Follow Up',            color: '#34C759' },
};

const CATEGORY_ORDER = [
  'achievement', 'goal', 'target_company',
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
  const [data, setData] = useState<MemorySurface | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addLabel, setAddLabel] = useState('');
  const [addValue, setAddValue] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const json = await apiFetch('/memory');
      setData(json);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function deleteFact(id: string) {
    if (!confirm('Remove this fact? Dilly will forget it.')) return;
    try {
      await apiFetch(`/memory/items/${id}`, { method: 'DELETE' });
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

  async function handleAddFact() {
    if (!addingTo || !addLabel.trim()) return;
    try {
      await apiFetch('/memory/items', {
        method: 'POST',
        body: JSON.stringify({
          category: addingTo,
          label: addLabel.trim().slice(0, 80),
          value: addValue.trim() || addLabel.trim(),
          source: 'profile',
          confidence: 'high',
        }),
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

  // Completeness
  const CORE_CATEGORIES = [
    { key: 'goal', nudge: 'Career goals' },
    { key: 'target_company', nudge: 'Dream companies' },
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
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--surface-0)' }}>
      <div className="max-w-3xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-2xl font-bold tracking-wide mb-1"
            style={{ fontFamily: "'Cinzel', serif", color: 'var(--text-1)' }}
          >
            My Dilly Profile
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Everything Dilly knows about you — from conversations, your resume, and onboarding.
          </p>
        </div>

        {/* Narrative Card */}
        <div
          className="rounded-xl p-5 mb-8"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid rgba(201,168,76,0.25)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: '#C9A84C', fontSize: 16 }}>&#10024;</span>
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ fontFamily: "'Cinzel', serif", color: '#C9A84C' }}
            >
              What Dilly Knows
            </span>
            {data?.narrative_updated_relative && (
              <span className="ml-auto text-xs" style={{ color: 'var(--text-3)' }}>
                {data.narrative_updated_relative}
              </span>
            )}
          </div>
          {data?.narrative ? (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-1)' }}>
              {data.narrative}
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Chat with Dilly to start building your profile. The more you talk, the better Dilly knows you.
            </p>
          )}
        </div>

        {/* Completeness Card */}
        {totalFacts > 0 && completeness < 100 && (
          <div
            className="rounded-xl p-5 mb-8"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ fontFamily: "'Cinzel', serif", color: 'var(--text-3)' }}>
                  Profile Strength
                </p>
                <p className="text-xl font-bold" style={{ fontFamily: "'Cinzel', serif" }}>
                  <span style={{ color: compColor }}>{completeness}%</span>
                  <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-3)' }}>complete</span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono" style={{ color: compColor }}>{filledCore.length}/{CORE_CATEGORIES.length}</p>
                <p className="text-[9px]" style={{ color: 'var(--text-3)' }}>areas filled</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${completeness}%`, background: compColor }} />
            </div>

            {/* Missing nudges */}
            {missingCore.length > 0 && (
              <div>
                <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>Tell Dilly more about:</p>
                <div className="flex flex-wrap gap-2">
                  {missingCore.slice(0, 4).map(m => {
                    const cfg = CATEGORY_CONFIG[m.key];
                    return (
                      <span
                        key={m.key}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface-2)', color: cfg?.color || 'var(--text-2)' }}
                      >
                        {m.nudge}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fact Categories */}
        {orderedCategories.length > 0 ? (
          <>
            <h2
              className="text-xs font-bold tracking-widest uppercase mb-4"
              style={{ fontFamily: "'Cinzel', serif", color: 'var(--text-3)' }}
            >
              What Dilly Knows About You
            </h2>

            <div className="flex flex-col gap-2 mb-8">
              {orderedCategories.map(cat => {
                const cfg = CATEGORY_CONFIG[cat] || { label: cat, color: '#888' };
                const facts = data!.grouped[cat];
                const isOpen = expanded === cat;

                return (
                  <div
                    key={cat}
                    className="rounded-xl overflow-hidden"
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border-main)',
                    }}
                  >
                    {/* Category Header */}
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                      onClick={() => setExpanded(isOpen ? null : cat)}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{ background: cfg.color + '20', color: cfg.color }}
                      >
                        {facts.length}
                      </div>
                      <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                        {cfg.label}
                      </span>
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                        style={{ color: 'var(--text-3)', transform: isOpen ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>

                    {/* Facts */}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border-main)' }}>
                        {facts.map((fact, i) => (
                          <div
                            key={fact.id}
                            className="flex items-start gap-3 px-4 py-3 group"
                            style={{ borderBottom: i < facts.length - 1 ? '1px solid var(--border-main)' : undefined }}
                          >
                            <div className="flex-1">
                              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                                {fact.label}
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                                {fact.value}
                              </p>
                              <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>
                                {fact.confidence === 'high' ? 'High confidence' : fact.confidence === 'low' ? 'Low confidence' : 'Medium confidence'}
                                {fact.source !== 'voice' ? ` · ${fact.source}` : ''}
                              </p>
                            </div>
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/10 rounded"
                              onClick={() => deleteFact(fact.id)}
                              title="Remove"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        ))}

                        {/* Add fact inline */}
                        {addingTo === cat ? (
                          <div className="px-4 py-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border-main)' }}>
                            <input
                              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                              style={{
                                background: 'var(--surface-2)',
                                border: '1px solid var(--border-main)',
                                color: 'var(--text-1)',
                              }}
                              placeholder="Title (e.g. Rock climbing)"
                              value={addLabel}
                              onChange={e => setAddLabel(e.target.value)}
                              autoFocus
                              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addValue.trim() && handleAddFact()}
                            />
                            <textarea
                              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                              style={{
                                background: 'var(--surface-2)',
                                border: '1px solid var(--border-main)',
                                color: 'var(--text-1)',
                                minHeight: 56,
                              }}
                              placeholder="Details (e.g. Play club soccer at UTampa, midfielder, 3x/week)"
                              value={addValue}
                              onChange={e => setAddValue(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button
                                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold"
                                style={{
                                  background: cfg.color,
                                  color: '#1a1400',
                                  fontFamily: "'Cinzel', serif",
                                  letterSpacing: '0.5px',
                                }}
                                onClick={handleAddFact}
                              >
                                Add to Profile
                              </button>
                              <button
                                className="rounded-lg px-4 py-2 text-xs"
                                style={{ color: 'var(--text-3)', border: '1px solid var(--border-main)' }}
                                onClick={() => { setAddingTo(null); setAddLabel(''); setAddValue(''); }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold hover:opacity-80 transition-opacity"
                            style={{ color: cfg.color, borderTop: '1px solid var(--border-main)' }}
                            onClick={() => setAddingTo(cat)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                            </svg>
                            Add
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="text-4xl mb-4" style={{ color: 'var(--text-3)' }}>&#128172;</div>
            <h2
              className="text-lg font-bold mb-2"
              style={{ fontFamily: "'Cinzel', serif", color: 'var(--text-1)' }}
            >
              Your profile is empty
            </h2>
            <p className="text-sm max-w-sm mb-6" style={{ color: 'var(--text-3)' }}>
              Every time you chat with Dilly, it learns about you — your goals, skills, interests, and more. The more you talk, the more personalized your experience becomes.
            </p>
          </div>
        )}

        {/* Stats Footer */}
        {totalFacts > 0 && (
          <p className="text-center text-xs mb-8" style={{ color: 'var(--text-3)' }}>
            {totalFacts} fact{totalFacts !== 1 ? 's' : ''} learned
            {sessionCount > 0 ? ` from ${sessionCount} conversation${sessionCount !== 1 ? 's' : ''}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
