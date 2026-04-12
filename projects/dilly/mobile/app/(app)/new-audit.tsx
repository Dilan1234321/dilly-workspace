/**
 * New Audit - simplified. Scoring is gone.
 * Dilly evaluates fit per-job via narratives, not overall scores.
 */

import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

export default function NewAuditScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <AnimatedPressable onPress={() => router.back()} style={s.backBtn} scaleDown={0.9}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </AnimatedPressable>
        <Text style={s.headerTitle}>Your Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.content}>
        <FadeInView delay={0}>
          <View style={s.card}>
            <Ionicons name="checkmark-circle" size={48} color={colors.green} />
            <Text style={s.title}>Your profile is always up to date.</Text>
            <Text style={s.sub}>
              Dilly evaluates your fit for each job individually, based on everything in your profile. No overall score needed.
            </Text>
          </View>
        </FadeInView>

        <FadeInView delay={100}>
          <AnimatedPressable style={s.primaryBtn} onPress={() => router.push('/(app)/jobs')} scaleDown={0.97}>
            <Ionicons name="briefcase" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>Go to Jobs</Text>
          </AnimatedPressable>
        </FadeInView>

        <FadeInView delay={200}>
          <AnimatedPressable style={s.secondaryBtn} onPress={() => router.push('/(app)/my-dilly-profile')} scaleDown={0.97}>
            <Ionicons name="person-circle" size={18} color={colors.indigo} />
            <Text style={s.secondaryBtnText}>View My Profile</Text>
          </AnimatedPressable>
        </FadeInView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.s1, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.t1 },
  content: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.lg,
  },
  card: {
    alignItems: 'center', gap: 12,
    backgroundColor: colors.s1, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.b1,
    padding: spacing.xxl,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.t1, textAlign: 'center' },
  sub: { fontSize: 14, color: colors.t2, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.indigo, borderRadius: radius.xl,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xxl, width: '100%',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.idim, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.ibdr,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xxl, width: '100%',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.indigo },
});
