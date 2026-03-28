import { View, Text, Modal, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/tokens';
import AnimatedPressable from './AnimatedPressable';
import { useSubscription } from '../hooks/useSubscription';

const GOLD = '#C9A84C';
const GREEN = '#34C759';

const FEATURES = [
  { icon: 'chatbubble', label: 'Unlimited Dilly AI', sub: 'Coaching, interview prep, mock interviews' },
  { icon: 'analytics', label: 'Unlimited Audits', sub: 'Re-score every time you improve your resume' },
  { icon: 'shield-checkmark', label: 'ATS Compatibility', sub: 'Scan against all ATS systems, get fixes' },
  { icon: 'git-compare', label: 'Gap Analysis', sub: 'Smart/Grit/Build breakdown per job' },
  { icon: 'flash', label: 'Ask Dilly per Job', sub: 'AI coaching specific to each listing' },
  { icon: 'key', label: 'Keyword Matching', sub: 'Analyze resume vs job descriptions' },
  { icon: 'create', label: 'Resume Editor', sub: 'Live bullet scoring with AI feedback' },
  { icon: 'briefcase', label: 'Application Tracker', sub: 'Full pipeline CRM with status tracking' },
  { icon: 'calendar', label: 'Deadline Alerts', sub: 'Never miss an application deadline' },
  { icon: 'school', label: 'Interview Prep', sub: 'Practice with AI interviewers' },
  { icon: 'trending-up', label: 'Score Tracking', sub: 'See your improvement over time' },
  { icon: 'notifications', label: 'Proactive Nudges', sub: 'Dilly reminds you what to do next' },
];

export default function PaywallModal() {
  const insets = useSafeAreaInsets();
  const { paywallVisible, paywallFeature, dismissPaywall } = useSubscription();

  if (!paywallVisible) return null;

  function handleSubscribe() {
    // TODO: Connect to RevenueCat
    // For now, just dismiss
    dismissPaywall();
  }

  return (
    <Modal visible={paywallVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={dismissPaywall}>
      <View style={s.overlay}>
        <View style={[s.card, { paddingBottom: insets.bottom + 20 }]}>
          {/* Close */}
          <AnimatedPressable style={s.closeBtn} onPress={dismissPaywall} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="close" size={20} color={colors.t2} />
          </AnimatedPressable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
            {/* Header */}
            <View style={s.header}>
              <Text style={s.logo}>DILLY</Text>
              <View style={s.proBadge}><Text style={s.proBadgeText}>PRO</Text></View>
            </View>

            <Text style={s.headline}>Unlock your full career potential</Text>

            {paywallFeature ? (
              <Text style={s.featurePrompt}>
                {paywallFeature === 'ai_limit'
                  ? "You've used your 3 free AI messages today. Upgrade for unlimited Dilly AI coaching."
                  : paywallFeature === 'audit_limit'
                  ? "You've used your free audit. Upgrade to re-audit every time you improve your resume."
                  : paywallFeature === 'ats'
                  ? "ATS scanning is a Pro feature. See how your resume scores on every ATS system."
                  : paywallFeature === 'gap_analysis'
                  ? "Gap analysis is a Pro feature. See exactly where you stand for each job."
                  : paywallFeature === 'resume_editor'
                  ? "The Resume Editor with live scoring is a Pro feature."
                  : paywallFeature === 'tracker'
                  ? "The Application Tracker is a Pro feature. Track your full pipeline."
                  : `Upgrade to access ${paywallFeature} and all Pro features.`}
              </Text>
            ) : null}

            {/* Features list */}
            <View style={s.featuresList}>
              {FEATURES.map((f, i) => (
                <View key={i} style={s.featureRow}>
                  <View style={s.featureIcon}>
                    <Ionicons name={f.icon as any} size={16} color={GOLD} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.featureLabel}>{f.label}</Text>
                    <Text style={s.featureSub}>{f.sub}</Text>
                  </View>
                  <Ionicons name="checkmark" size={14} color={GREEN} />
                </View>
              ))}
            </View>

            {/* Pricing */}
            <View style={s.pricingCard}>
              <Text style={s.price}>$9.99</Text>
              <Text style={s.pricePer}>/month</Text>
              <Text style={s.priceNote}>Cancel anytime</Text>
            </View>

            {/* CTA */}
            <AnimatedPressable style={s.ctaBtn} onPress={handleSubscribe} scaleDown={0.97}>
              <Text style={s.ctaBtnText}>Start Dilly Pro</Text>
            </AnimatedPressable>

            <Text style={s.terms}>7-day free trial. Cancel anytime. Billed monthly through the App Store.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: { backgroundColor: colors.s1, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  closeBtn: { position: 'absolute', top: 16, right: 16, zIndex: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 24, paddingTop: 20 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  logo: { fontFamily: 'Cinzel_900Black', fontSize: 24, color: GOLD, letterSpacing: 3 },
  proBadge: { backgroundColor: GOLD, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  proBadgeText: { fontFamily: 'Cinzel_700Bold', fontSize: 10, letterSpacing: 1, color: '#1a1400' },

  headline: { fontFamily: 'Cinzel_700Bold', fontSize: 20, color: colors.t1, letterSpacing: 0.5, lineHeight: 28, marginBottom: 12 },
  featurePrompt: { fontSize: 13, color: GOLD, lineHeight: 20, marginBottom: 16, fontWeight: '600' },

  featuresList: { gap: 12, marginBottom: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: GOLD + '10', alignItems: 'center', justifyContent: 'center' },
  featureLabel: { fontSize: 14, fontWeight: '700', color: colors.t1 },
  featureSub: { fontSize: 11, color: colors.t3, marginTop: 1 },

  pricingCard: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2, marginBottom: 16 },
  price: { fontFamily: 'Cinzel_700Bold', fontSize: 36, color: colors.t1 },
  pricePer: { fontSize: 14, color: colors.t3, paddingBottom: 4 },
  priceNote: { fontSize: 11, color: colors.t3, marginLeft: 8, paddingBottom: 4 },

  ctaBtn: { backgroundColor: GOLD, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 12, shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16 },
  ctaBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 16, letterSpacing: 1, color: '#1a1400' },

  terms: { fontSize: 10, color: colors.t3, textAlign: 'center', lineHeight: 15 },
});
