/**
 * Choose Situation — the first screen anyone sees in Dilly.
 *
 * This is the "wow" moment. The user picks who they are, and each card
 * expands to show a specific promise — the concrete things Dilly does
 * differently for THEIR situation. This screen is where a dropout /
 * veteran / parent / senior sees "oh, this app is actually built for me"
 * for the first time. That's the acquisition moment.
 *
 * Everything downstream adapts from the selection here: AI tone, resume
 * shape, job filters, pricing, copy.
 */

import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, Animated, Easing, Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../../lib/tokens';
import FadeInView from '../../components/FadeInView';
import AnimatedPressable from '../../components/AnimatedPressable';

type Situation = {
  id: string;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  // Accent color used for this path's icon gradient + selected border.
  // Gives each path a distinct visual identity — "Dilly looks like me."
  color: string;
  // 3 concrete things Dilly does for this path. Shown when the card is
  // selected. This is the promise, not marketing fluff.
  perks: string[];
  // Optional badge above the card (e.g. "$9.99 Building tier").
  badge?: string;
  needsEdu: boolean;
};

const OPTIONS: Situation[] = [
  // ── Majority paths ──
  {
    id: 'student',
    title: "I'm a college student",
    sub: 'In school, looking for internships or your first role.',
    icon: 'school',
    color: '#4f46e5',
    perks: [
      'Matched to internships tagged for your major + cohort',
      'Fit narratives in every job card showing what you have and what to build',
      'Resumes formatted for each company\'s ATS, with GPA when it helps',
    ],
    needsEdu: true,
  },
  {
    id: 'career_switch',
    title: "I'm switching careers",
    sub: 'Experience in one field, pivoting into another.',
    icon: 'swap-horizontal',
    color: '#0891b2',
    perks: [
      'Transferable skills pulled to the top of every resume',
      'Bullets reframed for your target field\'s vocabulary',
      'Honest read on what gaps to close and what\'s already covered',
    ],
    needsEdu: false,
  },
  {
    id: 'exploring',
    title: "I'm looking for my next opportunity",
    sub: 'Actively job hunting or figuring out what\'s next.',
    icon: 'search',
    color: '#7c3aed',
    perks: [
      'Personalized job feed based on your full profile',
      'Fit narratives that tell you what to say in the application',
      'Interview practice tuned to each company',
    ],
    needsEdu: false,
  },
  // ── Student-specific ──
  {
    id: 'first_gen_college',
    title: "I'm first in my family to go to college",
    sub: 'Nobody at home can tell you the unwritten rules.',
    icon: 'trophy',
    color: '#f59e0b',
    perks: [
      'The mentor conversation you never had, on demand',
      'Unwritten rules made explicit (networking, thank-yous, what business casual actually means)',
      'Work-during-school hours treated as real resume material',
    ],
    needsEdu: true,
  },
  {
    id: 'international_grad',
    title: "I'm on a student visa",
    sub: 'F-1 / OPT, targeting US employment.',
    icon: 'airplane',
    color: '#0ea5e9',
    perks: [
      'Filter for employers with confirmed H-1B sponsorship history',
      'Resume tuned to US conventions (no photo, reverse-chron, US dates)',
      'Dilly tracks your OPT clock and flags when time matters',
    ],
    needsEdu: true,
  },
  // ── Non-student specialized ──
  {
    id: 'dropout',
    title: "I'm building without a degree",
    sub: 'Left school or never went. Self-taught, bootcamp, or on-the-job.',
    icon: 'hammer',
    color: '#059669',
    badge: 'Dilly Building — $9.99/mo',
    perks: [
      'No Education section — replaced with Training & Credentials',
      '"No degree required" filter as the first pill on your jobs page',
      'Dilly talks to you like someone who respects the path you\'re on',
    ],
    needsEdu: false,
  },
  {
    id: 'senior_reset',
    title: "I'm starting a next chapter",
    sub: 'Senior professional between roles. Laid off or ready for new.',
    icon: 'compass',
    color: '#0f766e',
    perks: [
      'Two-page resume, reverse-chronological, no GPA or grad year',
      'Leadership & Impact section for management experience',
      'Warm, confident tone — not the new-grad cheerleading',
    ],
    needsEdu: false,
  },
  {
    id: 'parent_returning',
    title: "I'm returning to work",
    sub: 'Stepping back in after time raising family or caregiving.',
    icon: 'home',
    color: '#ea580c',
    perks: [
      '"Family Leadership" entry fills the gap without apologizing for it',
      'Filter for flex, remote, and return-to-work programs',
      'Prior experience treated as not-expired, because it isn\'t',
    ],
    needsEdu: false,
  },
  {
    id: 'veteran',
    title: "I'm transitioning from the military",
    sub: 'Translating service experience into civilian career language.',
    icon: 'shield',
    color: '#15803d',
    perks: [
      'MOS codes and rank translated into civilian job titles',
      'Security clearance surfaced as a credential',
      'Direct, matter-of-fact tone. No "thank you for your service" ceremony',
    ],
    needsEdu: false,
  },
  {
    id: 'trades_to_white_collar',
    title: "I'm moving from trades to office roles",
    sub: 'Electrician, welder, HVAC, construction → office work.',
    icon: 'construct',
    color: '#b45309',
    perks: [
      '"Read blueprints" becomes "interpreted technical specifications"',
      'OSHA and trade certifications surfaced as real credentials',
      'Resume written in office language, trade record preserved',
    ],
    needsEdu: false,
  },
  {
    id: 'formerly_incarcerated',
    title: "I'm a returning citizen",
    sub: 'Re-entering the workforce. Fair-chance employers welcome you.',
    icon: 'key',
    color: '#7c2d12',
    perks: [
      'Year-only resume dates — no gap spotlight',
      'Filter for fair-chance-certified employers',
      'Training completed inside shown as real credentials',
    ],
    needsEdu: false,
  },
  {
    id: 'neurodivergent',
    title: "I think a little differently",
    sub: 'ADHD, autism, dyslexia. Dilly adapts to how you think.',
    icon: 'bulb',
    color: '#9333ea',
    perks: [
      'Direct, literal answers. No metaphors unless you ask for them',
      'Interview practice with scripts you can adapt, not vibes',
      'Resume bullets tuned for pattern-strength framing',
    ],
    needsEdu: false,
  },
  {
    id: 'disabled_professional',
    title: "I have a disability",
    sub: 'Filter for inclusive employers. No disclosure on your resume.',
    icon: 'accessibility',
    color: '#be185d',
    perks: [
      'Filter for Disability:IN certified inclusive employers',
      'Resume never asks you to disclose',
      'Coach on accommodations timing when you want it',
    ],
    needsEdu: false,
  },
  {
    id: 'lgbtq',
    title: 'I want LGBTQ+ inclusive employers',
    sub: 'Filter for real inclusion track records, not just logos.',
    icon: 'heart',
    color: '#db2777',
    perks: [
      'Filter for HRC Corporate Equality Index top scorers',
      'Pronouns in contact info only if YOU want them there',
      'Advocacy work counted as real professional experience',
    ],
    needsEdu: false,
  },
  {
    id: 'rural_remote_only',
    title: "I can't relocate, need remote",
    sub: 'Rural, small-town, or family-anchored.',
    icon: 'globe-outline',
    color: '#047857',
    perks: [
      'Jobs feed filtered to remote-only (not "hybrid with 3 office days")',
      'Resume signals remote-readiness to distributed companies',
      'No push to relocate when you\'ve said you can\'t',
    ],
    needsEdu: false,
  },
  {
    id: 'refugee',
    title: "I'm a refugee or asylum seeker",
    sub: 'New to the workforce here.',
    icon: 'earth',
    color: '#c2410c',
    perks: [
      'Prior experience translated to US-equivalent titles',
      'Surfaces employers known for hiring refugees (Tent Coalition, Upwardly Global)',
      'Plain English throughout. No jargon, no idioms',
    ],
    needsEdu: false,
  },
  {
    id: 'ex_founder',
    title: "I'm returning from running my own thing",
    sub: 'Founder, freelancer, or solopreneur pivoting back into a role.',
    icon: 'rocket',
    color: '#6366f1',
    perks: [
      'Founder title treated as a real role, not a gap',
      'Bullets rewritten around outcomes (revenue, team size, shipped product)',
      'Filter for early-stage startups that value operator DNA',
    ],
    needsEdu: false,
  },
];

