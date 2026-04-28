import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DillyFace } from '../../components/DillyFace';
import DillyAIOverlay, { StudentContext } from '../../components/DillyAIOverlay';
import { colors } from '../../lib/tokens';
import { useResolvedTheme } from '../../hooks/useTheme';
import { dilly } from '../../lib/dilly';

const COHORT_BARS: Record<string, { bar: number; company: string }> = {
  Tech:    { bar: 75, company: 'Google' },
  Finance: { bar: 72, company: 'Goldman Sachs' },
  Health:  { bar: 68, company: 'Mayo Clinic' },
  General: { bar: 65, company: 'your target company' },
};

export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
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
        // Prefer primary cohort scores from rubric_analysis  -  no aggregates.
        const ra = auditObj?.rubric_analysis;

        const smart = ra?.primary_smart ?? auditObj?.scores?.smart ?? snapshot?.smart ?? null;
        const grit  = ra?.primary_grit  ?? auditObj?.scores?.grit  ?? snapshot?.grit  ?? null;
        const build = ra?.primary_build ?? auditObj?.scores?.build ?? snapshot?.build ?? null;

        const finalScore = ra?.primary_composite
          ?? auditObj?.final_score
          ?? (smart != null && grit != null && build != null
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
        // context stays undefined  -  overlay still works, just without scores
      } finally {
        setContextLoaded(true);
      }
    })();
  }, []);

  return (
    <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <TouchableOpacity
        style={s.faceButton}
        onPress={() => setShowOverlay(true)}
        activeOpacity={0.75}
      >
        <View style={s.faceRing}>
          <DillyFace size={120} mood="attentive" accessory="headphones" circular />
        </View>
        <Text style={[s.tapLabel, { color: theme.surface.t1 }]}>Tap to talk to Dilly</Text>
        <Text style={[s.tapSub, { color: theme.surface.t3 }]}>AI coaching, interview prep, career advice</Text>
        {!contextLoaded && (
          <ActivityIndicator size="small" color={theme.surface.t3} style={{ marginTop: 8 }} />
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
  // Previously drew a visible ring. Dropped to align with the
  // app-wide rule: DillyFace always renders clean, no ring. The
  // tap target stays the same, it just doesn't draw a border.
  faceRing: {
    width: 124,
    height: 124,
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