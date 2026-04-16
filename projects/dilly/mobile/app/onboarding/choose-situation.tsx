/**
 * Choose Situation — shown to non-.edu users right after verification.
 *
 * Asks ONE question: "Which best fits you right now?" — and based on the
 * answer, everything downstream adapts: AI tone, resume shape, job
 * filters, pricing copy. Dilly's promise to underserved markets is that
 * the app is built FOR them, not bolted on. This screen is where that
 * promise starts.
 *
 * Selection is saved to profile.user_path and used across ai.py,
 * resume.py, insights.py, and the mobile UI.
 */

import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import FadeInView from '../../components/FadeInView';
import AnimatedPressable from '../../components/AnimatedPressable';

type Situation = {
  id: string;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// Unified list — the very first thing anyone sees when they open Dilly.
// Majority paths at the top, specialized below.
// 'needsEdu' marks paths that route to the .edu email input.
const OPTIONS: (Situation & { needsEdu: boolean })[] = [
  // ── Majority paths (most common) ──
  {
    id: 'student',
    title: 'I\'m a college student',
    sub: 'In school, looking for internships or your first role.',
    icon: 'school',
    needsEdu: true,
  },
  {
    id: 'career_switch',
    title: 'I\'m switching careers',
    sub: 'Experience in one field, pivoting into another.',
    icon: 'swap-horizontal',
    needsEdu: false,
  },
  {
    id: 'exploring',
    title: 'I\'m looking for my next opportunity',
    sub: 'Actively job hunting or figuring out what\'s next.',
    icon: 'search',
    needsEdu: false,
  },
  // ── Specific situations ──
  {
    id: 'first_gen_college',
    title: 'I\'m first in my family to go to college',
    sub: 'Nobody at home can tell you the unwritten rules. Dilly can.',
    icon: 'trophy',
    needsEdu: true,
  },
  {
    id: 'international_grad',
    title: 'I\'m on a student visa',
    sub: 'F-1 / OPT, targeting US employment with sponsorship.',
    icon: 'airplane',
    needsEdu: true,
  },
  {
    id: 'dropout',
    title: 'I\'m building without a degree',
    sub: 'Left school or never went. Self-taught, bootcamp, or on-the-job.',
    icon: 'hammer',
    needsEdu: false,
  },
  {
    id: 'senior_reset',
    title: 'I\'m starting a next chapter',
    sub: 'Senior professional between roles. Laid off or ready for something new.',
    icon: 'compass',
    needsEdu: false,
  },
  {
    id: 'parent_returning',
    title: 'I\'m returning to work',
    sub: 'Stepping back in after time raising family or caregiving.',
    icon: 'home',
    needsEdu: false,
  },
  {
    id: 'veteran',
    title: 'I\'m transitioning from the military',
    sub: 'Translating service experience into civilian career language.',
    icon: 'shield',
    needsEdu: false,
  },
  {
    id: 'trades_to_white_collar',
    title: 'I\'m moving from trades to office roles',
    sub: 'Electrician, welder, HVAC, construction. Pivoting into office work.',
    icon: 'construct',
    needsEdu: false,
  },
  {
    id: 'formerly_incarcerated',
    title: 'I\'m a returning citizen',
    sub: 'Re-entering the workforce. Fair-chance employers welcome you here.',
    icon: 'key',
    needsEdu: false,
  },
  {
    id: 'neurodivergent',
    title: 'I think a little differently',
    sub: 'ADHD, autism, dyslexia. Dilly adapts to how you think.',
    icon: 'bulb',
    needsEdu: false,
  },
  {
    id: 'disabled_professional',
    title: 'I have a disability',
    sub: 'Filter for inclusive employers. No disclosure on your resume.',
    icon: 'accessibility',
    needsEdu: false,
  },
];

export default function ChooseSituationScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!selected) return;
    setSaving(true);

    // Find whether this path needs a .edu email
    const opt = OPTIONS.find(o => o.id === selected);
    const needsEdu = opt?.needsEdu ?? false;

    // Save user_path to AsyncStorage so we can persist it to the
    // profile after they verify their email (can't PATCH profile yet
    // because the user hasn't authenticated at this point).
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('dilly_pending_user_path', selected);
      if (selected === 'dropout') {
        await AsyncStorage.setItem('dilly_pending_plan', 'building');
      }
    } catch {}

    // Route to choose-path with a hint about which email section to
    // focus on. The choose-path screen shows both inputs but we can
    // auto-scroll or highlight the right one.
    router.replace({
      pathname: '/onboarding/choose-path',
      params: { situationId: selected, needsEdu: needsEdu ? '1' : '0' },
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <FadeInView>
          <Text style={styles.title}>Which best fits you right now?</Text>
          <Text style={styles.sub}>
            Dilly adapts to who you are. Pick the one closest to where you're standing today. You can change this later.
          </Text>
        </FadeInView>

        <View style={{ height: 20 }} />

        {OPTIONS.map((opt, i) => {
          const isSelected = selected === opt.id;
          return (
            <FadeInView key={opt.id} delay={30 + i * 20}>
              <AnimatedPressable
                scaleDown={0.98}
                onPress={() => setSelected(opt.id)}
                style={[
                  styles.card,
                  isSelected && styles.cardSelected,
                ]}
              >
                <View style={[
                  styles.iconWrap,
                  isSelected && styles.iconWrapSelected,
                ]}>
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={isSelected ? '#fff' : colors.indigo}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.cardTitle,
                    isSelected && styles.cardTitleSelected,
                  ]}>
                    {opt.title}
                  </Text>
                  <Text style={styles.cardSub}>{opt.sub}</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.indigo} />
                )}
              </AnimatedPressable>
            </FadeInView>
          );
        })}
      </ScrollView>

      {/* Sticky continue button */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <AnimatedPressable
          scaleDown={0.97}
          disabled={!selected || saving}
          onPress={handleContinue}
          style={[
            styles.cta,
            (!selected || saving) && styles.ctaDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.ctaText}>Continue</Text>
          )}
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.t1,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 14,
    color: colors.t2,
    lineHeight: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.b1,
    marginBottom: 10,
  },
  cardSelected: {
    borderColor: colors.indigo,
    backgroundColor: colors.indigo + '10',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.indigo + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: {
    backgroundColor: colors.indigo,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.t1,
    marginBottom: 3,
  },
  cardTitleSelected: {
    color: colors.indigo,
  },
  cardSub: {
    fontSize: 11,
    color: colors.t3,
    lineHeight: 15,
  },
  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.b1,
  },
  cta: {
    backgroundColor: colors.indigo,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  ctaDisabled: {
    backgroundColor: colors.t3,
    opacity: 0.5,
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