export default function ChooseSituationScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Expand animation — when a card is selected, its perks section
  // animates from 0 → full height with opacity fade.
  const expandAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: selected ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [selected]);

  async function handleContinue() {
    if (!selected) return;
    setSaving(true);

    const opt = OPTIONS.find(o => o.id === selected);
    const needsEdu = opt?.needsEdu ?? false;

    // Save to AsyncStorage — profile PATCH happens post-auth in verify.tsx
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('dilly_pending_user_path', selected);
      if (selected === 'dropout') {
        await AsyncStorage.setItem('dilly_pending_plan', 'building');
      }
    } catch {}

    router.replace({
      pathname: '/onboarding/choose-path',
      params: { situationId: selected, needsEdu: needsEdu ? '1' : '0' },
    });
  }

  const selectedOpt = OPTIONS.find(o => o.id === selected);

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
          <View style={styles.heroWrap}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.heroLogo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Who are you, right now?</Text>
            <Text style={styles.sub}>
              Everything in Dilly adapts to this. AI tone, resume format, job filters, pricing.
              Pick what fits today. You can change it later.
            </Text>
          </View>
        </FadeInView>

        <View style={{ height: 20 }} />

        {OPTIONS.map((opt, i) => {
          const isSelected = selected === opt.id;
          return (
            <FadeInView key={opt.id} delay={30 + i * 18}>
              <AnimatedPressable
                scaleDown={0.98}
                onPress={() => setSelected(opt.id === selected ? null : opt.id)}
                style={[
                  styles.card,
                  isSelected && {
                    borderColor: opt.color,
                    backgroundColor: opt.color + '08',
                    shadowColor: opt.color,
                    shadowOpacity: 0.2,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 3,
                  },
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={[
                    styles.iconWrap,
                    { backgroundColor: opt.color + '18' },
                    isSelected && { backgroundColor: opt.color },
                  ]}>
                    <Ionicons
                      name={opt.icon}
                      size={20}
                      color={isSelected ? '#fff' : opt.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={[
                        styles.cardTitle,
                        isSelected && { color: opt.color },
                      ]}>
                        {opt.title}
                      </Text>
                      {opt.badge ? (
                        <View style={[styles.badge, { backgroundColor: opt.color + '18', borderColor: opt.color + '40' }]}>
                          <Text style={[styles.badgeText, { color: opt.color }]}>{opt.badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.cardSub}>{opt.sub}</Text>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={22} color={opt.color} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={colors.t3} />
                  )}
                </View>

                {/* Expanded preview — the "wow" moment. Shows 3 concrete
                    things Dilly does differently for this path. */}
                {isSelected && (
                  <Animated.View
                    style={{
                      opacity: expandAnim,
                      marginTop: 14,
                      paddingTop: 14,
                      borderTopWidth: 1,
                      borderTopColor: opt.color + '22',
                    }}
                  >
                    <Text style={[styles.perksHeader, { color: opt.color }]}>
                      WHAT DILLY DOES FOR YOU
                    </Text>
                    {opt.perks.map((perk, idx) => (
                      <View key={idx} style={styles.perkRow}>
                        <View style={[styles.perkDot, { backgroundColor: opt.color }]} />
                        <Text style={styles.perkText}>{perk}</Text>
                      </View>
                    ))}
                  </Animated.View>
                )}
              </AnimatedPressable>
            </FadeInView>
          );
        })}
      </ScrollView>

      {/* Sticky continue button — picks up the selected card's accent color
          so the action feels connected to the choice. */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <AnimatedPressable
          scaleDown={0.97}
          disabled={!selected || saving}
          onPress={handleContinue}
          style={[
            styles.cta,
            { backgroundColor: selectedOpt?.color || colors.indigo },
            (!selected || saving) && styles.ctaDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.ctaText}>
                {selected ? 'Continue' : 'Pick one to continue'}
              </Text>
              {selected && <Ionicons name="arrow-forward" size={17} color="#fff" />}
            </>
          )}
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  heroWrap: { alignItems: 'flex-start' },
  heroLogo: {
    width: 110,
    height: 38,
    marginBottom: 18,
    marginLeft: -4,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.t1,
    marginBottom: 10,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  sub: {
    fontSize: 14,
    color: colors.t2,
    lineHeight: 21,
  },

  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.s1,
    borderWidth: 1.5,
    borderColor: colors.b1,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.t1,
    marginBottom: 2,
  },
  cardSub: {
    fontSize: 11,
    color: colors.t3,
    lineHeight: 15,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  perksHeader: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  perkDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 7,
  },
  perkText: {
    fontSize: 13,
    color: colors.t2,
    lineHeight: 19,
    flex: 1,
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
    paddingVertical: 15,
    borderRadius: radius.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  ctaDisabled: {
    backgroundColor: colors.t3,
    opacity: 0.45,
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
