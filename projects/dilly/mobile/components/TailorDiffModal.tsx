/**
 * TailorDiffModal — rich before/after viewer for /resume/tailor-diff.
 *
 * Workflow:
 *   1. Parent shows a small setup modal (company + role + optional JD paste)
 *      → calls POST /resume/tailor-diff, hands the response to this component
 *   2. This modal renders:
 *        - Headline summary (one sentence from Claude)
 *        - Per-experience diff cards with before/after bullets
 *        - Skills diff with +/− chips
 *        - Accept All / Reject All / per-bullet toggles
 *   3. On Accept, parent persists the (possibly partially-accepted) result
 *      as a new variant via POST /resume/variants
 *
 * This file is the rendering layer only. Networking + variant creation live
 * in resume-editor.tsx, which passes `diff` + `onAcceptAll` + `onReject`.
 */

import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  TouchableOpacity, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/tokens';
import AnimatedPressable from './AnimatedPressable';

const GOLD = '#2B3A8E';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const CORAL = '#FF453A';
const BLUE = '#0A84FF';

// ── Types (mirror /resume/tailor-diff response) ─────────────────────────

type BulletDiff = {
  kind: 'added' | 'removed' | 'modified' | 'unchanged';
  base_text: string | null;
  tailored_text: string | null;
  changed_words?: Array<{ op: 'added' | 'removed'; words: string[] }>;
};

type ExperienceEntry = {
  company: string;
  role: string;
  date: string;
  bullets: Array<{ text: string }>;
};

type ExperienceDiff = {
  kind: 'added' | 'removed' | 'modified' | 'unchanged';
  base: ExperienceEntry | null;
  tailored: ExperienceEntry | null;
  bullet_diffs: BulletDiff[];
  reorder_rank: number | null;
};

type SkillsDiff = {
  added: string[];
  removed: string[];
  kept: string[];
};

export type TailorDiffPayload = {
  headline_summary: string;
  tailored_sections: any[];
  base_sections: any[];
  experience_diffs: ExperienceDiff[];
  skills_diff: SkillsDiff;
  cohort: string;
  job_title: string;
  job_company: string;
};

function kindColor(kind: string): string {
  switch (kind) {
    case 'added':     return GREEN;
    case 'removed':   return CORAL;
    case 'modified':  return AMBER;
    case 'unchanged': return colors.t3;
    default:          return colors.t3;
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'added':     return 'NEW';
    case 'removed':   return 'DROPPED';
    case 'modified':  return 'REWRITTEN';
    case 'unchanged': return 'KEPT';
    default:          return kind.toUpperCase();
  }
}

// ── Bullet diff row ────────────────────────────────────────────────────

