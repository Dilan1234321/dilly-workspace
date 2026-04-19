/**
 * Settings - clean, simple, every button works.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Switch, Alert, Linking, RefreshControl, Image, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Animated, Easing,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Share } from 'react-native';
import { clearAuth } from '../../lib/auth';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { getAppMode, modeLabel, modeDescription, ALL_MODES, type AppMode } from '../../lib/appMode';
import { primeAppMode, clearAppModeCache } from '../../hooks/useAppMode';
import { clearThemeCache } from '../../hooks/useTheme';
import { triggerCelebration } from '../../hooks/useCelebration';
import { clearAll as clearSessionCache } from '../../lib/sessionCache';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { CancelGoodbyeModal } from '../../components/CancelGoodbyeModal';
import { THEMES, useTheme, setTheme, useResolvedTheme } from '../../hooks/useTheme';

const INDIGO = colors.indigo;
const APP_VERSION = '1.0.0';

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  const t = useResolvedTheme();
  return <Text style={[s.sectionLabel, { color: t.surface.t3 }]}>{text}</Text>;
}

function Row({ label, value, onPress }: { label: string; value?: string; onPress?: () => void }) {
  const t = useResolvedTheme();
  return (
    <AnimatedPressable style={s.row} onPress={onPress} disabled={!onPress} scaleDown={onPress ? 0.98 : 1}>
      <Text style={[s.rowLabel, { color: t.surface.t1 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {value ? <Text style={[s.rowValue, { color: t.surface.t2 }]}>{value}</Text> : null}
        {onPress ? <Ionicons name="chevron-forward" size={14} color={t.surface.t3} /> : null}
      </View>
    </AnimatedPressable>
  );
}

function ToggleRow({ label, hint, value, onToggle }: { label: string; hint?: string; value: boolean; onToggle: (v: boolean) => void }) {
  const t = useResolvedTheme();
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, { color: t.surface.t1 }]}>{label}</Text>
        {hint ? <Text style={[s.rowHint, { color: t.surface.t3 }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: t.surface.s3, true: t.accent + '40' }}
        thumbColor={value ? t.accent : '#f4f3f4'}
      />
    </View>
  );
}

function Divider() {
  return <View style={s.divider} />;
}

/** Promo code expander. Shared between the starter upgrade hero and
 * the paid status card so both plan states have the same redeem UX.
 * Owns no state; parent passes everything in. */
