import { useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import { authHeaders } from '../../lib/auth';
import { APPROVED_MAJORS } from '../../constants/majors';

// ── Data ──────────────────────────────────────────────────────────────────────

const PRE_PROF_OPTIONS = [
  'Pre-Med', 'Pre-Dental', 'Pre-Pharmacy', 'Pre-Veterinary',
  'Pre-Physical Therapy', 'Pre-Occupational Therapy', 'Pre-Physician Assistant',
  'Pre-Law', 'None / Not applicable',
];

// key is used for UI selection state; apiValue is sent to the API.
// Year labels are dynamic so they don't go stale  -  previously hardcoded
// "Summer 2026" / "Fall 2026" would become incorrect on Jan 1, 2027.
const _CURRENT_YEAR = new Date().getFullYear();
const TARGET_OPTIONS = [
  { key: 'internship_summer', label: `Internship · Summer ${_CURRENT_YEAR}`, apiValue: 'internship' },
  { key: 'internship_fall',   label: `Internship · Fall ${_CURRENT_YEAR}`,   apiValue: 'internship' },
  { key: 'full_time',         label: 'Full-time job',                         apiValue: 'full_time'  },
  { key: 'exploring',         label: 'Just exploring',                        apiValue: 'exploring'  },
];

// Dynamic graduation year range: current year through current year + 5.
// Computed at module load so it rolls forward automatically each year  - 
// never needs manual updating. Coach and leaderboard both read graduation_year,
// so this must be set for every student before they finish onboarding.
const GRADUATION_OPTIONS: number[] = (() => {
  const current = new Date().getFullYear();
  return [current, current + 1, current + 2, current + 3, current + 4, current + 5];
})();

const MAJOR_TO_COHORT: Record<string, string> = {
  'Computer Science': 'Tech', 'Computer Information Systems': 'Tech',
  'Software Engineering': 'Tech', 'Cybersecurity': 'Tech',
  'Information Technology': 'Tech', 'Data Science': 'Tech',
  'Finance': 'Business', 'Accounting': 'Business', 'Economics': 'Business',
  'Business Administration': 'Business', 'International Business': 'Business',
  'Management': 'Business', 'Marketing': 'Business',
  'Advertising and Public Relations': 'Business',
  'Biology': 'Science', 'Chemistry': 'Science', 'Biochemistry': 'Science',
  'Physics': 'Science', 'Environmental Science': 'Science',
  'Marine Science': 'Science', 'Forensic Science': 'Science',
  'Mathematics': 'Quantitative', 'Statistics': 'Quantitative',
  'Nursing': 'Health', 'Health Sciences': 'Health', 'Exercise Science': 'Health',
  'Kinesiology': 'Health', 'Allied Health': 'Health', 'Public Health': 'Health',
  'Psychology': 'Social Science', 'Sociology': 'Social Science',
  'Political Science': 'Social Science', 'Criminal Justice': 'Social Science',
  'Government and World Affairs': 'Social Science', 'Social Work': 'Social Science',
  'History': 'Social Science', 'Philosophy': 'Social Science',
  'English': 'Humanities', 'Journalism': 'Humanities', 'Communication': 'Humanities',
  'Liberal Arts': 'Humanities', 'Education': 'Humanities',
  'Theatre Arts': 'Humanities', 'Music': 'Humanities',
  'Digital Arts and Design': 'Humanities',
  'Sport Management': 'Sport',
};

const PRE_PROF_TO_COHORT: Record<string, string> = {
  'Pre-Med': 'Pre-Health', 'Pre-Dental': 'Pre-Health', 'Pre-Pharmacy': 'Pre-Health',
  'Pre-Veterinary': 'Pre-Health', 'Pre-Physical Therapy': 'Pre-Health',
  'Pre-Occupational Therapy': 'Pre-Health', 'Pre-Physician Assistant': 'Pre-Health',
  'Pre-Law': 'Pre-Law',
};

const COHORT_COPY: Record<string, { label: string; description: string; emphasis: string }> = {
  Tech:          { label: 'Tech cohort',                     description: 'Dilly scores you against Google, Meta, and Amazon criteria.',               emphasis: 'Your Build score carries the most weight.' },
  Business:      { label: 'Business cohort',                 description: 'Dilly scores you against Goldman Sachs, Deloitte, and JP Morgan criteria.', emphasis: 'Your Grit score carries the most weight.' },
  Science:       { label: 'Science cohort',                  description: 'Dilly scores you against NIH, top biotech, and research lab criteria.',     emphasis: 'Your Smart score carries the most weight.' },
  Quantitative:  { label: 'Quantitative cohort',             description: 'Dilly scores you against top quant and analytical employer criteria.',      emphasis: "You'll choose your target industry next." },
  Health:        { label: 'Health & Movement cohort',        description: 'Dilly scores you against top hospital and healthcare employer criteria.',   emphasis: 'Your Grit score carries the most weight.' },
  'Social Science': { label: 'Social Science cohort',        description: 'Dilly scores you against top consulting, government, and nonprofit criteria.', emphasis: 'Your Grit score carries the most weight.' },
  Humanities:    { label: 'Humanities & Communication cohort', description: 'Dilly scores you against top media, publishing, and education criteria.', emphasis: 'Your Build portfolio carries the most weight.' },
  Sport:         { label: 'Sport & Recreation cohort',       description: 'Dilly scores you against ESPN, top sports agencies, and league criteria.',  emphasis: 'Your Grit score carries the most weight.' },
  'Pre-Health':  { label: 'Pre-Health track',                description: 'Dilly scores you against Mayo Clinic, top med school, and clinical criteria.', emphasis: 'Your Smart score carries the most weight.' },
  'Pre-Law':     { label: 'Pre-Law track',                   description: 'Dilly scores you against Skadden, top law school, and legal employer criteria.', emphasis: 'Your Smart score carries the most weight.' },
  General:       { label: 'General cohort',                  description: 'Dilly scores you against top employer criteria across industries.',          emphasis: 'All three dimensions are equally weighted.' },
};

function detectCohort(majors: string[], preProf: string | null): string {
  if (preProf && preProf !== 'None / Not applicable') {
    const override = PRE_PROF_TO_COHORT[preProf];
    if (override) return override;
  }
  for (const m of majors) {
    const c = MAJOR_TO_COHORT[m];
    if (c) return c;
  }
  return 'General';
}

function needsIndustryTarget(cohort: string, majors: string[]): boolean {
  if (cohort === 'Quantitative') return true;
  if (majors.includes('Data Science') && cohort === 'Tech') return true;
  return false;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={pb.row}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View key={i} style={[pb.seg, i < step - 1 ? pb.done : i === step - 1 ? pb.active : pb.empty]} />
      ))}
    </View>
  );
}
const pb = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, paddingHorizontal: spacing.xl, marginTop: 14 },
  seg:   { flex: 1, height: 2.5, borderRadius: 999 },
  done:  { backgroundColor: colors.gold },
  active:{ backgroundColor: 'rgba(201,168,76,0.4)' },
  empty: { backgroundColor: 'rgba(255,255,255,0.08)' },
});

