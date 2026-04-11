/**
 * Choose Path — the onboarding fork.
 *
 * "I'm a student" → student flow (existing, .edu email)
 * Everything else → professional flow (any email, career fields)
 */

import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

const GOLD = '#2B3A8E';

export default function ChoosePathScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      {/* Hero */}
      <FadeInView delay={0}>
        <Text style={s.headline}>Your career.{'\n'}Your guide.{'\n'}Your move.</Text>
        <Text style={s.sub}>
          Dilly builds a deep profile of who you are, then guides you through the AI-driven job market.
        </Text>
      </FadeInView>

      {/* Path options */}
      <View style={s.cards}>
        <FadeInView delay={100}>
          <AnimatedPressable
            style={s.card}
            onPress={() => router.push('/onboarding/welcome')}
            scaleDown={0.97}
          >
            <View style={[s.cardIcon, { backgroundColor: '#5E5CE6' + '15' }]}>
              <Ionicons name="school" size={24} color="#5E5CE6" />
            </View>
            <Text style={s.cardTitle}>I'm a student</Text>
            <Text style={s.cardSub}>College or university. Get student pricing with your .edu email.</Text>
            <View style={s.cardArrow}>
              <Ionicons name="arrow-forward" size={16} color={colors.t3} />
            </View>
          </AnimatedPressable>
        </FadeInView>

        <FadeInView delay={200}>
          <AnimatedPressable
            style={s.card}
            onPress={() => router.push('/onboarding/welcome-pro')}
            scaleDown={0.97}
          >
            <View style={[s.cardIcon, { backgroundColor: GOLD + '15' }]}>
              <Ionicons name="briefcase" size={24} color={GOLD} />
            </View>
            <Text style={s.cardTitle}>I'm a professional</Text>
            <Text style={s.cardSub}>Working, job searching, career pivoting, or exploring your options.</Text>
            <View style={s.cardArrow}>
              <Ionicons name="arrow-forward" size={16} color={colors.t3} />
            </View>
          </AnimatedPressable>
        </FadeInView>

        <FadeInView delay={300}>
          <AnimatedPressable
            style={s.card}
            onPress={() => router.push('/onboarding/welcome-pro')}
            scaleDown={0.97}
          >
            <View style={[s.cardIcon, { backgroundColor: '#34C759' + '15' }]}>
              <Ionicons name="compass" size={24} color="#34C759" />
            </View>
            <Text style={s.cardTitle}>I'm exploring</Text>
            <Text style={s.cardSub}>Not sure yet. Dilly will help you figure out where you stand.</Text>
            <View style={s.cardArrow}>
              <Ionicons name="arrow-forward" size={16} color={colors.t3} />
            </View>
          </AnimatedPressable>
        </FadeInView>
      </View>

      {/* Footer */}
      <FadeInView delay={400}>
        <Text style={s.footer}>
          AI is reshaping the job market. Dilly shows you where you stand and what to do next.
        </Text>
      </FadeInView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },

  headline: { fontSize: 32, fontWeight: '900', color: colors.t1, lineHeight: 38, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: colors.t2, lineHeight: 22, marginTop: 12, marginBottom: 32 },

  cards: { gap: 12, flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.s1, borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: colors.b1,
  },
  cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.t1 },
  cardSub: { fontSize: 12, color: colors.t2, lineHeight: 17, marginTop: 2, flex: 1 },
  cardArrow: { marginLeft: 'auto' },

  footer: { fontSize: 12, color: colors.t3, textAlign: 'center', lineHeight: 17, paddingHorizontal: 20 },
});
