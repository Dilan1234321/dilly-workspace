/**
 * Career Type quiz — 8-question forced-choice instrument that
 * produces one of six career archetypes (Builder / Connector /
 * Synthesizer / Operator / Inventor / Guardian).
 *
 * Strategic role: this is one of the cluster-3 P-lifts. Personality
 * tests (16Personalities, CliftonStrengths) were B for Dilly because
 * we had no real assessment. Now we do — and the result writes to
 * Profile facts AND profile.career_archetype, so every other feature
 * (resume framing, mock interview style, chat coaching tone) can
 * read it. One quiz, durable signal across the whole app.
 *
 * Cost: zero LLM. Pure forced-choice scoring. Quiz takes ~90 seconds.
 */
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../../lib/dilly';
import { useResolvedTheme } from '../../hooks/useTheme';
import { DillyFace } from '../../components/DillyFace';
import { FadeInView } from '../../components/FadeInView';

interface Choice { id: string; label: string }
interface Question { id: string; prompt: string; choices: Choice[] }
interface Result { archetype: string; tagline: string; blurb: string; facts_added: number }

export default function CareerTypeScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await dilly.get('/career-type/questions');
        if (data?.questions) setQuestions(data.questions);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  const allAnswered = questions.length > 0 && questions.every(q => !!answers[q.id]);
  const answeredCount = questions.filter(q => !!answers[q.id]).length;

  async function submit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const res = await dilly.fetch('/career-type/submit', {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      const data = await res.json().catch(() => null);
      if (data?.archetype) setResult(data);
    } catch {} finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.surface.bg, alignItems: 'center', justifyContent: 'center' }}>
        <DillyFace size={88} mood="thoughtful" accessory="glasses" />
        <Text style={{ marginTop: 16, fontSize: 13, color: theme.surface.t2 }}>Loading…</Text>
      </View>
    );
  }

  // ── Result screen ──────────────────────────────────────────────
  if (result) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.surface.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
          <FadeInView delay={0}>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <DillyFace size={120} mood="proud" accessory="crown" />
            </View>
          </FadeInView>
          <FadeInView delay={120}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1.2, textAlign: 'center', marginBottom: 6 }}>
              YOUR CAREER TYPE
            </Text>
            <Text style={{ fontFamily: theme.type.display, fontSize: 38, fontWeight: '900', color: theme.accent, textAlign: 'center', letterSpacing: 0.4 }}>
              {result.archetype}
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.surface.t1, textAlign: 'center', marginTop: 4, marginBottom: 18 }}>
              {result.tagline}
            </Text>
            <Text style={{ fontSize: 14, color: theme.surface.t2, lineHeight: 21, fontFamily: theme.type.body }}>
              {result.blurb}
            </Text>
          </FadeInView>
          <FadeInView delay={220}>
            <View style={{
              marginTop: 26,
              padding: 14,
              borderRadius: 12,
              backgroundColor: theme.accentSoft,
              borderColor: theme.accentBorder,
              borderWidth: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}>
              <Ionicons name="add-circle" size={18} color={theme.accent} />
              <Text style={{ flex: 1, fontSize: 13, color: theme.surface.t1, lineHeight: 17 }}>
                Saved to your Dilly Profile. Resume framing, mock interview style, and chat coaching now lean into this.
              </Text>
            </View>
          </FadeInView>
          <FadeInView delay={300}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={{ marginTop: 22, backgroundColor: theme.accent, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
              onPress={() => router.back()}
            >
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 }}>Done</Text>
            </TouchableOpacity>
          </FadeInView>
        </ScrollView>
      </View>
    );
  }

  // ── Quiz screen ────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: theme.surface.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 100, paddingHorizontal: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.surface.t1} />
          </TouchableOpacity>
          <Text style={{ fontFamily: theme.type.display, fontSize: 22, fontWeight: '800', color: theme.surface.t1, letterSpacing: 0.4 }}>
            Career Type
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: theme.surface.t2, lineHeight: 18, marginBottom: 4 }}>
          8 quick questions about how you actually like to work. Pick the one that fits best, even if it's not perfect.
        </Text>
        <Text style={{ fontSize: 11, color: theme.surface.t3, marginBottom: 22 }}>
          {answeredCount} / {questions.length} answered
        </Text>

        {questions.map((q, qi) => (
          <View key={q.id} style={{ marginBottom: 26 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1.0, marginBottom: 6 }}>
              QUESTION {qi + 1} OF {questions.length}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.surface.t1, lineHeight: 22, marginBottom: 12 }}>
              {q.prompt}
            </Text>
            <View style={{ gap: 8 }}>
              {q.choices.map(c => {
                const selected = answers[q.id] === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.85}
                    onPress={() => setAnswers(prev => ({ ...prev, [q.id]: c.id }))}
                    style={{
                      borderWidth: 1.5,
                      borderColor: selected ? theme.accent : theme.surface.border,
                      backgroundColor: selected ? theme.accentSoft : theme.surface.s1,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <View style={{
                      width: 18, height: 18, borderRadius: 9,
                      borderWidth: 1.5,
                      borderColor: selected ? theme.accent : theme.surface.border,
                      backgroundColor: selected ? theme.accent : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <Ionicons name="checkmark" size={11} color="#FFF" />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: theme.surface.t1, lineHeight: 18 }}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={submit}
          disabled={!allAnswered || submitting}
          style={{
            backgroundColor: allAnswered ? theme.accent : theme.surface.s2,
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <Text style={{ color: allAnswered ? '#FFF' : theme.surface.t3, fontWeight: '800', fontSize: 15, letterSpacing: 0.3 }}>
            {submitting ? 'Scoring…' : allAnswered ? 'See your Career Type' : `Answer ${questions.length - answeredCount} more`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