function PromoCodeForm({
  theme, promoCode, setPromoCode, promoSubmitting, handleRedeemPromo, onCancel,
}: {
  theme: any;
  promoCode: string;
  setPromoCode: (v: string) => void;
  promoSubmitting: boolean;
  handleRedeemPromo: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <TextInput
        value={promoCode}
        onChangeText={setPromoCode}
        placeholder="Enter code"
        placeholderTextColor={theme.surface.t3}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!promoSubmitting}
        style={{
          backgroundColor: theme.surface.s2,
          borderWidth: 1,
          borderColor: theme.surface.border,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 15,
          color: theme.surface.t1,
          letterSpacing: 1,
        }}
        onSubmitEditing={handleRedeemPromo}
        returnKeyType="go"
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <AnimatedPressable
          style={{
            flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
            backgroundColor: theme.accent,
            opacity: !promoCode.trim() || promoSubmitting ? 0.5 : 1,
          }}
          onPress={handleRedeemPromo}
          disabled={!promoCode.trim() || promoSubmitting}
          scaleDown={0.97}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
            {promoSubmitting ? 'Redeeming...' : 'Redeem'}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' }}
          onPress={onCancel}
          scaleDown={0.97}
        >
          <Text style={{ fontSize: 14, color: theme.surface.t2 }}>Cancel</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

/** Horizontal swatch picker. Selected theme gets a ring + checkmark. */
function ThemePicker() {
  const current = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 }}>
      {THEMES.map(t => {
        const selected = t.id === current.id;
        return (
          <AnimatedPressable
            key={t.id}
            onPress={() => setTheme(t.id)}
            scaleDown={0.92}
            style={{ alignItems: 'center', gap: 6 }}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: t.accent,
              borderWidth: selected ? 3 : 1,
              borderColor: selected ? t.accent : colors.b1,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: t.accent,
              shadowOpacity: selected ? 0.35 : 0,
              shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
              elevation: selected ? 4 : 0,
            }}>
              {selected && <Ionicons name="checkmark" size={20} color="#fff" />}
            </View>
            <Text style={{
              fontSize: 10,
              fontWeight: selected ? '800' : '600',
              color: selected ? t.accent : colors.t3,
              letterSpacing: 0.2,
            }}>
              {t.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  // Settings respects the user's theme: container bg, card surfaces,
  // text color, refresh tint. Customize → Mint should turn this
  // whole screen pale green, etc.
  const theme = useResolvedTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('starter');
  // In-app banner for confirmations and errors. Auto-dismisses after
  // 4 seconds. Used for cancel-subscription success, promo-code
  // errors, and anything else that shouldn't feel like an iOS system
  // alert. Tester feedback: the stock Alert popups broke the Dilly
  // aesthetic and read as "generic phone UI," not a premium app.
  //
  // Banner mount pattern: we keep the banner MOUNTED through the exit
  // animation so it can fade out cleanly (instead of the jarring
  // conditional-render pop-out). `visible` controls the slide/fade
  // animation; `message` is what's rendered; both clear together on
  // unmount via the end-of-fade callback.
  const [settingsBanner, setSettingsBanner] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!settingsBanner) return;
    // Fade in + slide down from -8px.
    Animated.timing(bannerAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => {
      Animated.timing(bannerAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setSettingsBanner(null);
      });
    }, 3800);
    return () => clearTimeout(t);
  }, [settingsBanner, bannerAnim]);

  // Goodbye modal — shown AFTER a successful cancel instead of a
  // plain "subscription cancelled" alert. Gives the moment the
  // weight it deserves + offers a 60s uncancel window.
  const [goodbyeState, setGoodbyeState] = useState<{
    visible: boolean;
    previousPlan: 'dilly' | 'pro';
  } | null>(null);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [deadlineReminders, setDeadlineReminders] = useState(true);
  const [webProfileOn, setWebProfileOn] = useState(true);
  const [webSlug, setWebSlug] = useState('');
  const [webPrefix, setWebPrefix] = useState('s');
  const [webTagline, setWebTagline] = useState('');
  const [taglineSaving, setTaglineSaving] = useState(false);
  // Career Mode. reshapes the whole app. See lib/appMode.ts.
  // Stored as an optional override on the profile; when null, mode is
  // derived from user_path.
  const [appMode, setAppMode] = useState<AppMode>('seeker');
  const [appModeOverride, setAppModeOverride] = useState<string | null>(null);
  const [userPath, setUserPath] = useState<string>('');
  const [appModeSaving, setAppModeSaving] = useState(false);
  // Promo code redemption. Open expands an input row under Plan; on
  // submit we hit /auth/redeem-promo-code which flips plan locally.
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoSubmitting, setPromoSubmitting] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const [p, slugRes] = await Promise.all([
        dilly.get('/profile'),
        dilly.fetch('/profile/generate-slug', { method: 'POST' }).then(r => r?.ok ? r.json() : null).catch(() => null),
      ]);
      if (p) {
        setName(p.name || '');
        setEmail(p.email || '');
        setPlan(p.plan || 'starter');
        setUserPath(p.user_path || '');
        setAppModeOverride(p.app_mode || null);
        setAppMode(getAppMode(p));
        const prefs = p.notification_prefs || {};
        setPushEnabled(prefs.enabled !== false);
        setDeadlineReminders(prefs.deadline_reminders !== false);
        setWebProfileOn(p.public_profile_visible !== false);
        setWebTagline(p.profile_tagline || '');
        // Read slug and prefix from profile data
        const ut = p.user_type || 'student';
        const pfx = (ut === 'general' || ut === 'professional') ? 'p' : 's';
        setWebPrefix(pfx);
        if (p.readable_slug) setWebSlug(p.readable_slug);
      }
      // API slug overrides profile value
      if (slugRes?.slug) {
        setWebSlug(slugRes.slug);
        if (slugRes.prefix) setWebPrefix(slugRes.prefix);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchProfile(); }, []);

  // Scroll to top whenever Settings gains focus. Without this, the
  // ScrollView preserves position from the last visit — so a user
  // who scrolled to Delete Account, then tapped Settings from the
  // header icon, would land back at the bottom instead of seeing
  // Edit Profile / Plan first. Tester feedback: "pressing the
  // settings icon should always start at the top of settings."
  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      // Run after next frame so the list has mounted / laid out.
      const id = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      return () => cancelAnimationFrame(id);
    }, [])
  );

  async function savePref(key: string, value: any) {
    try {
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
    } catch {}
  }

  // Career Mode switch. The server validates the value; we optimistically
  // update local state so the toggle feels instant.
  async function handleModeSwitch(nextMode: AppMode) {
    if (nextMode === appMode || appModeSaving) return;
    setAppModeSaving(true);
    setAppMode(nextMode);
    setAppModeOverride(nextMode);
    // Push the new mode into the module-level + AsyncStorage cache so
    // every other consumer of useAppMode (tab bar, dispatchers in
    // HomeScreen / MyDillyProfileScreen / JobsScreen) flips to the
    // new mode on its next render. Session data caches are left
    // intact so switching feels instant. the other mode's cached
    // data is still there when the user flips back.
    await primeAppMode(nextMode);
    try {
      await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ app_mode: nextMode }),
      });
    } catch {
      // Roll back on failure. Tries to re-derive from the last known
      // profile shape rather than snapping to 'seeker'.
      const rollback = getAppMode({ user_path: userPath, app_mode: appModeOverride });
      setAppMode(rollback);
      setAppModeOverride(appModeOverride);
      await primeAppMode(rollback);
    } finally {
      setAppModeSaving(false);
    }
  }

  async function handleRedeemPromo() {
    const raw = promoCode.trim();
    if (!raw || promoSubmitting) return;
    setPromoSubmitting(true);
    try {
      const res = await dilly.fetch('/auth/redeem-promo-code', {
        method: 'POST',
        body: JSON.stringify({ code: raw }),
      });
      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const detail = body?.detail;
        const msg = typeof detail === 'string' ? detail
          : detail?.message || "That code isn't valid.";
        setSettingsBanner({ kind: 'error', message: msg });
        return;
      }
      // Success — refresh local plan + collapse the input. Fire the
      // celebration overlay on an UPGRADE to a paid tier. For starter
      // codes (like DILLYTAMPAFREE which flips back to free) we skip
      // the celebration and show the in-app banner instead — nothing
      // to celebrate about going free.
      const newPlan = body?.plan || plan;
      setPlan(newPlan);
      setPromoCode('');
      setPromoOpen(false);
      if (newPlan === 'pro' || newPlan === 'dilly') {
        // Delay so the input collapse finishes before the overlay.
        setTimeout(() => {
          triggerCelebration(newPlan === 'pro' ? 'unlocked-pro' : 'unlocked-dilly');
        }, 250);
      } else {
        setSettingsBanner({ kind: 'success', message: body?.message || 'Plan updated.' });
      }
      fetchProfile();
    } catch {
      setSettingsBanner({ kind: 'error', message: "Couldn't reach the server. Try again." });
    } finally {
      setPromoSubmitting(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await clearAuth();
          // Clear cached mode + session data so the next user doesn't
          // inherit this user's mode, dashboard, or market radar.
          await clearAppModeCache();
          // Theme is now server-backed and tied to account — clear the
          // local cache so the next sign-in hydrates from THEIR profile,
          // not the prior user's accent/surface choices.
          await clearThemeCache();
          clearSessionCache();
          // Clear onboarding state so they see the situation options again.
          // IMPORTANT: dilly_tutorial_shown MUST be cleared here so the
          // next account that signs in on this device sees the tutorial.
          // Without it a fresh signup inherits the previous user's flag
          // and gets routed straight to /(app), skipping the 5-card
          // intro. That was a real bug users hit. never ship signout
          // without wiping this key.
          try {
            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
            await AsyncStorage.multiRemove([
              'dilly_has_onboarded', 'dilly_pending_user_path', 'dilly_pending_plan',
              'dilly_visited_jobs', 'dilly_visited_arena', 'dilly_done_interview',
              'dilly_tutorial_shown',
            ]).catch(() => {});
          } catch {}
          router.replace('/onboarding/choose-situation');
        },
      },
    ]);
  }

  async function handleCancelSubscription() {
    // Standalone cancel — ends Stripe billing but keeps the account
    // and all data. Tester feedback: the iOS "Subscription cancelled"
    // system alert felt like a stock OS confirmation instead of part
    // of Dilly, which broke the premium feel. Confirmation step still
    // uses Alert (hard-stop decision point), but SUCCESS is now an
    // in-app banner shown at the top of Settings that auto-dismisses.
    const planName = plan === 'pro' ? 'Dilly Pro' : 'Dilly';
    Alert.alert(
      `Cancel ${planName}?`,
      'Your subscription ends now. You keep your profile and everything Dilly has learned about you. You can resubscribe anytime.',
      [
        { text: 'Keep subscription', style: 'cancel' },
        {
          text: 'Cancel subscription',
          style: 'destructive',
          onPress: async () => {
            let res: Response | null = null;
            try {
              res = await dilly.fetch('/subscription/cancel', { method: 'POST' });
            } catch {
              setSettingsBanner({
                kind: 'error',
                message: "We couldn't reach the server. Check your connection and try again.",
              });
              return;
            }
            if (!res.ok) {
              let msg = 'Please try again in a minute.';
              try {
                const body = await res.clone().json();
                const detail = body?.detail;
                if (typeof detail === 'string') msg = detail;
                else if (detail?.message) msg = detail.message;
              } catch {}
              setSettingsBanner({ kind: 'error', message: msg });
              return;
            }
            // Capture the previous plan BEFORE flipping so the
            // goodbye modal can tailor its copy (Pro users had more
            // to lose, so they see a slightly longer list).
            const prevPlan: 'dilly' | 'pro' = plan === 'pro' ? 'pro' : 'dilly';
            // Flip the local plan state immediately so the Plan
            // section re-renders as Starter without a manual reload.
            setPlan('starter');
            // Goodbye modal takes over from here — replaces the
            // plain Alert with a calm, considered moment that names
            // what the user is pausing and offers a 60s uncancel.
            setGoodbyeState({ visible: true, previousPlan: prevPlan });
          },
        },
      ],
    );
  }

  // Reverse a cancel by reopening the checkout flow. Called from the
  // goodbye modal's "Actually, keep my subscription" link. This is
  // the same path as a normal upgrade — the user just goes back
  // through Stripe checkout. Cost to them: a second card charge,
  // but Stripe prorates so they're not double-billed.
  async function handleUncancel() {
    setGoodbyeState(null);
    // Route to the pricing page where upgrade happens. The user who
    // hit Uncancel almost certainly wants their previous tier back.
    Linking.openURL('https://hellodilly.com/pricing');
  }

  async function handleDeleteAccount() {
    // Two-step confirm. The first alert names the consequences in plain
    // language; the second is a final "are you absolutely sure". Paying
    // users see the subscription-cancel line so they know their card
    // won't keep getting charged.
    const isPaid = plan === 'dilly' || plan === 'pro';
    const firstMessage = isPaid
      ? 'This will cancel your subscription and permanently delete your account and all data. This cannot be undone.'
      : 'This will permanently delete your account and all data. This cannot be undone.';

    Alert.alert('Delete account', firstMessage, [
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
                // Hit the real endpoint and actually wait for confirmation.
                // Backend cancels Stripe before deleting data and returns
                // 503 if Stripe is unreachable — in that case we must NOT
                // clear local auth, otherwise the user ends up locked out
                // of an account that still exists and is still billing.
                let res: Response | null = null;
                try {
                  res = await dilly.fetch('/account/delete', { method: 'POST' });
                } catch (e) {
                  Alert.alert(
                    'Could not delete account',
                    'We could not reach the server. Check your connection and try again.',
                  );
                  return;
                }
                if (!res.ok) {
                  // Most likely 503 — Stripe cancel failed. Show the
                  // server's message if present so the user knows to retry.
                  let msg = 'Please try again in a minute.';
                  try {
                    const body = await res.clone().json();
                    const detail = body?.detail;
                    if (typeof detail === 'string') msg = detail;
                    else if (detail?.message) msg = detail.message;
                  } catch {}
                  Alert.alert('Could not delete account', msg);
                  return;
                }
                // Success — wipe local state and route to onboarding.
                await clearAuth();
                try {
                  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                  await AsyncStorage.multiRemove([
                    'dilly_has_onboarded', 'dilly_visited_jobs', 'dilly_visited_arena',
                    'dilly_done_interview', 'dilly_pending_upload',
                    'dilly_pending_user_path', 'dilly_pending_plan',
                    'dilly_tutorial_shown',
                  ]).catch(() => {});
                } catch {}
                router.replace('/onboarding/choose-situation');
              },
            },
          ]);
        },
      },
    ]);
  }

  const planLabel = plan === 'pro' ? 'Dilly Pro' : plan === 'dilly' ? 'Dilly' : 'Dilly Starter';

  return (
    // KeyboardAvoidingView so TextInputs (promo code, edit profile
    // fields) lift above the keyboard. Tester feedback: fields were
    // getting covered on iOS, forcing users to blind-type.
    <KeyboardAvoidingView
      style={[s.container, { paddingTop: insets.top, backgroundColor: theme.surface.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.surface.border }]}>
        <AnimatedPressable onPress={() => router.back()} scaleDown={0.9} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.surface.t1} />
        </AnimatedPressable>
        <Text style={[s.headerTitle, {
          color: theme.surface.t1,
          fontFamily: theme.type.display,
          fontWeight: theme.type.heroWeight,
          letterSpacing: theme.type.heroTracking,
        }]}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Global in-app banner for Settings. Shows success/error
          messages (cancel confirmation, promo errors, etc.) as an
          inline strip at the top of the scroll view, replacing the
          generic iOS Alert popups. Animated fade + slide-down on
          mount; fade + slide-up on exit. 4s auto-dismiss. */}
      {settingsBanner && (
        <Animated.View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            opacity: bannerAnim,
            transform: [{
              translateY: bannerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-8, 0],
              }),
            }],
            backgroundColor:
              settingsBanner.kind === 'error'
                ? '#FEE2E2'
                : settingsBanner.kind === 'success'
                ? theme.accentSoft
                : theme.surface.s2,
            borderColor:
              settingsBanner.kind === 'error'
                ? '#FCA5A5'
                : settingsBanner.kind === 'success'
                ? theme.accent
                : theme.surface.border,
          }}
        >
          <Ionicons
            name={
              settingsBanner.kind === 'error'
                ? 'alert-circle'
                : settingsBanner.kind === 'success'
                ? 'checkmark-circle'
                : 'information-circle'
            }
            size={16}
            color={
              settingsBanner.kind === 'error'
                ? '#B91C1C'
                : settingsBanner.kind === 'success'
                ? theme.accent
                : theme.surface.t2
            }
          />
          <Text style={{
            flex: 1,
            fontSize: 13,
            fontWeight: '600',
            color: settingsBanner.kind === 'error' ? '#B91C1C' : theme.surface.t1,
          }}>
            {settingsBanner.message}
          </Text>
          <TouchableOpacity onPress={() => setSettingsBanner(null)} hitSlop={8}>
            <Ionicons name="close" size={14} color={theme.surface.t3} />
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchProfile(); setRefreshing(false); }} />}
      >
        {/* Edit Profile (always visible) */}
        <FadeInView delay={0}>
          <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
            {/* Photo */}
            <AnimatedPressable
              style={{ alignItems: 'center', gap: 6, paddingVertical: 12 }}
              onPress={async () => {
                try {
                  const ImagePicker = await import('expo-image-picker');
                  const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
                  if (!result.canceled && result.assets?.[0]) {
                    const { authHeaders } = await import('../../lib/auth');
                    const headers = await authHeaders();
                    const form = new FormData();
                    form.append('file', { uri: result.assets[0].uri, name: 'photo.jpg', type: 'image/jpeg' } as any);
                    const { API_BASE } = await import('../../lib/tokens');
                    await fetch(`${API_BASE}/profile/photo`, { method: 'POST', headers, body: form });
                  }
                } catch {}
              }}
              scaleDown={0.95}
            >
              {webSlug ? (
                <Image source={{ uri: `https://api.trydilly.com/profile/web/${webSlug}/photo?_t=${Date.now()}` }} style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.s2 }} />
              ) : (
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="camera" size={24} color={colors.t3} />
                </View>
              )}
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.indigo }}>Change photo</Text>
            </AnimatedPressable>
            <Divider />
            <Row label="Name" value={name || 'Not set'} />
            <Divider />
            <Row label="Email" value={email || 'Not set'} />
          </View>
        </FadeInView>

        {/* Plan — 3 visual states (starter / dilly / pro). Starter
            gets a dedicated upgrade hero. Paid tiers get a premium
            status card celebrating what they already have. */}
        <FadeInView delay={40}>
          <SectionLabel text="PLAN" />
          {plan === 'starter' ? (
            // ── Starter: loss-aversion upgrade frame. ────────────
            // The copy focuses on what the user CAN'T do yet, not on
            // feature names. Loss aversion > feature touting for
            // conversion. Visual: three locked rows that look like
            // real product items dimmed behind a soft gate. The
            // headline uses social proof ('most people upgrade in
            // the first week') without naming a specific number so
            // we don't tie ourselves to a stat that can age.
            <View style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.accentBorder,
              backgroundColor: theme.accentSoft,
              padding: 20,
              overflow: 'hidden',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Ionicons name="lock-closed" size={11} color={theme.accent} />
                <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: theme.accent }}>
                  LIMITED ACCESS
                </Text>
              </View>
              <Text style={{ fontSize: 26, fontWeight: '900', letterSpacing: -0.6, color: theme.surface.t1, lineHeight: 30 }}>
                You're seeing a fraction.
              </Text>
              <Text style={{ fontSize: 14, color: theme.surface.t2, marginTop: 8, lineHeight: 20 }}>
                There's a version of Dilly built for serious moves. Most people upgrade in their first week.
              </Text>

              {/* Locked rows. Each shows a real feature + its Starter
                  constraint, dimmed so it reads as 'you almost have
                  this.' Triggers the click: 'I already want that, I
                  just don't have it.' */}
              <View style={{ gap: 10, marginTop: 18 }}>
                {[
                  { label: 'Fit reads on every job', limit: 'Locked on Starter' },
                  { label: 'Resumes tailored per role', limit: '1 / month on Starter' },
                  { label: 'A coach that remembers you', limit: 'Basic memory on Starter' },
                ].map((row, i) => (
                  <View key={i} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
                    backgroundColor: theme.surface.s1,
                    borderWidth: 1, borderColor: theme.surface.border,
                  }}>
                    <Ionicons name="lock-closed" size={13} color={theme.surface.t3} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.surface.t1 }}>{row.label}</Text>
                      <Text style={{ fontSize: 11, color: theme.surface.t3, marginTop: 1 }}>{row.limit}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* CTA. Unambiguous verb, accent bg, arrow to signal
                  forward motion. The price line underneath is small
                  enough to look like a note, not a price tag. */}
              <AnimatedPressable
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: theme.accent,
                  borderRadius: 14,
                  paddingVertical: 14,
                  marginTop: 18,
                }}
                onPress={() => Linking.openURL('https://hellodilly.com/pricing')}
                scaleDown={0.97}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 }}>
                  Upgrade to Dilly
                </Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </AnimatedPressable>
              <Text style={{ fontSize: 11, color: theme.surface.t3, textAlign: 'center', marginTop: 8 }}>
                $9.99/mo. Cancel anytime.
              </Text>

              {/* Promo code row — keeps the 'Have a promo code?' affordance
                  accessible even inside the upgrade hero. */}
              <View style={{ height: 1, backgroundColor: theme.accentBorder, marginVertical: 14 }} />
              {!promoOpen ? (
                <AnimatedPressable
                  style={{ alignItems: 'center', paddingVertical: 6 }}
                  onPress={() => setPromoOpen(true)}
                  scaleDown={0.98}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>
                    Have a promo code?
                  </Text>
                </AnimatedPressable>
              ) : (
                <PromoCodeForm
                  theme={theme}
                  promoCode={promoCode}
                  setPromoCode={setPromoCode}
                  promoSubmitting={promoSubmitting}
                  handleRedeemPromo={handleRedeemPromo}
                  onCancel={() => { setPromoOpen(false); setPromoCode(''); }}
                />
              )}
            </View>
          ) : (
            // ── Dilly or Pro: member-pride card. ─────────────────
            // Framing shifts from 'feature list' to 'earned status'.
            // The user isn't a customer with a receipt, they're a
            // member of something. Pro gets a more ornate treatment
            // (double-border, diamond icon, 'PRO' all-caps member
            // mark). Dilly gets a simpler mark that still feels
            // special. Both include an earned-pride line the user
            // can read in a quiet moment and feel good about.
            <View style={{
              borderRadius: 18,
              borderWidth: plan === 'pro' ? 2 : 1,
              borderColor: theme.accent,
              backgroundColor: theme.accentSoft,
              padding: 22,
              overflow: 'hidden',
            }}>
              {/* Pro gets a top accent bar for a badge-y feel. Dilly
                  skips it so the two tiers read as different levels
                  of earned status. */}
              {plan === 'pro' && (
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  backgroundColor: theme.accent,
                }} />
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={plan === 'pro' ? 'diamond' : 'star'} size={13} color={theme.accent} />
                  <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 2.2, color: theme.accent }}>
                    {plan === 'pro' ? 'DILLY PRO · MEMBER' : 'DILLY · MEMBER'}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: plan === 'pro' ? 28 : 26, fontWeight: '900', letterSpacing: -0.6, color: theme.surface.t1, lineHeight: plan === 'pro' ? 32 : 30 }}>
                {plan === 'pro' ? 'Dilly Pro is yours.' : 'Dilly is yours.'}
              </Text>
              <Text style={{ fontSize: 14, color: theme.surface.t2, marginTop: 8, lineHeight: 20 }}>
                {plan === 'pro'
                  ? 'The sharpest Dilly there is. No caps, no ceilings, no gates.'
                  : 'Unlimited fit reads. Resumes tailored per role. A coach that remembers you.'}
              </Text>

              {/* Earned-pride line. Quietly confers status. Not in
                  the user's face, but there when they scroll past. */}
              <View style={{
                marginTop: 16, paddingTop: 14,
                borderTopWidth: 1, borderTopColor: theme.accentBorder,
              }}>
                <Text style={{ fontSize: 12, color: theme.surface.t2, fontStyle: 'italic', lineHeight: 17 }}>
                  {plan === 'pro'
                    ? 'You took it as far as it goes. Very few do.'
                    : 'You took your career seriously. Most people don\'t.'}
                </Text>
              </View>

              {/* Dilly users see a subtle Pro upsell. Pro users get
                  no upsell — they're already at the top. */}
              {plan === 'dilly' && (
                <AnimatedPressable
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    marginTop: 14,
                    paddingVertical: 11,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.accent,
                    backgroundColor: 'transparent',
                  }}
                  onPress={() => Linking.openURL('https://hellodilly.com/pricing')}
                  scaleDown={0.97}
                >
                  <Ionicons name="diamond-outline" size={13} color={theme.accent} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>
                    Go deeper with Dilly Pro
                  </Text>
                </AnimatedPressable>
              )}

              {/* Promo code row */}
              <View style={{ height: 1, backgroundColor: theme.accentBorder, marginVertical: 14 }} />
              {!promoOpen ? (
                <AnimatedPressable
                  style={{ alignItems: 'center', paddingVertical: 6 }}
                  onPress={() => setPromoOpen(true)}
                  scaleDown={0.98}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>
                    Have a promo code?
                  </Text>
                </AnimatedPressable>
              ) : (
                <PromoCodeForm
                  theme={theme}
                  promoCode={promoCode}
                  setPromoCode={setPromoCode}
                  promoSubmitting={promoSubmitting}
                  handleRedeemPromo={handleRedeemPromo}
                  onCancel={() => { setPromoOpen(false); setPromoCode(''); }}
                />
              )}
            </View>
          )}
        </FadeInView>

        {/* ── Career Status ───────────────────────────────────────────
            Direction-aware prompt instead of a mode toggle. Asks the
            user a human question that matches their current mode.
            Students are left alone entirely (they stay students until
            their path/plan flips through billing, not a button here). */}
        {appMode !== 'student' && (
          <FadeInView delay={100}>
            <SectionLabel text="CAREER STATUS" />
            <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              {appMode === 'holder' ? (
                <>
                  <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.t1, marginBottom: 4 }}>
                      Did you get laid off?
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.t3, lineHeight: 17 }}>
                      Switch to Job Search and Dilly reshapes the app for
                      finding your next role. You can switch back any time.
                    </Text>
                  </View>
                  <View style={{ padding: 12, paddingTop: 0 }}>
                    <AnimatedPressable
                      scaleDown={0.97}
                      onPress={() => router.push('/onboarding/mode-switch?to=seeker')}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#FEF3C7',
                        borderColor: '#F59E0B',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>
                        I got laid off. Switch to Job Search.
                      </Text>
                    </AnimatedPressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.t1, marginBottom: 4 }}>
                      Did you land a job?
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.t3, lineHeight: 17 }}>
                      Switch to Career Watch and Dilly shifts into staying
                      ahead of AI, market signals, and what to learn in
                      your new role. You can switch back any time.
                    </Text>
                  </View>
                  <View style={{ padding: 12, paddingTop: 0 }}>
                    <AnimatedPressable
                      scaleDown={0.97}
                      onPress={() => router.push('/onboarding/mode-switch?to=holder')}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#D1FAE5',
                        borderColor: '#16A34A',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#065F46' }}>
                        I got a new job. Switch to Career Watch.
                      </Text>
                    </AnimatedPressable>
                  </View>
                </>
              )}
            </View>
          </FadeInView>
        )}

        {/* Appearance — deep customization lives in its own studio.
            The entry point here is intentionally hero-sized because
            the feature is a brand-new differentiator. */}
        <FadeInView delay={40}>
          <SectionLabel text="APPEARANCE" />
          <AnimatedPressable
            onPress={() => router.push('/(app)/customize' as any)}
            scaleDown={0.98}
            style={[s.customizeHero, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}
          >
            <View style={[s.customizeGlyph, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
              <Ionicons name="color-palette" size={22} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.customizeTitle, { color: theme.surface.t1 }]}>Customize Dilly</Text>
              <Text style={[s.customizeSub, { color: theme.surface.t3 }]}>
                Accent, theme, shape, type, density. Preview live on every screen.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.surface.t3} />
          </AnimatedPressable>
        </FadeInView>

        {/* Notifications */}
        <FadeInView delay={80}>
          <SectionLabel text="NOTIFICATIONS" />
          <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
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

        {/* Web Profile */}
        <FadeInView delay={120}>
          <SectionLabel text="WEB PROFILE" />
          <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
            {(() => {
              const slug = webSlug;
              const profileUrl = `https://hellodilly.com/${webPrefix}/${slug}`;
              return (
                <>
                  <ToggleRow
                    label="Public profile"
                    hint={webProfileOn ? (slug ? `hellodilly.com/${webPrefix}/${slug}` : 'Setting up...') : 'Your profile is hidden'}
                    value={webProfileOn}
                    onToggle={v => {
                      setWebProfileOn(v);
                      savePref('public_profile_visible', v);
                    }}
                  />
                  {webProfileOn && (
                    <>
                      <Divider />
                      <View style={s.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowLabel}>Tagline</Text>
                          <TextInput
                            style={{ fontSize: 13, color: colors.t2, marginTop: 4, padding: 0 }}
                            value={webTagline}
                            onChangeText={setWebTagline}
                            onEndEditing={() => {
                              setTaglineSaving(true);
                              savePref('profile_tagline', webTagline.trim()).then(() => setTaglineSaving(false));
                            }}
                            placeholder="e.g. Data Science Student | Builder"
                            placeholderTextColor={colors.t3}
                            maxLength={80}
                            returnKeyType="done"
                          />
                        </View>
                        {taglineSaving && <Text style={{ fontSize: 10, color: colors.t3 }}>Saving...</Text>}
                      </View>
                      {slug ? (
                        <>
                          <Divider />
                          <Row
                            label="View profile"
                            onPress={() => Linking.openURL(profileUrl)}
                          />
                          <Divider />
                          <Row
                            label="Share link"
                            onPress={() => Share.share({ message: profileUrl })}
                          />
                        </>
                      ) : null}
                    </>
                  )}
                </>
              );
            })()}
          </View>
        </FadeInView>

        {/* About */}
        <FadeInView delay={160}>
          <SectionLabel text="ABOUT" />
          <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
            <Row label="Terms of Service" onPress={() => Alert.alert('Terms of Service', 'By using Dilly, you agree to the following:\n\n1. Dilly is a career guidance platform. It is not a guarantee of employment.\n2. AI-generated content (fit narratives, resumes, interview feedback) may not always be accurate. Verify important information independently.\n3. Your Dilly Profile data is stored securely and used to provide personalized career guidance.\n4. You may delete your account and all data at any time from Settings.\n5. Dilly is not a substitute for professional career counseling.\n6. We reserve the right to modify features and pricing with notice.\n7. Misuse of the platform (fake profiles, spam, harassment) will result in account termination.\n\nQuestions? Email ceo@hellodilly.com')} />
            <Divider />
            <Row label="Privacy Policy" onPress={() => Alert.alert('Privacy Policy', 'Your privacy matters to us.\n\n1. We collect: email, name, profile information you provide, and conversation history with Dilly AI.\n2. We use this data to: build your Dilly Profile, generate fit narratives, tailor resumes, and improve our service.\n3. We do NOT sell your data to third parties.\n4. We use Anthropic (Claude) for AI features. Your conversations are processed by their API but not used to train their models.\n5. We use Resend for email delivery and Railway for hosting.\n6. You can delete all your data at any time from Settings > Delete Account.\n7. We may use anonymized, aggregated data for product improvement.\n8. We use cookies and local storage for authentication only.\n\nQuestions? Email ceo@hellodilly.com')} />
            <Divider />
            <Row label="Contact us" onPress={() => Linking.openURL('mailto:ceo@hellodilly.com')} />
          </View>
          <Text style={[s.versionText, { color: theme.surface.t3 }]}>Dilly v{APP_VERSION}</Text>
        </FadeInView>

        {/* Cancel subscription — ONLY for paid users. Placed above
            Sign out / Delete so a user looking for a way out finds
            the least-destructive option first. Tester feedback:
            cancellation used to be buried inside Delete Account,
            which scared people who just wanted to stop paying. */}
        {(plan === 'dilly' || plan === 'pro') && (
          <FadeInView delay={190}>
            <AnimatedPressable
              style={[s.cancelSubBtn, { borderColor: theme.surface.border }]}
              onPress={handleCancelSubscription}
              scaleDown={0.97}
            >
              <Ionicons name="close-circle-outline" size={14} color={theme.surface.t2} />
              <Text style={[s.cancelSubText, { color: theme.surface.t2 }]}>
                Cancel subscription
              </Text>
            </AnimatedPressable>
          </FadeInView>
        )}

        {/* Sign out */}
        <FadeInView delay={200}>
          <AnimatedPressable style={s.signOutBtn} onPress={handleSignOut} scaleDown={0.97}>
            <Ionicons name="log-out-outline" size={16} color="#FF453A" />
            <Text style={s.signOutText}>Sign out</Text>
          </AnimatedPressable>
        </FadeInView>

        {/* Delete */}
        <FadeInView delay={240}>
          <AnimatedPressable style={s.deleteBtn} onPress={handleDeleteAccount} scaleDown={0.97}>
            <Ionicons name="trash-outline" size={12} color={theme.surface.t3} />
            <Text style={[s.deleteText, { color: theme.surface.t3 }]}>Delete account</Text>
          </AnimatedPressable>
        </FadeInView>

        {/* AI Disclaimer */}
        <View style={{ paddingVertical: 24, paddingHorizontal: 8 }}>
          <Text style={[s.disclaimer, { color: theme.surface.t3 }]}>
            Dilly uses AI to generate career insights, fit assessments, and resume content. AI-generated content may not always be accurate. Always verify important information independently. Dilly is not a substitute for professional career advice.
          </Text>
        </View>
      </ScrollView>

      {/* Cancel goodbye moment. Full-screen modal shown AFTER a
          successful cancel. Replaces the plain Alert with a calm,
          considered treatment that names what the user is pausing
          and offers a 60s uncancel link. Intentionally designed
          NOT to be a retention trap — just a dignified goodbye. */}
      {goodbyeState && (
        <CancelGoodbyeModal
          visible={goodbyeState.visible}
          previousPlan={goodbyeState.previousPlan}
          onUncancel={handleUncancel}
          onDismiss={() => setGoodbyeState(null)}
        />
      )}
    </KeyboardAvoidingView>
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
  customizeHero: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.s1, borderRadius: 14,
    borderWidth: 1, borderColor: colors.b1,
    padding: 14, marginBottom: 16,
  },
  customizeGlyph: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: INDIGO + '12', borderWidth: 1, borderColor: INDIGO + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  customizeTitle: { fontSize: 14, fontWeight: '800', color: colors.t1, letterSpacing: 0.2 },
  customizeSub: { fontSize: 11, color: colors.t3, marginTop: 2, lineHeight: 15 },
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

  cancelSubBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, marginTop: 20, marginHorizontal: 16,
    borderWidth: 1, borderRadius: radius.md,
  },
  cancelSubText: { fontSize: 13, fontWeight: '600' },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, marginTop: 12,
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
