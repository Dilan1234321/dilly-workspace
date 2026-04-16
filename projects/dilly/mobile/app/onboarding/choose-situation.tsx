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
import { router } from 'expo-router';
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

// Ordered by breadth of appeal first, then specificity. Dropout and
// career-switcher live at the top because they're the most common
// non-.edu paths. Specialized paths follow.
const OPTIONS: Situation[] = [
  {
    id: 'career_switch',
    title: 'I\'m switching careers',
    sub: 'You have work experience in one field and want to move into another.',
    icon: 'swap-horizontal',
  },
  {
    id: 'dropout',
    title: 'I\'m building without a degree',
    sub: 'You left school or never went. Self-taught, bootcamp, or on-the-job.',
    icon: 'hammer',
  },
  {
    id: 'senior_reset',
    title: 'I\'m starting a next chapter',
    sub: 'Senior professional between roles. Laid off or ready for something new.',
    icon: 'compass',
  },
  {
    id: 'parent_returning',
    title: 'I\'m returning to work',
    sub: 'Stepping back in after time raising family or caregiving.',
    icon: 'home',
  },
  {
    id: 'veteran',
    title: 'I\'m transitioning from the military',
    sub: 'Translating service experience into civilian career language.',
    icon: 'shield',
  },
  {
    id: 'international_grad',
    title: 'I\'m on a student visa',
    sub: 'F-1 / OPT, targeting US employment with sponsorship.',
    icon: 'airplane',
  },
  {
    id: 'trades_to_white_collar',
    title: 'I\'m moving from trades to office roles',
    sub: 'Electrician, welder, HVAC, construction — pivoting into office work.',
    icon: 'construct',
  },
  {
    id: 'first_gen_college',
    title: 'I\'m first in my family to do this',
    sub: 'Nobody at home can tell you the unwritten rules. Dilly can.',
    icon: 'trophy',
  },
  {
    id: 'formerly_incarcerated',
    title: 'I\'m a returning citizen',
    sub: 'Re-entering the workforce. Fair-chance employers welcome you here.',
    icon: 'key',
  },
  {
    id: 'neurodivergent',
    title: 'I think a little differently',
    sub: 'ADHD, autism, dyslexia — career tools assume typical cognition. This one adapts.',
    icon: 'bulb',
  },
  {
    id: 'disabled_professional',
    title: 'I have a disability',
    sub: 'Filter for inclusive employers. We don\'t make you disclose on your resume.',
    icon: 'accessibility',
  },
  {
    id: 'exploring',
    title: 'I\'m just exploring',
    sub: 'Figuring out where to go. No specific path locked in yet.',
    icon: 'telescope',
  },
];

export default function ChooseSituationScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!selected) return;
    setSaving(true);
    try {
      // Save user_path to profile. Dropout path also gets the $9.99
      // 'building' plan pre-set — they can see the "built for me" price
      // immediately on the plan screen later.
      const patch: Record<string, any> = { user_path: selected };
      if (selected === 'dropout') {
        // Dropout tier is $9.99 — same as student pricing, gated by path
        // instead of .edu domain.
        patch.plan = 'building';
      }
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    } catch {
      // Non-fatal — they can still continue; path defaults to exploring.
    }
    router.replace('/onboarding/profile-pro');
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
