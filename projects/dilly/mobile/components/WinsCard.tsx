/**
 * WinsCard — positive-reinforcement retention lever on Home.
 *
 * Opening the app to log good news builds an association: "this is
 * where my progress lives." The card also shows your 3 most recent
 * wins so every return visit gets a small hit of "look how far you've
 * come."
 *
 * UX:
 *   - Compact summary line ("3 applied · 1 interview this month")
 *   - Last 3 wins with type icon + title + when
 *   - "Log a win" primary button -> opens LogWinSheet below
 *   - Log an applied/interview/offer/milestone -> triggerCelebration
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../lib/dilly';
import { useResolvedTheme } from '../hooks/useTheme';
import AnimatedPressable from './AnimatedPressable';
import { triggerCelebration } from '../hooks/useCelebration';
import { scheduleOutcomePushes } from '../hooks/useOutcomePushes';

type WinType = 'applied' | 'interview' | 'offer' | 'milestone';

interface Win {
  id: string;
  type: WinType;
  title: string;
  note?: string | null;
  company?: string | null;
  date: string;
  created_at: string;
}

interface WinsResponse {
  ok: boolean;
  wins: Win[];
  total: number;
  this_month: Partial<Record<WinType, number>>;
}

const TYPE_META: Record<WinType, { icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; label: string }> = {
  applied:   { icon: 'paper-plane',    label: 'Applied' },
  interview: { icon: 'chatbubbles',    label: 'Interview' },
  offer:     { icon: 'trophy',         label: 'Offer' },
  milestone: { icon: 'flag',           label: 'Milestone' },
};

function whenLabel(dateIso: string): string {
  try {
    const d = new Date(dateIso + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const gap = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (gap === 0) return 'today';
    if (gap === 1) return 'yesterday';
    if (gap < 7) return `${gap}d ago`;
    if (gap < 30) return `${Math.round(gap / 7)}w ago`;
    return `${Math.round(gap / 30)}mo ago`;
  } catch {
    return '';
  }
}

export default function WinsCard() {
  const theme = useResolvedTheme();
  const [data, setData]     = useState<WinsResponse | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = (await dilly.get('/wins?limit=3')) as WinsResponse;
      setData(r);
    } catch (_e) {
      // Silent — this is a secondary surface.
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onLogged = useCallback((win: Win) => {
    // Fire the appropriate celebration overlay. 'applied' reuses the
    // existing one-shot applied-job milestone for backwards-compat;
    // the win-* variants are always-fire.
    if (win.type === 'applied')        triggerCelebration('applied-job');
    else if (win.type === 'interview') triggerCelebration('win-interview');
    else if (win.type === 'offer')     triggerCelebration('win-offer');
    else                                triggerCelebration('win-milestone');
    // Refresh the list.
    load();
  }, [load]);

  const hasAny = data && data.wins.length > 0;
  const thisMonth = data?.this_month || {};
  const summaryParts: string[] = [];
  (['applied', 'interview', 'offer', 'milestone'] as WinType[]).forEach(t => {
    const n = thisMonth[t] || 0;
    if (n > 0) summaryParts.push(`${n} ${TYPE_META[t].label.toLowerCase()}${n === 1 ? '' : 's'}`);
  });
  const summary = summaryParts.length > 0
    ? summaryParts.join(' · ') + ' this month'
    : 'No wins logged yet';

  return (
    <>
      <View style={[
        s.card,
        { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
      ]}>
        <View style={s.header}>
          <View style={[s.dot, { backgroundColor: theme.accent }]} />
          <Text style={[s.eyebrow, { color: theme.accent }]}>YOUR WINS</Text>
          <Text style={[s.summary, { color: theme.surface.t2 }]}> · {summary}</Text>
        </View>

        {hasAny ? (
          <View style={{ marginTop: 8, gap: 6 }}>
            {data!.wins.map(w => (
              <View key={w.id} style={s.winRow}>
                <View style={[s.iconWrap, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name={TYPE_META[w.type].icon} size={13} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.winTitle, { color: theme.surface.t1 }]} numberOfLines={1}>
                    {w.title}
                    {w.company ? <Text style={{ color: theme.surface.t3, fontWeight: '500' }}> · {w.company}</Text> : null}
                  </Text>
                </View>
                <Text style={[s.winWhen, { color: theme.surface.t3 }]}>{whenLabel(w.date)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[s.emptyCopy, { color: theme.surface.t2 }]}>
            Log your first win. Every application, interview, and offer adds up.
          </Text>
        )}

        <AnimatedPressable
          onPress={() => setLogOpen(true)}
          scaleDown={0.97}
          style={[s.cta, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="add" size={15} color="#FFFFFF" />
          <Text style={s.ctaText}>Log a win</Text>
        </AnimatedPressable>
      </View>

      <LogWinSheet
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        onLogged={(w) => { setLogOpen(false); onLogged(w); }}
      />
    </>
  );
}

function LogWinSheet({
  visible,
  onClose,
  onLogged,
}: {
  visible: boolean;
  onClose: () => void;
  onLogged: (w: Win) => void;
}) {
  const theme = useResolvedTheme();
  const [type, setType]       = useState<WinType>('applied');
  const [title, setTitle]     = useState('');
  const [company, setCompany] = useState('');
  const [note, setNote]       = useState('');
  // Optional upcoming-event date for interviews / offers. YYYY-MM-DD
  // free-text — kept simple because adding a native date picker pulls
  // in a dependency we don't need for v1. Validated before scheduling.
  const [upcomingDate, setUpcomingDate] = useState('');
  const [saving, setSaving]   = useState(false);

  const reset = () => {
    setType('applied');
    setTitle('');
    setCompany('');
    setNote('');
    setUpcomingDate('');
    setSaving(false);
  };

  const submit = useCallback(async () => {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const res = await dilly.fetch('/wins', {
        method: 'POST',
        body: JSON.stringify({
          type,
          title: t,
          company: company.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setSaving(false);
        return;
      }
      const data = await res.json();
      const win = data.win as Win;

      // Outcome push: if the user logged an interview or offer with a
      // future date, schedule a T-18h prep nudge + day-of "good luck"
      // ping. Tapping the prep push opens the AI chat overlay seeded
      // with the event so they land in a prep conversation. Silently
      // no-ops when the date is blank, malformed, in the past, or
      // when the win type isn't one we prep for (applied, milestone).
      if ((type === 'interview' || type === 'offer') && upcomingDate.trim()) {
        const parsed = new Date(upcomingDate.trim() + 'T09:00:00');
        if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
          const pushTitle = type === 'interview'
            ? (company.trim() ? `Interview with ${company.trim()}` : 'Interview')
            : (company.trim() ? `Offer with ${company.trim()}` : 'Offer decision');
          const prepSeed = type === 'interview'
            ? `I have an interview tomorrow${company.trim() ? ` with ${company.trim()}` : ''}. Help me prep. What should I actually do tonight to be ready?`
            : `I have an offer decision coming tomorrow${company.trim() ? ` from ${company.trim()}` : ''}. Help me think it through before I respond.`;
          scheduleOutcomePushes({
            id: `win-${win.id}`,
            title: pushTitle,
            at: parsed,
            prepPrompt: prepSeed,
          }).catch(() => {});
        }
      }

      onLogged(win);
      reset();
    } catch {
      setSaving(false);
    }
  }, [title, company, note, type, upcomingDate, saving, onLogged]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.modalRoot}
      >
        <View style={s.modalBackdrop} />
        <View style={[
          s.sheet,
          { backgroundColor: theme.surface.s1, borderTopColor: theme.surface.border },
        ]}>
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: theme.surface.t1 }]}>Log a win</Text>
            <AnimatedPressable onPress={onClose} hitSlop={10} scaleDown={0.9}>
              <Ionicons name="close" size={22} color={theme.surface.t3} />
            </AnimatedPressable>
          </View>

          <Text style={[s.sheetLabel, { color: theme.surface.t3 }]}>Type</Text>
          <View style={s.typeRow}>
            {(['applied', 'interview', 'offer', 'milestone'] as WinType[]).map(t => {
              const picked = t === type;
              return (
                <AnimatedPressable
                  key={t}
                  onPress={() => setType(t)}
                  scaleDown={0.95}
                  style={[
                    s.typePill,
                    {
                      backgroundColor: picked ? theme.accentSoft : theme.surface.bg,
                      borderColor: picked ? theme.accent : theme.surface.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={TYPE_META[t].icon}
                    size={13}
                    color={picked ? theme.accent : theme.surface.t3}
                  />
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: picked ? theme.accent : theme.surface.t2,
                  }}>{TYPE_META[t].label}</Text>
                </AnimatedPressable>
              );
            })}
          </View>

          <Text style={[s.sheetLabel, { color: theme.surface.t3, marginTop: 14 }]}>What</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={
              type === 'applied'   ? 'e.g. Software Engineer at Stripe' :
              type === 'interview' ? 'e.g. Phone screen with Anthropic' :
              type === 'offer'     ? 'e.g. Data Analyst offer from Notion' :
                                     'e.g. Finished the AWS cert'
            }
            placeholderTextColor={theme.surface.t3}
            style={[
              s.input,
              { backgroundColor: theme.surface.bg, borderColor: theme.surface.border, color: theme.surface.t1 },
            ]}
            maxLength={140}
          />

          {(type === 'applied' || type === 'interview' || type === 'offer') && (
            <>
              <Text style={[s.sheetLabel, { color: theme.surface.t3, marginTop: 12 }]}>Company (optional)</Text>
              <TextInput
                value={company}
                onChangeText={setCompany}
                placeholder="e.g. Stripe"
                placeholderTextColor={theme.surface.t3}
                style={[
                  s.input,
                  { backgroundColor: theme.surface.bg, borderColor: theme.surface.border, color: theme.surface.t1 },
                ]}
                maxLength={80}
              />
            </>
          )}

          {/* Upcoming-event date. Only for interview / offer types
              where a future date unlocks prep pushes (T-18h nudge +
              day-of "good luck"). Skipped for 'applied' (already
              happened) and 'milestone' (not time-bound). Free-text
              YYYY-MM-DD to avoid a date-picker dep; validated on
              submit and silently no-ops when blank / malformed. */}
          {(type === 'interview' || type === 'offer') && (
            <>
              <Text style={[s.sheetLabel, { color: theme.surface.t3, marginTop: 12 }]}>
                When is it (optional)
              </Text>
              <TextInput
                value={upcomingDate}
                onChangeText={setUpcomingDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.surface.t3}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                style={[
                  s.input,
                  { backgroundColor: theme.surface.bg, borderColor: theme.surface.border, color: theme.surface.t1 },
                ]}
                maxLength={10}
              />
              <Text style={{ fontSize: 10, color: theme.surface.t3, marginTop: 4, marginLeft: 2 }}>
                Dilly will ping you the night before to help you prep.
              </Text>
            </>
          )}

          <Text style={[s.sheetLabel, { color: theme.surface.t3, marginTop: 12 }]}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="How it felt, what's next, a detail you want to remember."
            placeholderTextColor={theme.surface.t3}
            style={[
              s.input,
              { backgroundColor: theme.surface.bg, borderColor: theme.surface.border, color: theme.surface.t1, minHeight: 64, textAlignVertical: 'top' },
            ]}
            multiline
            maxLength={500}
          />

          <AnimatedPressable
            onPress={submit}
            disabled={!title.trim() || saving}
            scaleDown={0.98}
            style={[
              s.save,
              {
                backgroundColor: title.trim() && !saving ? theme.accent : theme.surface.s2,
                opacity: title.trim() && !saving ? 1 : 0.6,
              },
            ]}
          >
            <Text style={s.saveText}>{saving ? 'Saving…' : 'Save win'}</Text>
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  summary: { fontSize: 11, fontWeight: '600' },
  winRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 24, height: 24, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  winTitle: { fontSize: 13, fontWeight: '700' },
  winWhen: { fontSize: 10, fontWeight: '600' },
  emptyCopy: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, marginTop: 12,
  },
  ctaText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    padding: 20,
    paddingBottom: 28,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 12, borderWidth: 1,
  },
  input: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 19,
  },
  save: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
