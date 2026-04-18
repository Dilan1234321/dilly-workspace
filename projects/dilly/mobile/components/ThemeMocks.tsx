/**
 * ThemeMocks — pixel-parity mock renders of the five hero surfaces,
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

export type MockScreenId = 'career' | 'chat' | 'profile' | 'room' | 'forge';

export interface MockScreenMeta {
  id: MockScreenId;
  label: string;
}

export const MOCK_SCREENS: MockScreenMeta[] = [
  { id: 'career',  label: 'Career Center' },
  { id: 'chat',    label: 'Chat with Dilly' },
  { id: 'profile', label: 'My Dilly' },
  { id: 'room',    label: 'Interview · The Room' },
  { id: 'forge',   label: 'Resume · The Forge' },
];

/* ─────────────────────────────────────────────────────────────── */
/* Shared primitives — all read from theme                         */
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

function MockChat({ theme }: { theme: ResolvedTheme }) {
  const LINK = '#2B3A8E';
  return (
    <View style={{ gap: 10 * theme.density }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.surface.border }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent }} />
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: theme.surface.t1 }}>Dilly</Text>
      </View>

      {/* User bubble */}
      <View style={{ alignItems: 'flex-end' }}>
        <View style={{
          backgroundColor: theme.accent,
          borderRadius: theme.shape.md,
          paddingVertical: 8, paddingHorizontal: 10,
          maxWidth: '85%',
        }}>
          <Text style={{ fontSize: 12, color: '#fff' }}>I want to break into product management. Where do I start?</Text>
        </View>
      </View>

      {/* Assistant bubble */}
      <View style={{ alignItems: 'flex-start' }}>
        <View style={{
          backgroundColor: theme.surface.s1,
          borderRadius: theme.shape.md,
          borderWidth: 1, borderColor: theme.surface.border,
          paddingVertical: 8, paddingHorizontal: 10,
          maxWidth: '90%',
        }}>
          <Text style={{ fontSize: 12, color: theme.surface.t1, lineHeight: 17 }}>
            Watch Lenny Rachitsky's "How to get your first PM role" — it's the clearest map out there:{' '}
            <Text style={{ color: theme.accent, textDecorationLine: 'underline', fontWeight: '700' }}>
              https://youtu.be/lenny-pm-intro
            </Text>
            . What industry pulls you in?
          </Text>
        </View>
      </View>

      <View style={{
        backgroundColor: theme.surface.s1,
        borderRadius: theme.shape.sm,
        borderWidth: 1, borderColor: theme.surface.border,
        padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8,
      }}>
        <Text style={{ flex: 1, fontSize: 11, color: theme.surface.t3 }}>Type a message…</Text>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-up" size={14} color="#fff" />
        </View>
      </View>
    </View>
  );
}

