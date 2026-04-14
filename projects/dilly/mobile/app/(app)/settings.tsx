/**
 * Settings - clean, simple, every button works.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Switch, Alert, Linking, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearAuth } from '../../lib/auth';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

const INDIGO = colors.indigo;
const APP_VERSION = '1.0.0';

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={s.sectionLabel}>{text}</Text>;
}

function Row({ label, value, onPress }: { label: string; value?: string; onPress?: () => void }) {
  return (
    <AnimatedPressable style={s.row} onPress={onPress} disabled={!onPress} scaleDown={onPress ? 0.98 : 1}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {value ? <Text style={s.rowValue}>{value}</Text> : null}
        {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.t3} /> : null}
      </View>
    </AnimatedPressable>
  );
}

function ToggleRow({ label, hint, value, onToggle }: { label: string; hint?: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {hint ? <Text style={s.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.b2, true: INDIGO + '40' }}
        thumbColor={value ? INDIGO : '#f4f3f4'}
      />
    </View>
  );
}

function Divider() {
  return <View style={s.divider} />;
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('starter');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [deadlineReminders, setDeadlineReminders] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const p = await dilly.get('/profile');
      if (p) {
        setName(p.name || '');
        setEmail(p.email || '');
        setPlan(p.plan || 'starter');
        const prefs = p.notification_prefs || {};
        setPushEnabled(prefs.enabled !== false);
        setDeadlineReminders(prefs.deadline_reminders !== false);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchProfile(); }, []);

  async function savePref(key: string, value: any) {
    try {
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
    } catch {}
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await clearAuth();
          router.replace('/onboarding/choose-path');
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Are you absolutely sure?', 'All your data will be gone forever.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Yes, delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await dilly.fetch('/profile/delete', { method: 'DELETE' });
                  } catch {}
                  await clearAuth();
                  router.replace('/onboarding/choose-path');
                },
              },
            ]);
          },
        },
      ],
    );
  }

  const planLabel = plan === 'pro' ? 'Dilly Pro' : plan === 'dilly' ? 'Dilly' : 'Starter';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <AnimatedPressable onPress={() => router.back()} scaleDown={0.9} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.t1} />
        </AnimatedPressable>
        <Text style={s.headerTitle}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchProfile(); setRefreshing(false); }} />}
      >
        {/* Account */}
        <FadeInView delay={0}>
          <SectionLabel text="ACCOUNT" />
          <View style={s.card}>
            <Row label="Name" value={name || 'Not set'} />
            <Divider />
            <Row label="Email" value={email || 'Not set'} />
          </View>
        </FadeInView>

        {/* Plan */}
        <FadeInView delay={40}>
          <SectionLabel text="PLAN" />
          <View style={s.card}>
            <View style={s.planRow}>
              <Text style={s.planName}>{planLabel}</Text>
              <View style={[s.planBadge, plan !== 'starter' && { backgroundColor: INDIGO + '15', borderColor: INDIGO + '30' }]}>
                <Text style={[s.planBadgeText, plan !== 'starter' && { color: INDIGO }]}>CURRENT</Text>
              </View>
            </View>
            {plan === 'starter' && (
              <>
                <Divider />
                <AnimatedPressable
                  style={s.upgradeBtn}
                  onPress={() => Linking.openURL('https://hellodilly.com/pricing')}
                  scaleDown={0.97}
                >
                  <Ionicons name="diamond" size={14} color="#fff" />
                  <Text style={s.upgradeBtnText}>See plans</Text>
                </AnimatedPressable>
              </>
            )}
          </View>
        </FadeInView>

        {/* Notifications */}
        <FadeInView delay={80}>
          <SectionLabel text="NOTIFICATIONS" />
          <View style={s.card}>
            <ToggleRow
              label="Push notifications"
              hint="Job matches, coaching tips"
              value={pushEnabled}
              onToggle={v => {
                setPushEnabled(v);
                savePref('notification_prefs', { enabled: v, deadline_reminders: deadlineReminders });
              }}
            />
            <Divider />
            <ToggleRow
              label="Deadline reminders"
              hint="Before interviews and deadlines"
              value={deadlineReminders}
              onToggle={v => {
                setDeadlineReminders(v);
                savePref('notification_prefs', { enabled: pushEnabled, deadline_reminders: v });
              }}
            />
          </View>
        </FadeInView>

        {/* About */}
        <FadeInView delay={120}>
          <SectionLabel text="ABOUT" />
          <View style={s.card}>
            <Row label="Terms of Service" onPress={() => Linking.openURL('https://hellodilly.com/terms')} />
            <Divider />
            <Row label="Privacy Policy" onPress={() => Linking.openURL('https://hellodilly.com/privacy')} />
            <Divider />
            <Row label="Contact us" onPress={() => Linking.openURL('mailto:hello@trydilly.com')} />
          </View>
          <Text style={s.versionText}>Dilly v{APP_VERSION}</Text>
        </FadeInView>

        {/* Sign out */}
        <FadeInView delay={160}>
          <AnimatedPressable style={s.signOutBtn} onPress={handleSignOut} scaleDown={0.97}>
            <Ionicons name="log-out-outline" size={16} color="#FF453A" />
            <Text style={s.signOutText}>Sign out</Text>
          </AnimatedPressable>
        </FadeInView>

        {/* Delete */}
        <FadeInView delay={200}>
          <AnimatedPressable style={s.deleteBtn} onPress={handleDeleteAccount} scaleDown={0.97}>
            <Ionicons name="trash-outline" size={12} color={colors.t3} />
            <Text style={s.deleteText}>Delete account</Text>
          </AnimatedPressable>
        </FadeInView>

        {/* AI Disclaimer */}
        <View style={{ paddingVertical: 24, paddingHorizontal: 8 }}>
          <Text style={s.disclaimer}>
            Dilly uses AI to generate career insights, fit assessments, and resume content. AI-generated content may not always be accurate. Always verify important information independently. Dilly is not a substitute for professional career advice.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.t1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: 16 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    color: colors.t3, marginTop: 20, marginBottom: 8,
  },

  card: {
    backgroundColor: colors.s1, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.b1, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowLabel: { fontSize: 14, fontWeight: '500', color: colors.t1 },
  rowValue: { fontSize: 14, color: colors.t3 },
  rowHint: { fontSize: 11, color: colors.t3, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.b1, marginHorizontal: 16 },

  planRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  planName: { fontSize: 16, fontWeight: '700', color: colors.t1 },
  planBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
  },
  planBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: colors.t3 },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: INDIGO, margin: 16, marginTop: 8, paddingVertical: 12, borderRadius: radius.lg,
  },
  upgradeBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  versionText: { fontSize: 11, color: colors.t3, textAlign: 'center', marginTop: 12 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, marginTop: 24,
  },
  signOutText: { fontSize: 14, fontWeight: '600', color: '#FF453A' },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10,
  },
  deleteText: { fontSize: 11, color: colors.t3 },

  disclaimer: {
    fontSize: 10, color: colors.t3, textAlign: 'center', lineHeight: 15,
  },
});
