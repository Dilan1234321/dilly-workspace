/**
 * Profile setup. onboarding for jobholders (user_path === 'i_have_a_job').
 *
 * Three modes, three onboardings. This is the shortest of the three
 * because holders don't need a resume, cities, or target companies to
 * get real value. They need:
 *   1. Name
 *   2. Their current role (drives threat report + weekly signal)
 *   3. Roughly how long (drives peer framing)
 *   4. What's most on their mind (drives the first chat prompt)
 *
 * Total: ~45 seconds. Then we route to results → tutorial → app.
 *
 * Everything else about them. wins, decisions, specific skills,
 * concerns. gets extracted from chat over time via memory_extraction
 * on the server.
 */

import { useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Animated, Easing, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import { authHeaders } from '../../lib/auth';
import AnimatedPressable from '../../components/AnimatedPressable';
import { useResolvedTheme } from '../../hooks/useTheme';
import { validateRole, validateCompany } from '../../lib/roleCompanyValidator';

const INDIGO = colors.indigo;
const TOTAL_STEPS = 5;

type Step = 0 | 1 | 2 | 3 | 4;

// Quick-pick role suggestions. The user can type anything; these just
// seed the field with common roles the threat-report classifier
// already has content for. Kept universal. no specific industries.
const ROLE_SUGGESTIONS = [
  'Software Engineer',
  'Marketing Manager',
  'Accountant',
  'Project Manager',
  'Teacher',
  'Nurse',
  'Sales Rep',
  'Operations',
  'HR Generalist',
  'Lawyer',
];

const EXPERIENCE_OPTIONS: { key: string; label: string }[] = [
  { key: '0-2',  label: 'Less than 2 years' },
  { key: '2-7',  label: '2 to 7 years' },
  { key: '7+',   label: '7+ years' },
];

const CONCERN_OPTIONS: { key: string; label: string }[] = [
  { key: 'ai_replace',     label: 'Will AI replace what I do' },
  { key: 'falling_behind', label: 'Am I falling behind my peers' },
  { key: 'learn_next',     label: 'What should I be learning next' },
  { key: 'consider_move',  label: 'When should I consider moving' },
  { key: 'company_change', label: 'My company is changing fast' },
  { key: 'just_curious',   label: 'Just curious how Dilly can help' },
];

export default function ProfileHolderScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [step, setStep] = useState<Step>(0);

  const [photo, setPhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [experience, setExperience] = useState<string>('');
  // Exact-years override: when the user types a precise number it
  // takes priority over the bucket pick so the comp benchmark +
  // seniority curve downstream can read the real value instead of
  // a rounded bucket.
  const [exactYears, setExactYears] = useState<string>('');
  // Company name. captured in the same step as the role so we don't
  // renumber everything. Required because Market Radar + My Career
  // benchmarks lean on this for holder-shaped framing.
  const [company, setCompany] = useState<string>('');
  const [concerns, setConcerns] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function pickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr("We need photo library access to upload your picture.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const uri = result.assets[0].uri;
      setPhoto(uri);
      setPhotoUploading(true);
      try {
        const headers = await authHeaders();
        const form = new FormData();
        form.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
        await fetch(`${API_BASE}/profile/photo`, { method: 'POST', headers, body: form });
      } catch (e) {
        setErr("Couldn't upload the photo. tap to try again.");
      } finally {
        setPhotoUploading(false);
      }
    } catch (e: any) {
      setErr(e?.message || "Couldn't open the photo picker.");
    }
  }

  // Progress bar. fills as user advances. Same visual as the tutorial.
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;
  function animateProgress(toStep: Step) {
    Animated.timing(progressAnim, {
      toValue: (toStep + 1) / TOTAL_STEPS,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  function canAdvance(): boolean {
    // New step order: 0 photo, 1 name, 2 role, 3 experience, 4 concerns.
    if (step === 0) return !!photo && !photoUploading;
    if (step === 1) return name.trim().length >= 2;
    if (step === 2) return role.trim().length >= 2 && company.trim().length >= 1;
    if (step === 3) return !!(experience || exactYears.trim());
    if (step === 4) return concerns.length >= 1;
    return false;
  }

  function advance() {
    if (!canAdvance() || saving) return;
    // Step 2 is role + company. Run the client-side gibberish guard
    // before letting the user past this step. Zero server cost, no
    // LLM call - just heuristics. Stops the obvious 'asdfghjkl' and
    // ')*#&%' inputs from ever reaching the backend.
    if (step === 2) {
      const roleCheck = validateRole(role);
      if (!roleCheck.ok) { setErr(roleCheck.reason); return; }
      const companyCheck = validateCompany(company);
      if (!companyCheck.ok) { setErr(companyCheck.reason); return; }
      setErr('');
    }
    if (step < 4) {
      const next = (step + 1) as Step;
      setStep(next);
      animateProgress(next);
    } else {
      handleFinish();
    }
  }

  function back() {
    if (step === 0) {
      router.back();
      return;
    }
    const prev = (step - 1) as Step;
    setStep(prev);
    animateProgress(prev);
  }

  function toggleConcern(key: string) {
    setConcerns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  async function handleFinish() {
    setSaving(true);
    setErr('');
    try {
      const headers = await authHeaders();

      // Concerns saved as a human-readable array for the next chat
      // turn to reference. No weird key gymnastics on the backend.
      const concernLabels = CONCERN_OPTIONS
        .filter(c => concerns.includes(c.key))
        .map(c => c.label);

      const res = await fetch(`${API_BASE}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          name: name.trim(),
          current_role: role.trim(),
          current_company: company.trim(),
          // Prefer the exact number if the user typed one; otherwise
          // fall back to the bucket label. Comp benchmark (BLS curve)
          // reads this downstream and wants a precise number when we
          // have it.
          years_experience: exactYears.trim() ? exactYears.trim() : experience,
          goals: concernLabels,
          user_type: 'general',
          user_path: 'i_have_a_job',
          app_mode: 'holder',
          onboarding_complete: false,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        const detail = d?.detail;
        const msg = typeof detail === 'string' ? detail
          : typeof detail === 'object' && detail?.message ? detail.message
          : `Server error ${res.status}`;
        throw new Error(msg);
      }

      await AsyncStorage.multiSet([
        ['dilly_onboarding_name', name.trim()],
        ['dilly_onboarding_target', 'growth'],
      ]);

      // Offer the resume upload as optional. it only helps Dilly's
      // AI learn about them faster. The upload screen has a "Skip for
      // now" CTA so holders can still get to the app in seconds.
      router.replace({
        pathname: '/onboarding/upload',
        params: { name: name.trim().split(/\s+/)[0], optional: '1' },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[s.container, { paddingTop: insets.top }]}>
        {/* Top row: back + full-width progress bar */}
        <View style={s.topRow}>
          <TouchableOpacity onPress={back} hitSlop={14} style={{ paddingRight: 12 }}>
            <Ionicons name="chevron-back" size={22} color={colors.t2} />
          </TouchableOpacity>
          <View style={s.progressTrack}>
            <Animated.View
              style={[
                s.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && (
            <View style={{ gap: 12 }}>
              <Text style={s.eyebrow}>FIRST, YOUR FACE</Text>
              <Text style={[s.title, { color: theme.surface.t1 }]}>Add a professional photo.</Text>
              <Text style={[s.sub, { color: theme.surface.t2 }]}>
                Use something you'd put on LinkedIn. clear headshot,
                good lighting, looking at the camera. Shows up on your
                Dilly card and profile page.
              </Text>
              <TouchableOpacity
                onPress={pickPhoto}
                activeOpacity={0.85}
                style={{
                  alignSelf: 'center',
                  width: 160, height: 160, borderRadius: 80,
                  backgroundColor: colors.s1,
                  borderWidth: 2, borderColor: photo ? INDIGO : colors.b1,
                  borderStyle: photo ? 'solid' : 'dashed',
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: 12,
                  overflow: 'hidden',
                }}
              >
                {photo ? (
                  <Image source={{ uri: photo }} style={{ width: 156, height: 156, borderRadius: 78 }} />
                ) : (
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <Ionicons name="camera" size={34} color={colors.t3} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.t3 }}>
                      Tap to add
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              {photoUploading && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                  <ActivityIndicator size="small" color={INDIGO} />
                  <Text style={{ fontSize: 13, color: colors.t3 }}>Uploading...</Text>
                </View>
              )}
            </View>
          )}

          {step === 1 && (
            <View style={{ gap: 12 }}>
              <Text style={s.eyebrow}>YOUR NAME</Text>
              <Text style={[s.title, { color: theme.surface.t1 }]}>What should Dilly call you?</Text>
              <Text style={[s.sub, { color: theme.surface.t2 }]}>Full name please. This is just for Dilly.</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                placeholderTextColor={colors.t3}
                autoCapitalize="words"
                autoFocus
                returnKeyType="next"
                onSubmitEditing={advance}
              />
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 12 }}>
              <Text style={s.eyebrow}>YOUR ROLE</Text>
              <Text style={[s.title, { color: theme.surface.t1 }]}>What do you do right now?</Text>
              <Text style={[s.sub, { color: theme.surface.t2 }]}>
                The title works. If you do something that doesn't fit a
                standard title, just describe it.
              </Text>
              <TextInput
                style={s.input}
                value={role}
                onChangeText={setRole}
                placeholder="e.g. Marketing Manager"
                placeholderTextColor={colors.t3}
                autoCapitalize="words"
                autoFocus
                returnKeyType="next"
              />
              {/* Quick-pick suggestions. tap to fill the input. */}
              <View style={s.suggestionRow}>
                {ROLE_SUGGESTIONS.map(r => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setRole(r)}
                    style={[
                      s.suggestionChip,
                      role === r && { backgroundColor: INDIGO, borderColor: INDIGO },
                    ]}
                  >
                    <Text style={[
                      s.suggestionText,
                      role === r && { color: '#fff' },
                    ]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Company. captured alongside role so the Market
                  Radar comp benchmark, Career Center trajectory,
                  and chat prompt ("at {company}") all have it from
                  the jump. */}
              <View style={{ marginTop: 14, gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.t3 }}>
                  COMPANY
                </Text>
                <TextInput
                  style={s.input}
                  value={company}
                  onChangeText={setCompany}
                  placeholder="Where do you work?"
                  placeholderTextColor={colors.t3}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={advance}
                />
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={{ gap: 12 }}>
              <Text style={s.eyebrow}>EXPERIENCE</Text>
              <Text style={[s.title, { color: theme.surface.t1 }]}>How long have you been doing this?</Text>
              <Text style={[s.sub, { color: theme.surface.t2 }]}>
                Type the exact number of years so Dilly can benchmark
                your comp precisely. A rough bucket works too.
              </Text>

              {/* Exact-years input. takes priority over the buckets
                  below. Keyboard is numeric so users don't fight
                  autocorrect; maxLength guards against gag inputs. */}
              <View style={{ marginTop: 6 }}>
                <TextInput
                  value={exactYears}
                  onChangeText={(v) => {
                    // Allow digits + one dot ("3.5"), strip the rest.
                    const cleaned = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                    setExactYears(cleaned);
                    // Typing exact years clears the bucket pick so
                    // the CTA validation doesn't require both.
                    if (cleaned) setExperience('');
                  }}
                  placeholder="e.g. 5 or 3.5"
                  placeholderTextColor={theme.surface.t3}
                  keyboardType="decimal-pad"
                  maxLength={4}
                  style={{
                    borderWidth: 1, borderColor: theme.surface.border,
                    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
                    fontSize: 17, fontWeight: '700', color: theme.surface.t1,
                    backgroundColor: theme.surface.s2,
                  }}
                />
                <Text style={{ fontSize: 11, color: theme.surface.t3, marginTop: 6, marginLeft: 4 }}>
                  Years (use decimals for fractions, e.g. 3.5)
                </Text>
              </View>

              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: theme.surface.t3, marginTop: 14, marginBottom: 2 }}>
                OR PICK A RANGE
              </Text>
              <View style={{ gap: 10, marginTop: 4 }}>
                {EXPERIENCE_OPTIONS.map(opt => {
                  const active = experience === opt.key;
                  return (
                    <AnimatedPressable
                      key={opt.key}
                      onPress={() => {
                        setExperience(opt.key);
                        // Picking a bucket clears any typed exact
                        // value so the two fields don't conflict.
                        setExactYears('');
                      }}
                      scaleDown={0.98}
                      style={[s.optionCard, active && s.optionCardActive]}
                    >
                      <Text style={[s.optionText, active && s.optionTextActive]}>
                        {opt.label}
                      </Text>
                      {active && <Ionicons name="checkmark-circle" size={22} color="#fff" />}
                    </AnimatedPressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 4 && (
            <View style={{ gap: 12 }}>
              <Text style={s.eyebrow}>WHAT'S ON YOUR MIND</Text>
              <Text style={[s.title, { color: theme.surface.t1 }]}>What brought you here?</Text>
              <Text style={[s.sub, { color: theme.surface.t2 }]}>
                Pick any that feel true. Dilly uses this to frame your
                first read on your field. You can change it later.
              </Text>
              <View style={{ gap: 8, marginTop: 6 }}>
                {CONCERN_OPTIONS.map(opt => {
                  const active = concerns.includes(opt.key);
                  return (
                    <AnimatedPressable
                      key={opt.key}
                      onPress={() => toggleConcern(opt.key)}
                      scaleDown={0.98}
                      style={[s.concernCard, active && s.concernCardActive]}
                    >
                      <View style={[s.checkBox, active && s.checkBoxActive]}>
                        {active && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                      <Text style={[s.concernText, active && { fontWeight: '700' }]}>
                        {opt.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
            </View>
          )}

          {err ? <Text style={s.errText}>{err}</Text> : null}
        </ScrollView>

        {/* Sticky CTA */}
        <View style={[s.ctaWrap, { paddingBottom: insets.bottom + 14 }]}>
          <AnimatedPressable
            scaleDown={0.97}
            disabled={!canAdvance() || saving}
            onPress={advance}
            style={[
              s.cta,
              (!canAdvance() || saving) && s.ctaDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={s.ctaText}>{step === 4 ? 'Finish setup' : 'Continue'}</Text>
                <Ionicons name="arrow-forward" size={17} color="#fff" />
              </>
            )}
          </AnimatedPressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 12,
  },
  progressTrack: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: colors.b1, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: INDIGO, borderRadius: 2 },

  scroll: {
    paddingHorizontal: spacing.xl, paddingTop: 24, paddingBottom: 24,
  },
  eyebrow: {
    fontSize: 11, fontWeight: '900', color: INDIGO, letterSpacing: 1.6,
  },
  title: {
    fontSize: 26, fontWeight: '900', color: colors.t1, letterSpacing: -0.6, lineHeight: 32,
  },
  sub: {
    fontSize: 14, color: colors.t2, lineHeight: 20,
  },

  input: {
    backgroundColor: colors.s1,
    borderWidth: 1, borderColor: colors.b1, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, color: colors.t1,
    marginTop: 8,
  },

  suggestionRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6,
  },
  suggestionChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.s1,
    borderWidth: 1, borderColor: colors.b1,
  },
  suggestionText: {
    fontSize: 13, color: colors.t2, fontWeight: '600',
  },

  optionCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.s1,
    borderWidth: 1.5, borderColor: colors.b1,
  },
  optionCardActive: {
    backgroundColor: INDIGO,
    borderColor: INDIGO,
  },
  optionText: {
    fontSize: 15, fontWeight: '700', color: colors.t1,
  },
  optionTextActive: {
    color: '#fff',
  },

  concernCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.s1,
    borderWidth: 1, borderColor: colors.b1,
  },
  concernCardActive: {
    backgroundColor: INDIGO + '12',
    borderColor: INDIGO,
  },
  checkBox: {
    width: 20, height: 20, borderRadius: 5,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: colors.b1,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBoxActive: {
    backgroundColor: INDIGO, borderColor: INDIGO,
  },
  concernText: {
    fontSize: 14, color: colors.t1, flex: 1, fontWeight: '500',
  },

  ctaWrap: {
    paddingHorizontal: spacing.xl, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.b1,
    backgroundColor: colors.bg,
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: INDIGO,
    paddingVertical: 15, borderRadius: radius.lg,
  },
  ctaDisabled: {
    backgroundColor: colors.t3, opacity: 0.45,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  errText: { fontSize: 13, color: '#DC2626', marginTop: 12, textAlign: 'center' },
});
