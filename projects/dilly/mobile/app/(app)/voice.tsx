import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DillyFace } from '../../components/DillyFace';
import DillyAIOverlay, { StudentContext } from '../../components/DillyAIOverlay';
import { colors } from '../../lib/tokens';
import { dilly } from '../../lib/dilly';

const COHORT_BARS: Record<string, { bar: number; company: string }> = {
  Tech:    { bar: 75, company: 'Google' },
  Finance: { bar: 72, company: 'Goldman Sachs' },
  Health:  { bar: 68, company: 'Mayo Clinic' },
  General: { bar: 65, company: 'your target company' },
};

export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const [showOverlay,    setShowOverlay]   = useState(false);
  const [studentContext, setStudentContext] = useState<StudentContext | undefined>();
  const [contextLoaded,  setContextLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [profileRes, auditRaw] = await Promise.all([
          dilly.get('/profile'),
          dilly.get('/audit/latest'),
        ]);

        const p        = profileRes ?? {};
        const auditObj = auditRaw?.audit ?? auditRaw ?? {};
        const snapshot = p?.first_audit_snapshot?.scores;

        const smart = auditObj?.scores?.smart ?? snapshot?.smart ?? null;
        const grit  = auditObj?.scores?.grit  ?? snapshot?.grit  ?? null;
        const build = auditObj?.scores?.build ?? snapshot?.build ?? null;

        const finalScore = auditObj?.final_score
          || profileRes?.overall_dilly_score
          || (smart != null && grit != null && build != null
            ? Math.round((smart + grit + build) / 3)
            : null);

        const cohort    = p.track || p.cohort || 'General';
        const firstName = p.name?.trim().split(/\s+/)[0] || p.first_name || 'there';
        const cohortCfg = COHORT_BARS[cohort] || COHORT_BARS.General;

        setStudentContext({
          name:             firstName,
          cohort,
          score:            finalScore ?? undefined,
          smart:            smart  ?? undefined,
          grit:             grit   ?? undefined,
          build:            build  ?? undefined,
          gap:              finalScore != null ? cohortCfg.bar - finalScore : undefined,
          cohortBar:        cohortCfg.bar,
          referenceCompany: cohortCfg.company,
        });
      } catch {
        // context stays undefined — overlay still works, just without scores
      } finally {
        setContextLoaded(true);
      }
    })();
  }, []);

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <TouchableOpacity
        style={s.faceButton}
        onPress={() => setShowOverlay(true)}
        activeOpacity={0.75}
      >
        <View style={s.faceRing}>
          <DillyFace size={96} />
        </View>
        <Text style={s.tapLabel}>Tap to talk to Dilly</Text>
        <Text style={s.tapSub}>AI coaching, interview prep, career advice</Text>
        {!contextLoaded && (
          <ActivityIndicator size="small" color={colors.t3} style={{ marginTop: 8 }} />
        )}
      </TouchableOpacity>

      <DillyAIOverlay
        visible={showOverlay}
        onClose={() => setShowOverlay(false)}
        studentContext={studentContext}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceButton: { alignItems: 'center', gap: 14 },
  faceRing: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: 'rgba(201,168,76,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(201,168,76,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 14,
    letterSpacing: 1,
    color: colors.t1,
  },
  tapSub: {
    fontSize: 12,
    color: colors.t3,
    textAlign: 'center',
  },
});