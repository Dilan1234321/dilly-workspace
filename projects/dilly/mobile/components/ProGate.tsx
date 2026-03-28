import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/tokens';
import AnimatedPressable from './AnimatedPressable';
import { useSubscription } from '../hooks/useSubscription';

const GOLD = '#C9A84C';

interface Props {
  feature: string;  // e.g. 'resume_editor', 'tracker', 'ats', 'gap_analysis'
  children: React.ReactNode;
  fallback?: React.ReactNode;  // Optional custom fallback for free tier
}

/**
 * Wraps a premium feature. On free tier, shows a lock overlay instead of children.
 * Tapping the lock triggers the paywall modal.
 * 
 * Usage:
 *   <ProGate feature="resume_editor">
 *     <ResumeEditor />
 *   </ProGate>
 */
export default function ProGate({ feature, children, fallback }: Props) {
  const { isPaid, showPaywall } = useSubscription();

  if (isPaid) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <View style={s.container}>
      <View style={s.lockCard}>
        <View style={s.lockIcon}>
          <Ionicons name="lock-closed" size={24} color={GOLD} />
        </View>
        <Text style={s.lockTitle}>Dilly Pro Feature</Text>
        <Text style={s.lockSub}>Upgrade to access this and all Pro features.</Text>
        <AnimatedPressable style={s.unlockBtn} onPress={() => showPaywall(feature)} scaleDown={0.97}>
          <Ionicons name="flash" size={14} color="#1a1400" />
          <Text style={s.unlockBtnText}>Unlock with Pro</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

/**
 * Inline lock badge — use on buttons/cards that are partially visible but not actionable.
 * Shows a small lock icon and triggers paywall on tap.
 * 
 * Usage:
 *   <ProBadge feature="ats" />  — renders a small "PRO" badge
 */
export function ProBadge({ feature }: { feature: string }) {
  const { isPaid, showPaywall } = useSubscription();

  if (isPaid) return null;

  return (
    <AnimatedPressable style={s.badge} onPress={() => showPaywall(feature)} scaleDown={0.95}>
      <Ionicons name="lock-closed" size={8} color={GOLD} />
      <Text style={s.badgeText}>PRO</Text>
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  lockCard: {
    alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32,
  },
  lockIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: GOLD + '10', borderWidth: 1, borderColor: GOLD + '20',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  lockTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 16, color: colors.t1, letterSpacing: 0.5, marginBottom: 6 },
  lockSub: { fontSize: 13, color: colors.t3, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GOLD, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
  },
  unlockBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, letterSpacing: 0.5, color: '#1a1400' },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: GOLD + '15', borderRadius: 4, borderWidth: 1, borderColor: GOLD + '30',
    paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeText: { fontSize: 7, fontWeight: '800', color: GOLD, letterSpacing: 0.5 },
});
