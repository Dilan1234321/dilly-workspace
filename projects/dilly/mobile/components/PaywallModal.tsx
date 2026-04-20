import { View, Text, Modal, ScrollView, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { colors } from '../lib/tokens';
import { useResolvedTheme } from '../hooks/useTheme';
import AnimatedPressable from './AnimatedPressable';
import { useSubscription } from '../hooks/useSubscription';

const BLUE = '#2B3A8E';
const GREEN = '#34C759';
const PRICING_URL = 'https://hellodilly.com/pricing.html';

const FEATURES = [
  { icon: 'chatbubble-ellipses', label: 'Unlimited Dilly AI', sub: 'Coaching and interview prep' },
  { icon: 'document-text', label: 'Unlimited Audits', sub: 'Re-score every time you improve your resume' },
  { icon: 'shield-checkmark', label: 'ATS Compatibility', sub: 'Scan against every major ATS system' },
  { icon: 'git-compare', label: 'Gap Analysis', sub: 'Smart/Grit/Build breakdown per job listing' },
  { icon: 'flash', label: 'Ask Dilly per Job', sub: 'AI coaching tailored to each opportunity' },
  { icon: 'shield-checkmark', label: 'AI Arena', sub: 'AI readiness scoring, threat scanning, career simulation' },
  { icon: 'briefcase', label: 'Application Tracker', sub: 'Full pipeline CRM with status tracking' },
  { icon: 'trending-up', label: 'Score Tracking', sub: 'Watch your readiness score improve over time' },
];

const FEATURE_PROMPTS: Record<string, string> = {
  ai_limit: "You've used your 3 free AI messages today. Upgrade for unlimited Dilly AI coaching.",
  audit_limit: "You've used your free audit. Upgrade to re-audit every time you update your resume.",
  ats: "ATS scanning is a Pro feature. See exactly how your resume scores on every hiring system.",
  gap_analysis: "Gap analysis is a Pro feature. See exactly where you stand for each job.",
  ai_arena: "AI Arena is a Pro feature. See how AI affects your career and what to do about it.",
  tracker: "The Application Tracker is a Pro feature. Manage your full pipeline in one place.",
};

type Plan = 'monthly' | 'annual';

export default function PaywallModal() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const { paywallVisible, paywallFeature, dismissPaywall } = useSubscription();
  const [plan, setPlan] = useState<Plan>('annual');

  if (!paywallVisible) return null;

  const prompt = paywallFeature
    ? (FEATURE_PROMPTS[paywallFeature] ?? `Upgrade to access all Pro features.`)
    : null;

  async function handleGetPro() {
    try {
      await Linking.openURL(PRICING_URL);
    } catch {
      // URL failed to open  -  do nothing
    }
  }

  return (
    <Modal
      visible={paywallVisible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={dismissPaywall}
    >
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: theme.surface.bg, paddingBottom: insets.bottom + 8 }]}>

          {/* Close button */}
          <AnimatedPressable style={[s.closeBtn, { backgroundColor: theme.surface.s2 }]} onPress={dismissPaywall} scaleDown={0.88} hitSlop={12}>
            <Ionicons name="close" size={18} color={theme.surface.t2} />
          </AnimatedPressable>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
            bounces={false}
          >
            {/* Logo + badge */}
            <View style={s.header}>
              <Text style={s.logo}>DILLY</Text>
              <View style={s.badge}><Text style={s.badgeText}>PRO</Text></View>
            </View>

            <Text style={[s.headline, { color: theme.surface.t1 }]}>Land the internship{'\n'}you actually want.</Text>

            {prompt && (
              <View style={s.promptRow}>
                <Ionicons name="information-circle" size={14} color={BLUE} style={{ marginTop: 1 }} />
                <Text style={s.promptText}>{prompt}</Text>
              </View>
            )}

            {/* Plan toggle */}
            <View style={[s.toggle, { backgroundColor: theme.surface.s2 }]}>
              <AnimatedPressable
                style={[s.toggleTab, plan === 'monthly' && { ...s.toggleTabActive, backgroundColor: theme.surface.bg }]}
                onPress={() => setPlan('monthly')}
                scaleDown={0.96}
              >
                <Text style={[s.toggleTabText, { color: theme.surface.t3 }, plan === 'monthly' && { color: theme.surface.t1 }]}>Monthly</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[s.toggleTab, plan === 'annual' && { ...s.toggleTabActive, backgroundColor: theme.surface.bg }]}
                onPress={() => setPlan('annual')}
                scaleDown={0.96}
              >
                <Text style={[s.toggleTabText, { color: theme.surface.t3 }, plan === 'annual' && { color: theme.surface.t1 }]}>Annual</Text>
                <View style={s.saveBadge}><Text style={s.saveBadgeText}>Save 34%</Text></View>
              </AnimatedPressable>
            </View>

            {/* Price display */}
            <View style={s.priceRow}>
              <Text style={[s.priceAmount, { color: theme.surface.t1 }]}>
                {plan === 'monthly' ? '$9.99' : '$6.58'}
              </Text>
              <View style={s.priceRight}>
                <Text style={[s.pricePerMonth, { color: theme.surface.t3 }]}>/month</Text>
                {plan === 'annual' && (
                  <Text style={[s.priceBilled, { color: theme.surface.t3 }]}>Billed $79/year</Text>
                )}
              </View>
            </View>

            {/* Features card */}
            <View style={[s.featuresCard, { borderColor: theme.surface.border }]}>
              {FEATURES.map((f, i) => (
                <View key={i} style={[s.featureRow, { backgroundColor: theme.surface.s1 }, i < FEATURES.length - 1 && { ...s.featureRowBorder, borderBottomColor: theme.surface.border }]}>
                  <View style={s.featureIcon}>
                    <Ionicons name={f.icon as any} size={15} color={BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.featureLabel, { color: theme.surface.t1 }]}>{f.label}</Text>
                    <Text style={[s.featureSub, { color: theme.surface.t3 }]}>{f.sub}</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                </View>
              ))}
            </View>

            {/* CTA */}
            <AnimatedPressable style={s.cta} onPress={handleGetPro} scaleDown={0.97}>
              <Text style={s.ctaText}>Get Dilly Pro →</Text>
            </AnimatedPressable>

            {/* Dismiss */}
            <AnimatedPressable onPress={dismissPaywall} scaleDown={0.95} style={s.notNow}>
              <Text style={[s.notNowText, { color: theme.surface.t3 }]}>Not now</Text>
            </AnimatedPressable>

            <Text style={[s.legal, { color: theme.surface.t3 }]}>
              Tap "Get Dilly Pro" to view pricing and subscribe on our website.
              {'\n'}Cancel anytime. No hidden fees.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg ?? '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '94%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.s3 ?? '#F0F0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  logo: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 22,
    color: BLUE,
    letterSpacing: 3,
  },
  badge: {
    backgroundColor: BLUE,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },

  headline: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 26,
    color: colors.t1 ?? '#1A1A2E',
    lineHeight: 34,
    marginBottom: 14,
  },

  promptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: BLUE + '0D',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: BLUE + '22',
  },
  promptText: {
    flex: 1,
    fontSize: 12,
    color: BLUE,
    lineHeight: 17,
    fontWeight: '500',
  },

  // Toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.s2 ?? '#F5F5FA',
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  toggleTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.t3 ?? '#8E8EA0',
  },
  toggleTabTextActive: {
    color: colors.t1 ?? '#1A1A2E',
  },
  saveBadge: {
    backgroundColor: GREEN + '22',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  saveBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: GREEN,
    letterSpacing: 0.3,
  },

  // Price
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 20,
  },
  priceAmount: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 40,
    color: colors.t1 ?? '#1A1A2E',
    lineHeight: 44,
  },
  priceRight: {
    paddingBottom: 2,
  },
  pricePerMonth: {
    fontSize: 14,
    color: colors.t3 ?? '#8E8EA0',
    fontWeight: '500',
  },
  priceBilled: {
    fontSize: 11,
    color: colors.t3 ?? '#8E8EA0',
    marginTop: 2,
  },

  // Features card
  featuresCard: {
    borderWidth: 1,
    borderColor: colors.b2 ?? '#E8E8F0',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
  },
  featureRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.b2 ?? '#E8E8F0',
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: BLUE + '0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.t1 ?? '#1A1A2E',
  },
  featureSub: {
    fontSize: 11,
    color: colors.t3 ?? '#8E8EA0',
    marginTop: 1,
    lineHeight: 15,
  },

  // CTA
  cta: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 15,
    letterSpacing: 1,
    color: '#FFFFFF',
  },

  // Not now
  notNow: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 10,
  },
  notNowText: {
    fontSize: 13,
    color: colors.t3 ?? '#8E8EA0',
    fontWeight: '500',
  },

  legal: {
    fontSize: 10,
    color: colors.t3 ?? '#8E8EA0',
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 4,
  },
});
