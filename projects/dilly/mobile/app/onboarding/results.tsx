import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import { DillyFace } from '../../components/DillyFace';

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [completing, setCompleting] = useState(false);

  async function handleEnter() {
    if (completing) return;
    setCompleting(true);
    try { await dilly.patch('/profile', { onboarding_complete: true }); } catch {}
    await AsyncStorage.setItem('dilly_has_onboarded', 'true');
    await AsyncStorage.removeItem('dilly_audit_result');
    // New signups see the tutorial once. The tutorial screen itself
    // checks `dilly_tutorial_shown` and redirects straight to /(app)
    // if somehow a non-new user lands here, so this is safe to route
    // unconditionally for the results → app transition.
    router.replace('/onboarding/tutorial');
  }

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      {/* Centered content */}
      <View style={s.content}>
        {/* Excited Dilly. Replaces the old checkmark — Dilly's own
            face celebrating is a stronger signal than a stock check. */}
        <View style={s.faceHero}>
          <DillyFace size={108} mood="celebrating" />
        </View>

        <Text style={s.heading}>Your Dilly Profile is ready.</Text>
        <Text style={s.sub}>
          Dilly knows who you are. Now let's find you the right opportunities.
        </Text>
      </View>

      {/* CTA pinned to bottom */}
      <View style={s.ctaWrap}>
        <TouchableOpacity
          style={[s.button, completing && { opacity: 0.7 }]}
          onPress={handleEnter}
          activeOpacity={0.85}
          disabled={completing}
        >
          {completing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={s.buttonText}>Let's go</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  // Was a small gold check circle. Now just a centered slot for
  // DillyFace — no ring, no fill, per the face-is-clean rule.
  faceHero: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 24,
    color: colors.t1,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 10,
  },
  sub: {
    fontSize: 14,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 16,
  },
  ctaWrap: {
    paddingHorizontal: spacing.xl,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