function FieldLabel({ children }: { children: string }) {
  return <Text style={s.label}>{children}</Text>;
}

/** Inline major/minor autocomplete */
function TagPicker({
  tags, maxTags, placeholder, onAdd, onRemove,
}: {
  tags: string[]; maxTags: number; placeholder: string;
  onAdd: (v: string) => void; onRemove: (v: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [inputError, setInputError] = useState('');
  const inputRef = useRef<TextInput>(null);
  const atMax = tags.length >= maxTags;

  const suggestions = query.length >= 1
    ? APPROVED_MAJORS.filter(
        (m) => m.toLowerCase().includes(query.toLowerCase()) && !tags.includes(m)
      ).slice(0, 4)
    : [];

  function pick(m: string) {
    onAdd(m);
    setQuery('');
    setInputError('');
    inputRef.current?.focus();
  }

  function handleSubmitEditing() {
    if (!query.trim()) return;
    const exact = APPROVED_MAJORS.find(
      (m) => m.toLowerCase() === query.trim().toLowerCase()
    );
    if (exact && !tags.includes(exact)) {
      pick(exact);
    } else {
      setInputError('Select a major from the list');
    }
  }

  return (
    <View>
      {/* Selected tags */}
      {tags.length > 0 && (
        <View style={s.tagsRow}>
          {tags.map((t) => (
            <TouchableOpacity key={t} style={s.tag} onPress={() => onRemove(t)} activeOpacity={0.7}>
              <Text style={s.tagText}>{t}</Text>
              <Text style={s.tagX}>×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {/* Input or max-reached message */}
      {atMax ? (
        <Text style={s.maxReached}>Max {maxTags} {maxTags === 3 ? 'majors' : 'minors'} reached</Text>
      ) : (
        <TextInput
          ref={inputRef}
          style={s.input}
          value={query}
          onChangeText={(v) => { setQuery(v); setInputError(''); }}
          onSubmitEditing={handleSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={colors.t3}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          blurOnSubmit={false}
        />
      )}
      {/* Inline error */}
      {inputError ? <Text style={s.tagError}>{inputError}</Text> : null}
      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <View style={s.dropdown}>
          {suggestions.map((m, i) => (
            <TouchableOpacity
              key={m}
              style={[s.dropdownItem, i < suggestions.length - 1 && s.dropdownDivider]}
              onPress={() => pick(m)}
              activeOpacity={0.7}
            >
              <Text style={s.dropdownText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  const [fullName,       setFullName]       = useState('');
  const [majors,         setMajors]         = useState<string[]>([]);
  const [minors,         setMinors]         = useState<string[]>([]);
  const [preProf,        setPreProf]        = useState<string | null>(null);
  const [targetKey,      setTargetKey]      = useState('internship_summer');
  const [graduationYear, setGraduationYear] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [photoUri,    setPhotoUri]    = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    setPhotoLoading(true);
    try {
      const headers = await authHeaders();
      const form = new FormData();
      form.append('file', { uri: asset.uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
      await fetch(`${API_BASE}/profile/photo`, { method: 'POST', headers, body: form });
    } catch { /* non-fatal */ } finally {
      setPhotoLoading(false);
    }
  }

  const firstName      = fullName.trim().split(/\s+/)[0] ?? '';
  const showMicroWin   = fullName.trim().length >= 2;
  const cohort         = majors.length > 0 || (preProf && preProf !== 'None / Not applicable')
    ? detectCohort(majors, preProf)
    : '';
  const cohortCopy     = cohort ? COHORT_COPY[cohort] : null;
  const canContinue    = fullName.trim().length >= 2 && majors.length >= 1 && graduationYear != null;

  async function handleContinue() {
    if (!canContinue || loading) return;
    setLoading(true);
    setSubmitError('');
    try {
      const resolvedCohort = cohort || 'General';
      const preProfToSend  = preProf === 'None / Not applicable' ? null : preProf;
      const headers        = await authHeaders();

      const res = await fetch(`${API_BASE}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          name: fullName.trim(),
          major: majors[0] || '',
          majors,
          minors,
          pre_professional_track: preProfToSend,
          application_target: TARGET_OPTIONS.find(o => o.key === targetKey)?.apiValue ?? 'internship',
          track: resolvedCohort,
          cohort: resolvedCohort,
          graduation_year: graduationYear,
          onboarding_complete: false,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        const detail = d?.detail;
        const msg = typeof detail === 'string' ? detail : detail?.message || 'Something went wrong.';
        throw new Error(msg);
      }

      // Persist onboarding data for scanning/results screens
      await AsyncStorage.multiSet([
        ['dilly_onboarding_name',    fullName.trim()],
        ['dilly_onboarding_cohort',  resolvedCohort],
        ['dilly_onboarding_track',   resolvedCohort],
        ['dilly_onboarding_majors',  JSON.stringify(majors)],
        ['dilly_onboarding_pre_prof', preProfToSend ?? ''],
        ['dilly_onboarding_target',  TARGET_OPTIONS.find(o => o.key === targetKey)?.apiValue ?? 'internship'],
        ['dilly_onboarding_graduation_year', String(graduationYear ?? '')],
      ]);

      router.push({
        pathname: '/onboarding/interests',
        params: { cohort: resolvedCohort, majors: JSON.stringify(majors), name: firstName },
      });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={{ paddingTop: insets.top }}>
        {/* Back + progress */}
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={16} color={colors.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <ProgressBar step={2} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>Step 1 of 2 · Your profile</Text>
          <Text style={s.heading}>Tell me about{'\n'}yourself.</Text>
          <Text style={s.sub}>
            Dilly scores you against the right cohort and peers  -  he needs this to do it right.
          </Text>
        </View>

        {/* Photo */}
        <View style={s.photoSection}>
          <TouchableOpacity style={s.photoCircle} onPress={handlePickPhoto} activeOpacity={0.8}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={s.photoImage} />
            ) : (
              <Ionicons name="camera-outline" size={22} color={colors.t3} />
            )}
            {photoLoading && (
              <View style={s.photoOverlay}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={s.photoHint}>Add a photo (optional)</Text>
        </View>

        {/* Full name */}
        <View style={s.field}>
          <FieldLabel>Full name</FieldLabel>
          <TextInput
            style={s.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. Dilan Kochhar"
            placeholderTextColor={colors.t3}
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect={false}
          />
          {showMicroWin && (
            <View style={s.microWin}>
              <View style={s.microWinDot}>
                <Ionicons name="checkmark" size={9} color="#fff" />
              </View>
              <Text style={s.microWinText}>
                Perfect, {firstName}. You're in the right place.
              </Text>
            </View>
          )}
        </View>

        {/* Major(s) */}
        <View style={s.field}>
          <FieldLabel>
            {`Your major${majors.length > 0 ? ` (${majors.length}/3)` : ''}`}
          </FieldLabel>
          <TagPicker
            tags={majors}
            maxTags={3}
            placeholder="e.g. Data Science"
            onAdd={(v) => { if (!majors.includes(v) && majors.length < 3) setMajors((p) => [...p, v]); }}
            onRemove={(v) => setMajors((p) => p.filter((m) => m !== v))}
          />
          {/* Cohort reveal card */}
          {cohortCopy && (
            <View style={s.cohortCard}>
              <View style={s.cohortDot} />
              <View style={{ flex: 1 }}>
                <Text style={s.cohortTitle}>{cohortCopy.label} detected.</Text>
                <Text style={s.cohortBody}>
                  {cohortCopy.description}{' '}
                  <Text style={{ fontWeight: '700' }}>{cohortCopy.emphasis}</Text>
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Pre-professional track */}
        <View style={s.field}>
          <FieldLabel>Pre-professional track (optional)</FieldLabel>
          <View style={s.pillsWrap}>
            {PRE_PROF_OPTIONS.map((opt) => {
              const selected = preProf === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[s.pill, selected ? s.pillActive : s.pillDefault]}
                  onPress={() => setPreProf(selected ? null : opt)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pillText, selected ? s.pillTextActive : s.pillTextDefault]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Minor(s) */}
        <View style={s.field}>
          <FieldLabel>
            {`Minor (optional)${minors.length > 0 ? ` (${minors.length}/2)` : ''}`}
          </FieldLabel>
          <TagPicker
            tags={minors}
            maxTags={2}
            placeholder="e.g. Mathematics"
            onAdd={(v) => { if (!minors.includes(v) && minors.length < 2) setMinors((p) => [...p, v]); }}
            onRemove={(v) => setMinors((p) => p.filter((m) => m !== v))}
          />
        </View>

        {/* Graduation year */}
        <View style={s.field}>
          <FieldLabel>When do you graduate?</FieldLabel>
          <View style={s.pillsWrap}>
            {GRADUATION_OPTIONS.map((year) => {
              const selected = graduationYear === year;
              return (
                <TouchableOpacity
                  key={year}
                  style={[s.pill, selected ? s.pillActive : s.pillDefault]}
                  onPress={() => setGraduationYear(selected ? null : year)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pillText, selected ? s.pillTextActive : s.pillTextDefault]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Application target */}
        <View style={s.field}>
          <FieldLabel>What are you aiming for?</FieldLabel>
          <View style={s.pillsWrap}>
            {TARGET_OPTIONS.map((opt) => {
              const selected = targetKey === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.pill, selected ? s.pillActive : s.pillDefault]}
                  onPress={() => setTargetKey(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pillText, selected ? s.pillTextActive : s.pillTextDefault]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Error */}
        {submitError ? (
          <Text style={s.errorText}>{submitError}</Text>
        ) : null}

        {/* Continue */}
        <TouchableOpacity
          style={[s.button, canContinue && !loading ? s.buttonActive : s.buttonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[s.buttonText, !canContinue && s.buttonTextDisabled]}>
              Continue →
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  photoSection: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  photoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.s3,
    borderWidth: 1,
    borderColor: colors.b2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 7,
  },
  photoImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  photoOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: {
    fontSize: 10,
    color: colors.t3,
    fontWeight: '500',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 4,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.blue,
  },
  header: {
    paddingTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: colors.gold,
    marginBottom: 7,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: colors.t1,
    lineHeight: 27,
    marginBottom: 5,
  },
  sub: {
    fontSize: 11,
    color: colors.t2,
    lineHeight: 17,
  },
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: colors.t3,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.s3,
    borderWidth: 1,
    borderColor: colors.b2,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 12,
    color: colors.t1,
  },
  microWin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  microWinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(201,168,76,0.15)',
    borderWidth: 1,
    borderColor: colors.goldbdr,
    alignItems: 'center',
    justifyContent: 'center',
  },
  microWinText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gold,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.s3,
    borderWidth: 1,
    borderColor: colors.b2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 11,
    color: colors.t1,
  },
  tagX: {
    fontSize: 13,
    color: colors.t3,
    lineHeight: 16,
  },
  maxReached: {
    fontSize: 11,
    color: colors.t3,
    paddingVertical: 8,
    paddingLeft: 2,
  },
  tagError: {
    fontSize: 11,
    color: colors.coral,
    marginTop: 4,
    paddingLeft: 2,
  },
  dropdown: {
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b2,
    borderRadius: 11,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  dropdownDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.b2,
  },
  dropdownText: {
    fontSize: 12,
    color: colors.t1,
  },
  cohortCard: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
    backgroundColor: 'rgba(201,168,76,0.07)',
    borderWidth: 1,
    borderColor: colors.goldbdr,
    borderRadius: 10,
    padding: 10,
  },
  cohortDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.gold,
    marginTop: 5,
    flexShrink: 0,
  },
  cohortTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gold,
    lineHeight: 15,
    marginBottom: 2,
  },
  cohortBody: {
    fontSize: 10,
    color: colors.gold,
    lineHeight: 15,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  pillDefault: {
    backgroundColor: colors.s3,
    borderColor: colors.b2,
  },
  pillActive: {
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderColor: colors.goldbdr,
  },
  pillText: {
    fontSize: 11,
  },
  pillTextDefault: {
    color: colors.t2,
    fontWeight: '500',
  },
  pillTextActive: {
    color: colors.gold,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 11,
    color: colors.coral,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  buttonActive: {
    backgroundColor: colors.gold, // Dilly brand blue (#2B3A8E)
  },
  buttonDisabled: {
    backgroundColor: colors.s3,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.1,
  },
  buttonTextDisabled: {
    color: colors.t3,
  },
  // blue for back button
  blue: {
    color: colors.blue,
  },
});
