import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, clearAuth } from '../../lib/auth';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

const GOLD = '#C9A84C';
const APP_VERSION = '1.0.0';

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={st.sectionHeader}>
      <Ionicons name={icon as any} size={12} color={GOLD} />
      <Text style={st.sectionLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={st.rowValue}>{value}</Text>
    </View>
  );
}

function ToggleRow({
  label, hint, value, onToggle,
}: {
  label: string; hint?: string; value: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <View style={st.row}>
      <View style={{ flex: 1 }}>
        <Text style={st.rowLabel}>{label}</Text>
        {hint ? <Text style={st.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.s3, true: 'rgba(201,168,76,0.35)' }}
        thumbColor={value ? GOLD : colors.t3}
      />
    </View>
  );
}

function LinkRow({ label, icon, onPress, color }: { label: string; icon: string; onPress: () => void; color?: string }) {
  return (
    <AnimatedPressable style={st.row} onPress={onPress} scaleDown={0.98}>
      <Text style={[st.rowLabel, color ? { color } : null]}>{label}</Text>
      <Ionicons name={icon as any} size={16} color={color || colors.t3} />
    </AnimatedPressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<Record<string, any>>({});
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [deadlineReminders, setDeadlineReminders] = useState(true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/profile');
        const data = await res.json();
        setProfile(data ?? {});
        setNotifEnabled(data?.notification_prefs?.enabled !== false);
        setDeadlineReminders(true);
        setLeaderboardOptIn(data?.leaderboard_opt_in !== false);
      } catch {}
    })();
  }, []);

  const email = profile.email || '';
  const name = profile.name || '';
  const school = profile.school_id === 'utampa' ? 'University of Tampa' : (profile.school_id || 'Unknown');
  const cohort = profile.track || profile.cohort || 'General';

  async function savePreference(key: string, value: any) {
    setSaving(true);
    try {
      await apiFetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      Alert.alert('Error', 'Could not save preference.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleNotifications(enabled: boolean) {
    setNotifEnabled(enabled);
    await savePreference('notification_prefs', { enabled });
  }

  async function handleToggleLeaderboard(enabled: boolean) {
    setLeaderboardOptIn(enabled);
    await savePreference('leaderboard_opt_in', enabled);
  }

  function handleSignOut() {
    Alert.alert(
      'Sign out',
      'You\'ll need to verify your email again to sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await clearAuth();
            router.replace('/');
          },
        },
      ]
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your profile, scores, and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Last chance. All your data will be permanently deleted.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const res = await apiFetch('/account/delete', { method: 'POST' });
                      if (!res.ok) throw new Error();
                      await clearAuth();
                      router.replace('/');
                    } catch {
                      Alert.alert('Error', 'Could not delete account. Please try again.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <FadeInView delay={0}>
        <View style={st.navBar}>
          <AnimatedPressable onPress={() => router.back()} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.t1} />
          </AnimatedPressable>
          <Text style={st.navTitle}>Settings</Text>
          <View style={{ width: 22 }} />
        </View>
      </FadeInView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <FadeInView delay={60}>
          <SectionHeader icon="person-outline" label="ACCOUNT" />
          <View style={st.card}>
            <InfoRow label="Name" value={name || 'Not set'} />
            <View style={st.divider} />
            <InfoRow label="Email" value={email || 'Not set'} />
            <View style={st.divider} />
            <InfoRow label="School" value={school} />
            <View style={st.divider} />
            <InfoRow label="Cohort" value={cohort} />
            <View style={st.divider} />
            <LinkRow label="Edit profile" icon="chevron-forward" onPress={() => router.push('/(app)/profile')} />
          </View>
        </FadeInView>

        <FadeInView delay={120}>
          <SectionHeader icon="notifications-outline" label="NOTIFICATIONS" />
          <View style={st.card}>
            <ToggleRow label="Push notifications" hint="Score updates, coaching tips, job matches" value={notifEnabled} onToggle={handleToggleNotifications} />
            <View style={st.divider} />
            <ToggleRow label="Deadline reminders" hint="Get reminded before interviews and deadlines" value={deadlineReminders} onToggle={setDeadlineReminders} />
          </View>
        </FadeInView>

        <FadeInView delay={180}>
          <SectionHeader icon="shield-outline" label="PRIVACY" />
          <View style={st.card}>
            <ToggleRow label="Show on leaderboard" hint="Other students can see your rank and score" value={leaderboardOptIn} onToggle={handleToggleLeaderboard} />
          </View>
        </FadeInView>

        <FadeInView delay={240}>
          <SectionHeader icon="diamond-outline" label="SUBSCRIPTION" />
          <View style={st.card}>
            <View style={st.planRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.planName}>Free Plan</Text>
                <Text style={st.planDesc}>Score + leaderboard rank + 2 recommendations</Text>
              </View>
              <View style={st.planBadge}>
                <Text style={st.planBadgeText}>CURRENT</Text>
              </View>
            </View>
            <View style={st.divider} />
            <AnimatedPressable style={st.upgradeBtn} onPress={() => Alert.alert('Coming soon', 'Payments are not yet available.')} scaleDown={0.97}>
              <Ionicons name="flash" size={14} color="#1a1400" />
              <Text style={st.upgradeBtnText}>Upgrade to Dilly Pro · $9.99/mo</Text>
            </AnimatedPressable>
            <Text style={st.upgradeHint}>Unlimited audits, AI coaching, all jobs, score history</Text>
          </View>
        </FadeInView>

        <FadeInView delay={300}>
          <SectionHeader icon="help-circle-outline" label="SUPPORT" />
          <View style={st.card}>
            <LinkRow label="Send feedback" icon="chatbubble-ellipses-outline" onPress={() => Linking.openURL('mailto:support@dillyapp.com?subject=Dilly%20Feedback')} />
            <View style={st.divider} />
            <LinkRow label="Contact support" icon="mail-outline" onPress={() => Linking.openURL('mailto:support@dillyapp.com')} />
            <View style={st.divider} />
            <LinkRow label="Privacy policy" icon="document-text-outline" onPress={() => Alert.alert('Privacy Policy', 'Coming soon')} />
            <View style={st.divider} />
            <LinkRow label="Terms of service" icon="document-text-outline" onPress={() => Alert.alert('Terms of Service', 'Coming soon')} />
          </View>
        </FadeInView>

        <FadeInView delay={360}>
          <View style={st.card}>
            <LinkRow label="Sign out" icon="log-out-outline" onPress={handleSignOut} color={colors.amber} />
            <View style={st.divider} />
            <LinkRow label="Delete account" icon="trash-outline" onPress={handleDeleteAccount} color={colors.coral} />
          </View>
        </FadeInView>

        <FadeInView delay={400}>
          <View style={st.versionWrap}>
            <Text style={st.versionText}>Dilly v{APP_VERSION}</Text>
            <Text style={st.versionSub}>Made for students who want to win.</Text>
          </View>
        </FadeInView>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  navTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  scroll: { paddingHorizontal: spacing.xl },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginTop: 24, marginBottom: 10,
  },
  sectionLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.5, color: GOLD },
  card: {
    backgroundColor: colors.s2, borderRadius: 14,
    borderWidth: 1, borderColor: colors.b1, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.b1, marginHorizontal: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14, gap: 12,
  },
  rowLabel: { flex: 1, fontSize: 14, color: colors.t1, fontWeight: '500' },
  rowValue: { fontSize: 13, color: colors.t3, textAlign: 'right', maxWidth: '55%' },
  rowHint: { fontSize: 11, color: colors.t3, lineHeight: 15, marginTop: 2 },
  planRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14, gap: 12,
  },
  planName: { fontSize: 15, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  planDesc: { fontSize: 11, color: colors.t3, lineHeight: 16 },
  planBadge: { backgroundColor: colors.s3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  planBadgeText: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1, color: colors.t3 },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GOLD, marginHorizontal: 14, marginTop: 10, marginBottom: 6,
    borderRadius: 11, paddingVertical: 12,
  },
  upgradeBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 12, letterSpacing: 0.5, color: '#1a1400' },
  upgradeHint: { fontSize: 10, color: colors.t3, textAlign: 'center', paddingBottom: 14, paddingHorizontal: 14 },
  versionWrap: { alignItems: 'center', paddingVertical: 28, gap: 4 },
  versionText: { fontFamily: 'Cinzel_400Regular', fontSize: 11, letterSpacing: 1, color: colors.t3 },
  versionSub: { fontSize: 10, color: colors.b3, fontStyle: 'italic' },
});