function MockProfile({ theme }: { theme: ResolvedTheme }) {
  const hero = useHeroTextStyle(theme);
  return (
    <View style={{ gap: 10 * theme.density }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 44, height: 44, borderRadius: theme.shape.pill === 999 ? 22 : 10,
          backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accentBorder,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="person" size={22} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[hero, { fontSize: 16 }]}>Dilan Kochhar</Text>
          <Text style={{ fontSize: 10, color: theme.surface.t3 }}>Data Science · University of Tampa</Text>
        </View>
        <View style={{
          paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.shape.chip,
          backgroundColor: theme.accent,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>EDIT</Text>
        </View>
      </View>

      <Card theme={theme}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1, marginBottom: 8 }}>WHAT WE KNOW ABOUT YOU</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {['Leadership', 'Projects', 'Skills', 'Goals'].map((l, i) => (
            <View key={i} style={{
              flex: 1, minWidth: '45%',
              backgroundColor: i < 2 ? theme.accentSoft : theme.surface.s2,
              borderWidth: 1, borderColor: i < 2 ? theme.accentBorder : theme.surface.border,
              borderRadius: theme.shape.sm,
              padding: 8 * theme.density,
              flexDirection: 'row', alignItems: 'center', gap: 6,
            }}>
              <Ionicons name={i === 0 ? 'trophy' : i === 1 ? 'rocket' : i === 2 ? 'construct' : 'compass'}
                       size={12} color={i < 2 ? theme.accent : theme.surface.t3} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.surface.t1, flex: 1 }}>{l}</Text>
              {i < 2 && (
                <View style={{ backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{i === 0 ? '4' : '7'}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </Card>

      <CTA theme={theme} label="Share profile" icon="share-outline" />
    </View>
  );
}

function MockRoom({ theme }: { theme: ResolvedTheme }) {
  // The Room is always dark in the real app. Preserve that — it's an
  // intentional design choice, not a theme the user owns.
  const nightBg = '#0B0F1E';
  const nightCard = '#151A2E';
  const nightText = '#E8EAF4';
  const nightMuted = 'rgba(232,234,244,0.6)';
  const nightBorder = 'rgba(255,255,255,0.08)';
  return (
    <View style={{ gap: 8, backgroundColor: nightBg, padding: 12, borderRadius: theme.shape.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF453A' }} />
        <Text style={{ fontSize: 10, color: nightMuted }}>Interviewing at <Text style={{ color: nightText, fontWeight: '700' }}>Stripe</Text></Text>
      </View>

      <View style={{ backgroundColor: nightCard, borderRadius: theme.shape.md, borderWidth: 1, borderColor: nightBorder, padding: 14 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: theme.shape.chip, backgroundColor: '#FF453A22', borderWidth: 1, borderColor: '#FF453A55' }}>
            <Text style={{ fontSize: 8, fontWeight: '800', color: '#FF453A' }}>LIKELY</Text>
          </View>
          <Text style={{ fontSize: 9, color: nightMuted, fontWeight: '600' }}>BEHAVIORAL</Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: '700', color: nightText, lineHeight: 20 }}>
          Tell me about a time you had to change a teammate's mind about a technical decision.
        </Text>
      </View>

      <View style={{ backgroundColor: nightCard, borderRadius: theme.shape.md, borderWidth: 1, borderColor: nightBorder, padding: 10 }}>
        <Text style={{ fontSize: 9, fontWeight: '800', color: nightMuted, letterSpacing: 1.2, marginBottom: 6 }}>LIVE METRICS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#34C759' }}>~52s</Text>
            <Text style={{ fontSize: 8, color: nightMuted, fontWeight: '700' }}>SWEET SPOT</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: nightText }}>118</Text>
            <Text style={{ fontSize: 8, color: nightMuted, fontWeight: '700' }}>WORDS</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#FF9F0A' }}>3 / 4</Text>
            <Text style={{ fontSize: 8, color: nightMuted, fontWeight: '700' }}>STAR</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 5, marginTop: 10 }}>
          {['S', 'T', 'A', 'R'].map((l, i) => {
            const lit = i < 3;
            return (
              <View key={l} style={{
                flex: 1, paddingVertical: 5, borderRadius: theme.shape.chip,
                backgroundColor: lit ? theme.accentSoft : 'rgba(255,255,255,0.02)',
                borderWidth: 1, borderColor: lit ? theme.accentBorder : nightBorder,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: lit ? theme.accent : nightMuted }}>{l}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function MockForge({ theme }: { theme: ResolvedTheme }) {
  const hero = useHeroTextStyle(theme);
  return (
    <View style={{ gap: 10 * theme.density }}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accentBorder, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ribbon" size={18} color={theme.accent} />
        </View>
        <Text style={{ fontSize: 9, fontWeight: '800', color: theme.accent, letterSpacing: 2 }}>FORGED</Text>
        <Text style={[hero, { fontSize: 17, textAlign: 'center' }]}>
          for Senior Engineer{'\n'}at <Text style={{ color: theme.accent }}>Stripe</Text>
        </Text>
      </View>

      <Card theme={theme}>
        <Text style={{ fontSize: 9, fontWeight: '800', color: theme.surface.t3, letterSpacing: 1.2, marginBottom: 8 }}>ATS READINESS</Text>
        {[
          { label: 'ATS parse', v: 92 },
          { label: 'Keyword match', v: 78 },
          { label: 'Profile depth', v: 84 },
          { label: 'Role fit', v: 81 },
        ].map(row => (
          <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 10, color: theme.surface.t2, fontWeight: '700', width: 80 }}>{row.label}</Text>
            <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: theme.surface.s3, overflow: 'hidden' }}>
              <View style={{ width: `${row.v}%`, height: '100%', backgroundColor: theme.accent }} />
            </View>
            <Text style={{ fontSize: 10, fontWeight: '800', color: theme.accent, width: 24, textAlign: 'right' }}>{row.v}</Text>
          </View>
        ))}
      </Card>

      <CTA theme={theme} label="Export · PDF or DOCX" icon="download" />
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
  const inner = (() => {
    switch (screen) {
      case 'career':  return <MockCareer theme={theme} />;
      case 'chat':    return <MockChat theme={theme} />;
      case 'profile': return <MockProfile theme={theme} />;
      case 'room':    return <MockRoom theme={theme} />;
      case 'forge':   return <MockForge theme={theme} />;
    }
  })();

  // The Room has its own dark shell regardless of surface choice;
  // wrap it with minimal chrome so we don't double-frame.
  const isRoom = screen === 'room';

  return (
    <View style={[
      mockStyles.frame,
      { backgroundColor: isRoom ? '#0B0F1E' : theme.surface.bg, borderRadius: theme.shape.lg },
    ]}>
      {/* Notch + time */}
      <View style={mockStyles.notchRow}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: isRoom ? '#E8EAF4' : theme.surface.t1 }}>9:41</Text>
        <View style={mockStyles.notch} />
        <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
          <Ionicons name="wifi" size={10} color={isRoom ? '#E8EAF4' : theme.surface.t2} />
          <Ionicons name="battery-full" size={10} color={isRoom ? '#E8EAF4' : theme.surface.t2} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {inner}
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
