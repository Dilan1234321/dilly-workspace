/**
 * ThemeMocks - pixel-parity mock renders of the five hero surfaces,
 * used exclusively inside the Customize Dilly studio preview.
 *
 * Why these are mocks, not the real screens:
 *   - The real screens mount data fetches, navigation, paywall hooks,
 *     and stateful flows. Rendering them at scale 0.55× inside a
 *     modal would wreck those flows and generate phantom network
 *     traffic during a preview. These mocks are self-contained:
 *     fixed fake content, zero side effects.
 *   - Every color, radius, padding, and font comes from the passed-in
 *     ResolvedTheme so the preview is ground truth for what the
 *     user's choices will produce.
 *
 * Call site: CustomizeStudio renders <MockFrame theme={pending} /> with
 * a Screen picker above it.
 */

import { View, Text, ScrollView, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ResolvedTheme } from '../hooks/useTheme';

export type MockScreenId = 'career';

export interface MockScreenMeta {
  id: MockScreenId;
  label: string;
}

export const MOCK_SCREENS: MockScreenMeta[] = [
  // Only Home (Career Center) remains. Per user: the other mocks
  // were noise. One preview, the main surface, is enough to show
  // what the user's theme choices will actually feel like.
  { id: 'career', label: 'Home' },
];

/* ─────────────────────────────────────────────────────────────── */
/* Shared primitives - all read from theme                         */
/* ─────────────────────────────────────────────────────────────── */

function useHeroTextStyle(t: ResolvedTheme): TextStyle {
  return {
    fontFamily: t.type.display,
    fontWeight: t.type.heroWeight,
    letterSpacing: t.type.heroTracking,
    color: t.surface.t1,
  };
}

function useBodyStyle(t: ResolvedTheme): TextStyle {
  return {
    fontFamily: t.type.body,
    color: t.surface.t1,
  };
}

function CTA({ theme, label, icon }: { theme: ResolvedTheme; label: string; icon?: any }) {
  // Gradient via a stacked View since we don't pull in expo-linear-gradient
  // inside the mocks (keeps the preview dependency-free).
  const bg = theme.accent;
  const bg2 = theme.gradient ? theme.gradient[1] : bg;
  const shape = theme.shape.sm;
  const pad = 12 * theme.density;
  return (
    <View style={{
      backgroundColor: bg,
      borderRadius: shape,
      overflow: 'hidden',
    }}>
      {theme.gradient && (
        <View style={{
          position: 'absolute', top: 0, bottom: 0, right: 0,
          width: '55%', backgroundColor: bg2, opacity: 0.9,
        }} />
      )}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: pad, paddingHorizontal: pad + 6,
      }}>
        {icon ? <Ionicons name={icon} size={14} color="#fff" /> : null}
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.2 }}>{label}</Text>
      </View>
    </View>
  );
}

function Chip({ theme, children, filled }: { theme: ResolvedTheme; children: string; filled?: boolean }) {
  const pad = 6 * theme.density;
  return (
    <View style={{
      paddingHorizontal: pad + 4,
      paddingVertical: pad,
      borderRadius: theme.shape.chip,
      backgroundColor: filled ? theme.accentSoft : theme.surface.s2,
      borderWidth: 1,
      borderColor: filled ? theme.accentBorder : theme.surface.border,
    }}>
      <Text style={{
        fontSize: 10, fontWeight: '700',
        color: filled ? theme.accent : theme.surface.t2,
      }}>
        {children}
      </Text>
    </View>
  );
}

function Card({ theme, children, style }: { theme: ResolvedTheme; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{
      backgroundColor: theme.surface.s1,
      borderRadius: theme.shape.md,
      borderWidth: 1,
      borderColor: theme.surface.border,
      padding: 14 * theme.density,
    }, style]}>
      {children}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Individual mocks                                                */
/* ─────────────────────────────────────────────────────────────── */

function MockCareer({ theme }: { theme: ResolvedTheme }) {
  const hero = useHeroTextStyle(theme);
  return (
    <View style={{ gap: 12 * theme.density }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={[hero, { fontSize: 20 }]}>
            Welcome, <Text style={{ color: theme.accent }}>Dilan</Text>.
          </Text>
          <Text style={{ fontSize: 11, color: theme.surface.t3, marginTop: 2 }}>Welcome to your career center.</Text>
        </View>
        <Ionicons name="qr-code" size={18} color={theme.accent} />
      </View>

      <Card theme={theme}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1.2 }}>DILLY KNOWS</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.surface.t1 }}>34 <Text style={{ fontSize: 10, color: theme.surface.t3 }}>things</Text></Text>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.surface.s3, overflow: 'hidden' }}>
          <View style={{ width: '42%', height: '100%', backgroundColor: theme.accent }} />
        </View>
        <Text style={{ fontSize: 10, color: theme.surface.t2, marginTop: 6, lineHeight: 14 }}>
          34 is a real start. The average person who lands their role has 80+.
        </Text>
      </Card>

      <Card theme={theme}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1, marginBottom: 6 }}>JOURNEY</Text>
        {['Tell Dilly about yourself', 'Explore your job matches', 'Practice an interview'].map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
            <View style={{
              width: 16, height: 16, borderRadius: theme.shape.chip,
              backgroundColor: i === 0 ? theme.accent : theme.surface.s3,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {i === 0 ? <Ionicons name="checkmark" size={9} color="#fff" /> : null}
            </View>
            <Text style={{ fontSize: 11, color: theme.surface.t1, flex: 1 }}>{t}</Text>
          </View>
        ))}
      </Card>

      <CTA theme={theme} label="Talk to Dilly" icon="chatbubble" />
    </View>
  );
}


/* ─────────────────────────────────────────────────────────────── */
/* Exported frame                                                  */
/* ─────────────────────────────────────────────────────────────── */

/**
 * Renders the chosen mock inside a phone-shaped frame. Frame honors
 * the theme surface so the "app" feel of the mock is preserved.
 */
export function MockFrame({ theme, screen }: { theme: ResolvedTheme; screen: MockScreenId }) {
  // Only the home (career) mock is rendered now. Kept the screen
  // prop in the signature so the picker UI up-stream still compiles.
  void screen;

  return (
    <View style={[
      mockStyles.frame,
      { backgroundColor: theme.surface.bg, borderRadius: theme.shape.lg },
    ]}>
      {/* Notch + time */}
      <View style={mockStyles.notchRow}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: theme.surface.t1 }}>9:41</Text>
        <View style={mockStyles.notch} />
        <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
          <Ionicons name="wifi" size={10} color={theme.surface.t2} />
          <Ionicons name="battery-full" size={10} color={theme.surface.t2} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <MockCareer theme={theme} />
      </ScrollView>
    </View>
  );
}

const mockStyles = StyleSheet.create({
  frame: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  notchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
  },
  notch: {
    width: 60, height: 14, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
});
