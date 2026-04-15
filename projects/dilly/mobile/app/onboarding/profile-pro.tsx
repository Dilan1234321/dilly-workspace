/**
 * Profile setup - onboarding for general users (not students).
 * Collects: name, career fields (-> cohorts), career target, photo (mandatory).
 * No school, major, minor, graduation year, pre-health/pre-law track.
 */

import { useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import { authHeaders } from '../../lib/auth';
import { CAREER_FIELDS, fieldToCohorts, COHORT_META } from '../../lib/cohorts';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

const TARGET_OPTIONS = [
  { key: 'new_role', label: 'Looking for a new role', apiValue: 'new_role' },
  { key: 'career_pivot', label: 'Making a career pivot', apiValue: 'career_pivot' },
  { key: 'growth', label: 'Growing in my current field', apiValue: 'growth' },
  { key: 'exploring', label: 'Just exploring', apiValue: 'exploring' },
];

export default function ProfileProScreen() {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [targetKey, setTargetKey] = useState('new_role');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Filtered fields for search
  const filteredFields = fieldSearch.trim()
    ? CAREER_FIELDS.filter(f => f.toLowerCase().includes(fieldSearch.toLowerCase()))
    : CAREER_FIELDS;

  function toggleField(field: string) {
    if (selectedFields.includes(field)) {
      setSelectedFields(prev => prev.filter(f => f !== field));
    } else if (selectedFields.length < 3) {
      setSelectedFields(prev => [...prev, field]);
    }
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhoto(result.assets[0].uri);
      // Upload photo
      try {
        const headers = await authHeaders();
        const form = new FormData();
        form.append('file', { uri: result.assets[0].uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
        await fetch(`${API_BASE}/profile/photo`, { method: 'POST', headers, body: form });
      } catch {}
    }
  }

  // Derived
  const detectedCohorts = fieldToCohorts(selectedFields);
  const canContinue = fullName.trim().length >= 2 && selectedFields.length >= 1 && !!photo;

  async function handleContinue() {
    if (!canContinue || loading) return;
    setLoading(true);
    setSubmitError('');
    try {
      const primaryCohort = detectedCohorts[0] || 'General';
      const headers = await authHeaders();

      const res = await fetch(`${API_BASE}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          name: fullName.trim(),
          career_fields: selectedFields,
          cohort: primaryCohort,
          cohorts: detectedCohorts,
          track: primaryCohort,
          application_target: TARGET_OPTIONS.find(o => o.key === targetKey)?.apiValue ?? 'new_role',
          user_type: 'general',
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

      // Persist for scanning screen
      await AsyncStorage.multiSet([
        ['dilly_onboarding_name', fullName.trim()],
        ['dilly_onboarding_cohort', primaryCohort],
        ['dilly_onboarding_track', primaryCohort],
        ['dilly_onboarding_target', TARGET_OPTIONS.find(o => o.key === targetKey)?.apiValue ?? 'new_role'],
      ]);

      // Go to upload (optional)
      router.push({
        pathname: '/onboarding/upload',
        params: { cohort: primaryCohort, name: fullName.trim().split(/\s+/)[0], optional: '1' },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      console.warn('[ProfilePro] Error:', msg);
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={16} color={colors.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <FadeInView delay={0}>
          <Text style={s.title}>Tell Dilly about yourself</Text>
          <Text style={s.subtitle}>This helps Dilly understand your career and match you with the right opportunities.</Text>
        </FadeInView>

        {/* Photo (mandatory) */}
        <FadeInView delay={60}>
          <TouchableOpacity style={s.photoWrap} onPress={pickPhoto}>
            {photo ? (
              <Image source={{ uri: photo }} style={s.photo} />
            ) : (
              <View style={s.photoPlaceholder}>
                <Ionicons name="camera" size={24} color={colors.t3} />
                <Text style={s.photoText}>Add photo</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={s.photoHint}>Use a professional photo, like one you'd put on LinkedIn.</Text>
        </FadeInView>

        {/* Name */}
        <FadeInView delay={100}>
          <View style={s.field}>
            <Text style={s.label}>Full Name</Text>
            <TextInput
              style={s.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your full name"
              placeholderTextColor={colors.t3}
              autoCapitalize="words"
            />
          </View>
        </FadeInView>

        {/* Career Fields */}
        <FadeInView delay={140}>
          <View style={s.field}>
            <Text style={s.label}>What field are you in? <Text style={{ color: colors.coral }}>*</Text></Text>
            <Text style={{ fontSize: 12, color: colors.t3, marginBottom: 8 }}>Select up to 3. This determines how Dilly matches you.</Text>

            <TextInput
              style={[s.input, { marginBottom: 8 }]}
              value={fieldSearch}
              onChangeText={setFieldSearch}
              placeholder="Search fields..."
              placeholderTextColor={colors.t3}
            />

            <View style={s.fieldGrid}>
              {filteredFields.map(field => {
                const selected = selectedFields.includes(field);
                return (
                  <AnimatedPressable
                    key={field}
                    style={[s.fieldChip, selected && s.fieldChipSelected]}
                    onPress={() => toggleField(field)}
                    scaleDown={0.96}
                  >
                    <Text style={[s.fieldChipText, selected && s.fieldChipTextSelected]} numberOfLines={1}>{field}</Text>
                    {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>
        </FadeInView>

        {/* Detected cohorts */}
        {detectedCohorts.length > 0 && (
          <FadeInView delay={180}>
            <View style={s.cohortReveal}>
              <View style={s.cohortDot} />
              <View style={{ flex: 1 }}>
                <Text style={s.cohortTitle}>
                  {detectedCohorts.length === 1
                    ? `${detectedCohorts[0]} detected.`
                    : `${detectedCohorts.length} cohorts detected.`}
                </Text>
                {detectedCohorts.map(name => {
                  const meta = COHORT_META[name];
                  return (
                    <View key={name} style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.t1 }}>{name}</Text>
                      {meta && <Text style={{ fontSize: 11, color: colors.t3 }}>{meta.description}</Text>}
                    </View>
                  );
                })}
              </View>
            </View>
          </FadeInView>
        )}

        {/* Career Target */}
        <FadeInView delay={220}>
          <View style={s.field}>
            <Text style={s.label}>What are you looking for?</Text>
            <View style={s.targetGrid}>
              {TARGET_OPTIONS.map(opt => (
                <AnimatedPressable
                  key={opt.key}
                  style={[s.targetChip, targetKey === opt.key && s.targetChipSelected]}
                  onPress={() => setTargetKey(opt.key)}
                  scaleDown={0.96}
                >
                  <Text style={[s.targetChipText, targetKey === opt.key && s.targetChipTextSelected]}>{opt.label}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>
        </FadeInView>

        {/* Error */}
        {submitError ? <Text style={s.error}>{submitError}</Text> : null}

        {/* Continue */}
        <FadeInView delay={260}>
          <TouchableOpacity
            style={[s.continueBtn, canContinue ? s.continueBtnActive : s.continueBtnDisabled]}
            onPress={handleContinue}
            disabled={!canContinue || loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.continueBtnText}>Continue</Text>
            )}
          </TouchableOpacity>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, gap: 16 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 8 },
  backText: { fontSize: 15, color: colors.blue, fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '800', color: colors.t1, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: colors.t2, lineHeight: 20, marginTop: 4 },

  photoWrap: { alignSelf: 'center' },
  photo: { width: 80, height: 80, borderRadius: 40 },
  photoPlaceholder: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.s2,
    borderWidth: 1, borderColor: colors.b1, alignItems: 'center', justifyContent: 'center',
  },
  photoText: { fontSize: 10, color: colors.t3, marginTop: 4 },
  photoHint: { fontSize: 11, color: colors.t3, textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },

  field: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.t1, marginBottom: 2 },
  input: {
    backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.t1,
  },

  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fieldChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  fieldChipSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  fieldChipText: { fontSize: 12, fontWeight: '500', color: colors.t2 },
  fieldChipTextSelected: { color: '#fff', fontWeight: '600' },

  cohortReveal: {
    flexDirection: 'row', gap: 10, backgroundColor: colors.golddim,
    borderRadius: 10, borderWidth: 1, borderColor: colors.goldbdr, padding: 12,
  },
  cohortDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, marginTop: 4 },
  cohortTitle: { fontSize: 13, fontWeight: '700', color: colors.t1 },

  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  targetChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.b1,
  },
  targetChipSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  targetChipText: { fontSize: 13, fontWeight: '500', color: colors.t2 },
  targetChipTextSelected: { color: '#fff', fontWeight: '600' },

  error: { fontSize: 12, color: '#FF453A', textAlign: 'center' },
  continueBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  continueBtnActive: { backgroundColor: colors.gold },
  continueBtnDisabled: { backgroundColor: colors.s3 },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
