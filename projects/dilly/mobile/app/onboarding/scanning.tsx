import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { DillyFace } from '../../components/DillyFace';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authHeaders } from '../../lib/auth';
import { dilly } from '../../lib/dilly';
import { pendingUpload, PENDING_UPLOAD_KEY } from './upload';
import { colors, spacing, API_BASE } from '../../lib/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEYS = {
  name:      'dilly_onboarding_name',
  cohort:    'dilly_onboarding_cohort',
  track:     'dilly_onboarding_track',
  target:    'dilly_onboarding_target',
  majors:    'dilly_onboarding_majors',
  preProf:   'dilly_onboarding_pre_prof',
  indTarget: 'dilly_onboarding_industry_target',
  interests: 'dilly_onboarding_interests',
};

export const AUDIT_RESULT_KEY = 'dilly_audit_result';

type StepState = 'pending' | 'active' | 'done';

// ── Orb ───────────────────────────────────────────────────────────────────────

function DillyOrb() {
  // Three staggered pulse rings
  const rings = [0, 800, 1600].map((delay) => {
    const scale   = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale,   { toValue: 2.2, duration: 2400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 2400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale,   { toValue: 1,   duration: 0, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      loop.start();
      return () => loop.stop();
    }, []);

    return { scale, opacity };
  });

  // Orb slow rotation glow
  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  return (
    <View style={orb.container}>
      {rings.map(({ scale, opacity }, i) => (
        <Animated.View
          key={i}
          style={[
            orb.ring,
            { transform: [{ scale }], opacity },
          ]}
        />
      ))}
      {/* Inner orb */}
      <View style={orb.inner}>
        <DillyFace size={96} />
      </View>
    </View>
  );
}

const orb = StyleSheet.create({
  container: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.35)',
  },
  inner: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#0d0900',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
});

// ── Step row ──────────────────────────────────────────────────────────────────

function StepRow({ label, state }: { label: string; state: StepState }) {
  const isActive = state === 'active';
  const isDone   = state === 'done';

  return (
    <View
      style={[
        s.stepRow,
        isActive && s.stepRowActive,
      ]}
    >
      <View
        style={[
          s.dot,
          isDone   && s.dotDone,
          isActive && s.dotActive,
        ]}
      />
      <Text
        style={[
          s.stepLabel,
          isDone   && s.stepLabelDone,
          isActive && s.stepLabelActive,
        ]}
      >
        {label}
      </Text>
      {isDone && (
        <Ionicons name="checkmark" size={11} color={colors.green} />
      )}
    </View>
  );
}

// ── Animated progress bar ─────────────────────────────────────────────────────