function BulletRow({ diff, accepted, onToggle }: {
  diff: BulletDiff;
  accepted: boolean;
  onToggle: () => void;
}) {
  const color = kindColor(diff.kind);
  const label = kindLabel(diff.kind);

  if (diff.kind === 'unchanged') {
    return (
      <View style={s.bulletRowUnchanged}>
        <Text style={s.bulletUnchangedText} numberOfLines={3}>• {diff.tailored_text}</Text>
      </View>
    );
  }

  return (
    <Pressable onPress={onToggle} style={s.bulletRow}>
      <View style={s.bulletRowHeader}>
        <View style={[s.bulletKindPill, { backgroundColor: color + '18', borderColor: color + '35' }]}>
          <Text style={[s.bulletKindText, { color }]}>{label}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[
          s.acceptCheckbox,
          accepted ? { backgroundColor: GOLD, borderColor: GOLD } : { borderColor: colors.b1 },
        ]}>
          {accepted && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
        </View>
      </View>

      {diff.base_text && (
        <View style={[s.bulletBlock, { backgroundColor: CORAL + '08', borderColor: CORAL + '20' }]}>
          <Text style={s.bulletBlockLabel}>BEFORE</Text>
          <Text style={s.bulletBlockText}>{diff.base_text}</Text>
        </View>
      )}
      {diff.tailored_text && (
        <View style={[s.bulletBlock, { backgroundColor: GREEN + '08', borderColor: GREEN + '20', marginTop: 4 }]}>
          <Text style={s.bulletBlockLabel}>AFTER</Text>
          <Text style={s.bulletBlockText}>{diff.tailored_text}</Text>
        </View>
      )}

      {diff.changed_words && diff.changed_words.length > 0 && (
        <View style={s.changedWordsRow}>
          {diff.changed_words.map((cw, i) => {
            if (!cw.words || cw.words.length === 0) return null;
            const c = cw.op === 'added' ? GREEN : CORAL;
            return (
              <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                {cw.words.slice(0, 6).map((w, j) => (
                  <View key={j} style={[
                    s.changedWordChip,
                    { backgroundColor: c + '12', borderColor: c + '30' },
                  ]}>
                    <Text style={[s.changedWordText, { color: c }]}>
                      {cw.op === 'added' ? '+' : '−'}{w}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

// ── Experience diff card ───────────────────────────────────────────────

function ExperienceCard({ diff, acceptedMap, onToggleBullet }: {
  diff: ExperienceDiff;
  acceptedMap: Record<string, boolean>;
  onToggleBullet: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(diff.kind !== 'unchanged');
  const color = kindColor(diff.kind);
  const label = kindLabel(diff.kind);
  const entry = diff.tailored || diff.base;
  if (!entry) return null;

  const modifiedCount = diff.bullet_diffs.filter(b => b.kind !== 'unchanged').length;

  return (
    <View style={[s.expCard, { borderLeftColor: color }]}>
      <Pressable onPress={() => setExpanded(v => !v)} style={s.expHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[s.kindPill, { backgroundColor: color + '15' }]}>
              <Text style={[s.kindPillText, { color }]}>{label}</Text>
            </View>
            <Text style={s.expCompany} numberOfLines={1}>{entry.company}</Text>
          </View>
          <Text style={s.expRole} numberOfLines={1}>{entry.role} · {entry.date}</Text>
          {diff.kind === 'modified' && modifiedCount > 0 && (
            <Text style={s.expStats}>{modifiedCount} of {diff.bullet_diffs.length} bullets changed</Text>
          )}
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.t3} />
      </Pressable>

      {expanded && (
        <View style={s.expBody}>
          {diff.bullet_diffs.map((bd, i) => {
            const key = `${diff.tailored?.company || diff.base?.company}-${i}`;
            const accepted = acceptedMap[key] !== false; // default accepted
            return (
              <BulletRow
                key={key}
                diff={bd}
                accepted={accepted}
                onToggle={() => onToggleBullet(key)}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Skills diff ────────────────────────────────────────────────────────

function SkillsDiffBlock({ skills }: { skills: SkillsDiff }) {
  const hasAny = skills.added.length > 0 || skills.removed.length > 0;
  if (!hasAny && skills.kept.length === 0) return null;
  return (
    <View style={s.skillsWrap}>
      <Text style={s.sectionLabel}>SKILLS</Text>
      <View style={s.skillsGrid}>
        {skills.added.map(k => (
          <View key={`a-${k}`} style={[s.skillChip, { backgroundColor: GREEN + '15', borderColor: GREEN + '30' }]}>
            <Ionicons name="add" size={10} color={GREEN} />
            <Text style={[s.skillChipText, { color: GREEN }]}>{k}</Text>
          </View>
        ))}
        {skills.removed.map(k => (
          <View key={`r-${k}`} style={[s.skillChip, { backgroundColor: CORAL + '12', borderColor: CORAL + '25' }]}>
            <Ionicons name="remove" size={10} color={CORAL} />
            <Text style={[s.skillChipText, { color: CORAL, textDecorationLine: 'line-through' }]}>{k}</Text>
          </View>
        ))}
        {skills.kept.map(k => (
          <View key={`k-${k}`} style={[s.skillChip, { backgroundColor: colors.s3, borderColor: colors.b1 }]}>
            <Text style={s.skillChipText}>{k}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────

export default function TailorDiffModal({
  visible, loading, diff, onClose, onAcceptAll, onAcceptSelected,
}: {
  visible: boolean;
  loading: boolean;
  diff: TailorDiffPayload | null;
  onClose: () => void;
  onAcceptAll: () => void;
  onAcceptSelected?: (acceptedBulletKeys: string[]) => void;
}) {
  // Track which bullet changes the user explicitly rejected
  const [rejectedKeys, setRejectedKeys] = useState<Record<string, boolean>>({});

  const acceptedMap = useMemo(() => {
    const out: Record<string, boolean> = {};
    if (!diff) return out;
    for (const exp of diff.experience_diffs) {
      exp.bullet_diffs.forEach((bd, i) => {
        const key = `${exp.tailored?.company || exp.base?.company}-${i}`;
        out[key] = !rejectedKeys[key];
      });
    }
    return out;
  }, [diff, rejectedKeys]);

  function toggleBullet(key: string) {
    setRejectedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function handleAcceptSelected() {
    const acceptedKeys = Object.entries(acceptedMap)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (onAcceptSelected) onAcceptSelected(acceptedKeys);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Nav */}
        <View style={s.navBar}>
          <AnimatedPressable onPress={onClose} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.t1} />
          </AnimatedPressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.navTitle} numberOfLines={1}>
              {diff ? `${diff.job_title}` : 'Tailoring…'}
            </Text>
            {diff && (
              <Text style={s.navSub} numberOfLines={1}>{diff.job_company}</Text>
            )}
          </View>
          <View style={{ width: 22 }} />
        </View>

        {/* Loading */}
        {loading && (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={GOLD} />
            <Text style={s.loadingText}>Rewriting your resume for this role…</Text>
            <Text style={s.loadingSub}>This takes 15-30 seconds.</Text>
          </View>
        )}

        {!loading && !diff && (
          <View style={s.loadingWrap}>
            <Ionicons name="alert-circle" size={22} color={CORAL} />
            <Text style={s.loadingText}>Couldn't generate a tailored version.</Text>
          </View>
        )}

        {!loading && diff && (
          <ScrollView contentContainerStyle={s.scroll}>
            {/* Headline */}
            {diff.headline_summary && (
              <View style={s.headlineCard}>
                <Ionicons name="sparkles" size={14} color={GOLD} />
                <Text style={s.headlineText}>{diff.headline_summary}</Text>
              </View>
            )}

            <Text style={s.sectionLabel}>EXPERIENCE CHANGES</Text>
            {diff.experience_diffs.map((d, i) => (
              <ExperienceCard
                key={i}
                diff={d}
                acceptedMap={acceptedMap}
                onToggleBullet={toggleBullet}
              />
            ))}

            <SkillsDiffBlock skills={diff.skills_diff} />

            {/* Footer action buttons */}
            <View style={s.footerRow}>
              <AnimatedPressable style={s.rejectBtn} onPress={onClose} scaleDown={0.97}>
                <Text style={s.rejectBtnText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable style={s.acceptBtn} onPress={onAcceptAll} scaleDown={0.97}>
                <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                <Text style={s.acceptBtnText}>Save as new variant</Text>
              </AnimatedPressable>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 48, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  navTitle: { fontSize: 15, fontWeight: '700', color: colors.t1 },
  navSub: { fontSize: 11, color: colors.t3, marginTop: 1 },
  scroll: { padding: 18, paddingBottom: 80 },

  loadingWrap: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  loadingText: { fontSize: 13, color: colors.t1, fontWeight: '600' },
  loadingSub: { fontSize: 11, color: colors.t3 },

  headlineCard: {
    flexDirection: 'row', gap: 10,
    backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    padding: 14, marginBottom: 18,
  },
  headlineText: { flex: 1, fontSize: 13, color: colors.t1, lineHeight: 19 },

  sectionLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.3, color: GOLD,
    marginBottom: 10, marginTop: 8,
  },

  // Experience card
  expCard: {
    backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    borderLeftWidth: 4, padding: 14, marginBottom: 10,
  },
  expHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  kindPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  kindPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  expCompany: { fontSize: 14, fontWeight: '700', color: colors.t1, flex: 1 },
  expRole: { fontSize: 11, color: colors.t3, marginTop: 2 },
  expStats: { fontSize: 10, color: AMBER, fontWeight: '600', marginTop: 4 },
  expBody: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.b1 },

  // Bullet row
  bulletRow: {
    backgroundColor: colors.s3, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    padding: 10, marginBottom: 8,
  },
  bulletRowHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  bulletKindPill: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  bulletKindText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  acceptCheckbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  bulletBlock: { borderRadius: 6, borderWidth: 1, padding: 8 },
  bulletBlockLabel: { fontSize: 8, color: colors.t3, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  bulletBlockText: { fontSize: 12, color: colors.t1, lineHeight: 17 },

  bulletRowUnchanged: {
    backgroundColor: colors.s3 + '50', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4,
  },
  bulletUnchangedText: { fontSize: 11, color: colors.t3, lineHeight: 16 },

  changedWordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  changedWordChip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  changedWordText: { fontSize: 9, fontWeight: '600' },

  // Skills
  skillsWrap: { marginTop: 18, marginBottom: 18 },
  skillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5,
  },
  skillChipText: { fontSize: 11, color: colors.t1, fontWeight: '600' },

  // Footer
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  rejectBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.b1, borderRadius: 12, paddingVertical: 13,
  },
  rejectBtnText: { fontSize: 12, color: colors.t3, fontWeight: '600' },
  acceptBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 13,
  },
  acceptBtnText: { fontSize: 12, color: '#FFFFFF', fontWeight: '700' },
});