function ProgressFill({ pct }: { pct: number }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: pct,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  return (
    <View style={s.progressTrack}>
      <Animated.View
        style={[
          s.progressFill,
          { width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScanningScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [firstName, setFirstName] = useState('');
  const [cohort,    setCohort]    = useState('');
  const [steps,     setSteps]     = useState<StepState[]>(Array(5).fill('pending') as StepState[]);
  const [progress,  setProgress]  = useState(0);

  const apiReadyRef  = useRef(false);
  const holdingRef   = useRef(false);
  const hasCalledApi = useRef(false);

  // ── Load session data ───────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const name   = await AsyncStorage.getItem(ONBOARDING_KEYS.name)   ?? '';
      const cohort = await AsyncStorage.getItem(ONBOARDING_KEYS.cohort) ?? '';
      setFirstName(name.trim().split(/\s+/)[0] ?? '');
      setCohort(cohort);
    })();
  }, []);

  // ── Step animation ──────────────────────────────────────────────────────

  useEffect(() => {
    const T: ReturnType<typeof setTimeout>[] = [];

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 0 ? 'active' : v));
      setProgress(8);
    }, 400));

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 0 ? 'done' : i === 1 ? 'active' : v));
      setProgress(28);
    }, 1600));

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 1 ? 'done' : i === 2 ? 'active' : v));
      setProgress(52);
    }, 3200));

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 2 ? 'done' : i === 3 ? 'active' : v));
      setProgress(76);
    }, 5800));

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 3 ? 'done' : i === 4 ? 'active' : v));
      setProgress(88);
    }, 8400));

    T.push(setTimeout(() => {
      if (apiReadyRef.current) {
        setSteps(['done', 'done', 'done', 'done', 'done']);
        setProgress(100);
      } else {
        holdingRef.current = true;
      }
    }, 11000));

    T.push(setTimeout(() => {
      if (apiReadyRef.current) {
        router.replace('/onboarding/results');
      }
    }, 11600));

    return () => T.forEach(clearTimeout);
  }, []);

  // ── API call ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (hasCalledApi.current) return;
    hasCalledApi.current = true;

    (async () => {
      try {
        const headers = await authHeaders();
        const formData = new FormData();

        // Resolve file: prefer module-level (same JS session), fall back to AsyncStorage
        let fileUri      = pendingUpload.uri;
        let fileName     = pendingUpload.name;
        let fileMimeType = pendingUpload.mimeType;

        if (!fileUri) {
          const stored = await AsyncStorage.getItem(PENDING_UPLOAD_KEY);
          if (stored) {
            try {
              const p = JSON.parse(stored);
              fileUri      = p.uri      ?? null;
              fileName     = p.name     ?? null;
              fileMimeType = p.mimeType ?? null;
              } catch { /* ignore */ }
          }
        }

        // Attach file if present
        if (fileUri && fileName) {
          formData.append('file', {
            uri:  fileUri,
            name: fileName,
            type: fileMimeType ?? 'application/pdf',
          } as any);
        }

        // Attach profile params
        const [nameRaw, majorsRaw, preProf, indTarget, cohortVal, track, appTarget, interestsRaw] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_KEYS.name),
          AsyncStorage.getItem(ONBOARDING_KEYS.majors),
          AsyncStorage.getItem(ONBOARDING_KEYS.preProf),
          AsyncStorage.getItem(ONBOARDING_KEYS.indTarget),
          AsyncStorage.getItem(ONBOARDING_KEYS.cohort),
          AsyncStorage.getItem(ONBOARDING_KEYS.track),
          AsyncStorage.getItem(ONBOARDING_KEYS.target),
          AsyncStorage.getItem(ONBOARDING_KEYS.interests),
        ]);

        // Guarantee interests are on the profile before the audit runs.
        // interests.tsx fires a fire-and-forget PATCH that may not have settled yet
        // (bad timing, flaky network). Re-saving here is idempotent and cheap.
        if (interestsRaw) {
          try {
            const interests = JSON.parse(interestsRaw);
            fetch(`${API_BASE}/profile`, {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json', ...headers },
              body:    JSON.stringify({ interests }),
            }).catch(() => null);
          } catch { /* ignore parse errors */ }
        }

        if (nameRaw)    formData.append('name',                   nameRaw);
        if (majorsRaw) {
          try {
            const majorList: string[] = JSON.parse(majorsRaw);
            majorList.forEach(m => formData.append('majors', m));
          } catch {
            formData.append('major', majorsRaw);
          }
        }
        if (preProf)    formData.append('pre_professional_track', preProf);
        if (indTarget)  formData.append('industry_target',        indTarget);
        if (cohortVal)  formData.append('cohort',                 cohortVal);
        if (track)      formData.append('track',                  track);
        if (appTarget)  formData.append('application_target',     appTarget);

        const res = await fetch(`${API_BASE}/audit/first-run`, {
          method:  'POST',
          headers: { ...headers },
          body:    formData,
        });

        const result = await res.json();

        const payload = res.ok
          ? result
          : { error: true, status: res.status, detail: result.detail };

        await AsyncStorage.setItem(AUDIT_RESULT_KEY, JSON.stringify(payload));

        // Sync parsed resume to editor base resume
        if (res.ok) {
          try { await dilly.post('/resume/sync-base'); } catch {}
        }
      } catch {
        await AsyncStorage.setItem(AUDIT_RESULT_KEY, JSON.stringify({ error: true }));
      }

      apiReadyRef.current = true;

      if (holdingRef.current) {
        setSteps(['done', 'done', 'done', 'done', 'done']);
        setProgress(100);
        setTimeout(() => router.replace('/onboarding/results'), 600);
      }
    })();
  }, []);

  // ── Step labels ─────────────────────────────────────────────────────────

  const stepLabels = [
    'Extracting your experience',
    `${cohort || 'Your'} cohort confirmed`,
    'Measuring your Grit score',
    'Comparing to your peers',
    'Building your recommendations',
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      {/* Orb */}
      <DillyOrb />

      {/* Title */}
      <Text style={s.heading}>
        {firstName ? `Dilly is on it, ${firstName}.` : 'Dilly is on it.'}
      </Text>
      <Text style={s.sub}>Reading your resume against real hiring criteria.</Text>

      {/* Progress bar */}
      <ProgressFill pct={progress} />

      {/* Steps */}
      <View style={s.steps}>
        {stepLabels.map((label, i) => (
          <StepRow key={i} label={label} state={steps[i]} />
        ))}
      </View>

      {/* Commitment line */}
      <Text style={s.commitment}>
        Every audit, every improvement  - {' '}
        <Text style={s.commitmentBold}>saved to your profile forever.</Text>
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_900Black',
    fontSize: 18,
    color: colors.t1,
    textAlign: 'center',
    marginTop: 22,
    marginBottom: 5,
  },
  sub: {
    fontSize: 11,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 18,
  },
  progressTrack: {
    width: '100%',
    height: 2.5,
    backgroundColor: colors.b1,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.gold,
    borderRadius: 999,
  },
  steps: {
    width: '100%',
    gap: 5,
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  stepRowActive: {
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderColor: 'rgba(201,168,76,0.15)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  dotActive: { backgroundColor: colors.gold },
  dotDone:   { backgroundColor: colors.green },
  stepLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: colors.t3,
  },
  stepLabelActive: { color: colors.t1 },
  stepLabelDone:   { color: colors.t2 },
  commitment: {
    fontSize: 10,
    color: colors.t3,
    textAlign: 'center',
    lineHeight: 15,
  },
  commitmentBold: {
    color: colors.t2,
    fontWeight: '600',
  },
});
