import { safeBack } from '../../lib/navigation';
/**
 * Customize Dilly — the theming studio.
 *
 * Full-screen modal with three zones:
 *   1. Screen picker (dropdown chips — switch which mock renders)
 *   2. Live mock preview (pixel-parity, theme-bound)
 *   3. Customization panel with tabbed axes
 *
 * The studio holds a PENDING theme in local state. The global theme
 * only updates when the user hits Save (or Reset / Surprise me,
 * which patch directly since they're explicit actions).
 *
 * Why pending + commit: lets users explore freely without the rest
 * of the app flashing through every swatch they hover on a slow
 * device. Makes Cancel (X) a clean no-op.
 */

import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Platform, Dimensions, Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedPressable from '../../components/AnimatedPressable';
import { dilly } from '../../lib/dilly';
import { FirstVisitCoach } from '../../components/FirstVisitCoach';
import {
  useThemeConfig, resolveTheme, patchTheme, resetTheme, surpriseTheme,
  ACCENT_PRESETS, SURFACE_PRESETS, SHAPE_PRESETS, TYPE_PRESETS,
  DENSITY_PRESETS, ACCENT_STYLE_PRESETS, DEFAULT_CONFIG,
  type ThemeConfig, type ResolvedTheme, type AccentId,
  type SurfaceId, type ShapeId, type TypeId, type DensityId, type AccentStyleId,
} from '../../hooks/useTheme';
import { useColorScheme } from 'react-native';
import { MockFrame, MOCK_SCREENS, type MockScreenId } from '../../components/ThemeMocks';

const { width: W } = Dimensions.get('window');

type AxisId = 'accent' | 'surface' | 'shape' | 'type' | 'density' | 'style' | 'advisor';
const AXES: { id: AxisId; label: string; icon: any }[] = [
  { id: 'accent',  label: 'Accent',  icon: 'color-palette' },
  { id: 'surface', label: 'Theme', icon: 'layers' },
  { id: 'shape',   label: 'Shape',   icon: 'square' },
  { id: 'type',    label: 'Type',    icon: 'text' },
  { id: 'density', label: 'Density', icon: 'resize' },
  { id: 'style',   label: 'Style',   icon: 'sparkles' },
  // The advisor axis is NOT a theme config field — it writes to
  // profile.advisor_persona via /profile PATCH. It shapes the
  // Chapter prompt's voice (warm / sharp / direct) without changing
  // any visual theme. Lives in Customize so users have one place
  // for "make Dilly feel like mine" decisions.
  { id: 'advisor', label: 'Advisor', icon: 'chatbubbles' },
];

export default function CustomizeStudio() {
  const insets = useSafeAreaInsets();
  const committed = useThemeConfig();
  const systemScheme = useColorScheme();
  const systemIsDark = systemScheme === 'dark';

  // PENDING theme — edits stay here until Save.
  const [pending, setPending] = useState<ThemeConfig>(committed);
  const [axis, setAxis] = useState<AxisId>('accent');
  // Only one mock preview now ('career' = Home). Kept as a const so
  // the MockFrame prop stays stable without a useless state pair.
  const screen: MockScreenId = 'career';

  const theme: ResolvedTheme = resolveTheme(pending, systemIsDark);

  function patch(p: Partial<ThemeConfig>) {
    // Auto-save: apply to the live global theme immediately. Every
    // preset tap commits; there is no manual Save. `pending` still
    // mirrors the live config so the preview reflects reality.
    // A "Saved" pulse fires in the top bar so the user feels the
    // commit happening even though they never pressed a button.
    setPending(prev => {
      const next = { ...prev, ...p };
      patchTheme(p).catch(() => {});
      return next;
    });
    pulseSaved();
  }

  // Auto-save pulse. Every time `patch()` fires, we kick a short
  // "Saved" animation in the top bar so the user sees the app is
  // quietly committing their change. No more manual Save button.
  const savedPulse = useRef(new Animated.Value(0)).current;
  const [savedFlash, setSavedFlash] = useState(false);
  function pulseSaved() {
    setSavedFlash(true);
    savedPulse.setValue(0);
    Animated.sequence([
      Animated.timing(savedPulse, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(savedPulse, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setSavedFlash(false); });
  }

  async function handleReset() {
    // Reset is itself an edit — apply live + pulse.
    patch(DEFAULT_CONFIG);
  }

  async function handleSurprise() {
    // Route through patch() so the live theme broadcasts to all
    // subscribers (navbar, overlays, etc.) the instant Surprise Me
    // is tapped. Previously this only set pending, so the navbar
    // sat on the old theme until the user manually committed.
    const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    patch({
      accent: rand(ACCENT_PRESETS).id,
      surface: rand(Object.values(SURFACE_PRESETS)).id,
      shape: rand(Object.values(SHAPE_PRESETS)).id,
      type: rand(Object.values(TYPE_PRESETS)).id,
      accentStyle: rand(Object.values(ACCENT_STYLE_PRESETS)).id,
    });
  }

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: theme.surface.bg }]}>
      {/* First-visit coach — Customize Dilly. Clarifies this is
          aesthetic-only (product rule: customization changes LOOK,
          not behavior). Tester confusion risk: "did I break
          something?" after picking a theme. */}
      <FirstVisitCoach
        id="customize-v1"
        iconName="color-palette"
        headline="Make Dilly look how you want."
        subline="Color, shape, type, density — your choices. None of this changes what Dilly does."
      />

      {/* Top bar. Reads theme so the Customize studio itself respects
          the user's current surface — on Midnight, the top bar and
          container become dark; on Mint, pastel.

          UX: everything auto-saves. Left nav is a back arrow (not an
          X) because there is nothing to discard — changes already
          committed. The right side is a live "Saved" indicator: it
          fades in with a filled check after every patch, holds for
          about a second, then fades out. High-tech "we handled it"
          feel, zero clicks required. */}
      <View style={[s.topBar, { backgroundColor: theme.surface.bg, borderBottomColor: theme.surface.border }]}>
        <AnimatedPressable onPress={() => safeBack('/(app)/settings')} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="chevron-back" size={24} color={theme.surface.t1} />
        </AnimatedPressable>
        <Text style={[s.topTitle, { color: theme.surface.t1 }]}>Customize Dilly</Text>
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: theme.accentSoft,
            borderWidth: 1,
            borderColor: theme.accentBorder,
            opacity: savedPulse,
            transform: [{
              scale: savedPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
            }],
          }}
          pointerEvents="none"
        >
          {savedFlash && (
            <>
              <Ionicons name="checkmark-circle" size={14} color={theme.accent} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.accent, letterSpacing: 0.5 }}>SAVED</Text>
            </>
          )}
        </Animated.View>
      </View>

      {/* Screen picker removed. Only Home preview remains, so a
          picker would just add noise. "Surprise me" kept as the
          single right-aligned action. */}
      <View style={s.screenPickerRow}>
        <View style={[s.screenPickerBtn, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
          <Ionicons name="phone-portrait" size={13} color={theme.surface.t3} />
          <Text style={[s.screenPickerLabel, { color: theme.surface.t3 }]}>
            Home preview
          </Text>
        </View>
        <AnimatedPressable
          onPress={handleSurprise}
          scaleDown={0.95}
          style={[s.surpriseBtn, { borderColor: theme.accentBorder, backgroundColor: theme.accentSoft }]}
        >
          <Ionicons name="sparkles" size={12} color={theme.accent} />
          <Text style={[s.surpriseBtnText, { color: theme.accent }]}>Surprise me</Text>
        </AnimatedPressable>
      </View>

      {/* Live preview — phone frame clamped so it never blocks the
          top bar. The preview area uses a subtle surface tint so the
          phone frame reads against it in both light and dark modes. */}
      <View style={[s.previewWrap, { backgroundColor: theme.surface.s1 }]}>
        <View style={[s.previewPhone, {
          height: Math.min(360, W * 1.25),
          width: Math.min(210, W * 0.52),
          borderColor: theme.surface.t1,
        }]}>
          <MockFrame theme={theme} screen={screen} />
        </View>
      </View>

      {/* Panel */}
      <View style={[s.panel, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.surface.bg, borderTopColor: theme.surface.border }]}>
        {/* Axis tabs. Wrapped in a relative container with a right-
            edge gradient mask so the user sees the row is scrollable
            — the last visible tab fades out, making it obvious there
            are more tabs off-screen to the right. showsHorizontal
            ScrollIndicator stays off for cleanliness; the fade is
            the affordance. */}
        <View style={{ position: 'relative' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.axisRow}>
            {AXES.map(a => {
              const active = axis === a.id;
              return (
                <AnimatedPressable
                  key={a.id}
                  style={[
                    s.axisTab,
                    { backgroundColor: theme.surface.s2, borderColor: theme.surface.border },
                    active && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                  onPress={() => setAxis(a.id)}
                  scaleDown={0.95}
                >
                  <Ionicons name={a.icon} size={12} color={active ? '#fff' : theme.surface.t1} />
                  <Text style={[s.axisTabText, { color: theme.surface.t1 }, active && { color: '#fff' }]}>{a.label}</Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
          {/* Right-edge fade. Stacked translucent strips create a
              soft gradient without needing a gradient lib. Matches
              the panel's surface color so it blends with the page
              regardless of light/dark theme. */}
          <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 36, flexDirection: 'row' }}>
            <View style={{ flex: 1, backgroundColor: theme.surface.bg, opacity: 0.35 }} />
            <View style={{ flex: 1, backgroundColor: theme.surface.bg, opacity: 0.65 }} />
            <View style={{ flex: 1, backgroundColor: theme.surface.bg, opacity: 0.9 }} />
          </View>
          {/* Tiny chevron that pulses gently to signal "scroll for
              more". Shows only while there are unseen tabs; a proper
              on-scroll hide would require tracking scroll offset,
              which is more than this needs. Kept static: the fade
              mask plus the chevron together make scrollability
              obvious. */}
          <View pointerEvents="none" style={{ position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center' }}>
            <Ionicons name="chevron-forward" size={12} color={theme.surface.t3} />
          </View>
        </View>

        {/* Axis content */}
        <View style={s.axisContent}>
          {axis === 'accent'  && <AccentPanel  pending={pending} patch={patch} theme={theme} />}
          {axis === 'surface' && <SurfacePanel pending={pending} patch={patch} theme={theme} />}
          {axis === 'shape'   && <ShapePanel   pending={pending} patch={patch} theme={theme} />}
          {axis === 'type'    && <TypePanel    pending={pending} patch={patch} theme={theme} />}
          {axis === 'density' && <DensityPanel pending={pending} patch={patch} theme={theme} />}
          {axis === 'style'   && <StylePanel   pending={pending} patch={patch} theme={theme} />}
          {axis === 'advisor' && <AdvisorPanel theme={theme} pulseSaved={pulseSaved} />}
        </View>

        {/* Footer — reset */}
        <View style={s.footer}>
          <AnimatedPressable onPress={handleReset} scaleDown={0.95} style={s.resetBtn}>
            <Ionicons name="refresh" size={13} color={theme.surface.t3} />
            <Text style={[s.resetBtnText, { color: theme.surface.t3 }]}>Reset to Dilly default</Text>
          </AnimatedPressable>
        </View>
      </View>

    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Axis panels                                                     */
/* ─────────────────────────────────────────────────────────────── */

interface AxisProps {
  pending: ThemeConfig;
  patch: (p: Partial<ThemeConfig>) => void;
  theme: ResolvedTheme;
}

function AccentPanel({ pending, patch, theme }: AxisProps) {
  // Horizontal-scroll swatch strip. Previously a wrap grid — users
  // didn't know there were more colors than the first row. Now:
  // single row, swipe to discover, with a "more →" fade indicator
  // on the right edge so the scroll is obvious.
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.swatchRow}
      >
        {ACCENT_PRESETS.map(p => {
          const selected = pending.accent === p.id;
          // Show the resolved color so the swatch matches what the user
          // actually sees in the app (e.g. Graphite → Slate gray in dark mode).
          const isDark = theme.surface.dark;
          const displayColor = (isDark && p.darkColor) ? p.darkColor : p.color;
          const displayLabel = (isDark && p.darkLabel) ? p.darkLabel : p.label;
          return (
            <AnimatedPressable
              key={p.id}
              style={{ alignItems: 'center', gap: 4, width: 62 }}
              onPress={() => patch({ accent: p.id as AccentId })}
              scaleDown={0.92}
            >
              <View style={[{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: displayColor,
                borderWidth: selected ? 3 : 1,
                borderColor: selected ? displayColor : 'rgba(0,0,0,0.08)',
                alignItems: 'center', justifyContent: 'center',
              }, selected && {
                shadowColor: displayColor, shadowOpacity: 0.4, shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }]}>
                {selected && <Ionicons name="checkmark" size={18} color="#fff" />}
              </View>
              <Text style={{
                fontSize: 9, fontWeight: selected ? '800' : '600',
                color: selected ? displayColor : '#8A8AA0',
              }}>
                {displayLabel}
              </Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>
      <Text style={s.scrollHint}>Swipe for more →</Text>
    </View>
  );
}

function SurfacePanel({ pending, patch, theme }: AxisProps) {
  // Appearance mode — Auto / Light / Dark.
  // Auto   = autoDark=true + whatever light surface the user picked
  // Light  = autoDark=false + user's light surface (never a dark surface)
  // Dark   = autoDark=false + a dark surface
  const darkSurfaces = Object.values(SURFACE_PRESETS).filter(sp => sp.dark);
  const lightSurfaces = Object.values(SURFACE_PRESETS).filter(sp => !sp.dark);
  const currentIsDark = SURFACE_PRESETS[pending.surface]?.dark ?? false;

  const mode: 'auto' | 'light' | 'dark' =
    pending.autoDark ? 'auto'
    : currentIsDark ? 'dark'
    : 'light';

  // Which dark surface is active. In 'dark' mode it's pending.surface;
  // in 'auto' mode it's preferredDark (or midnight if unset).
  const activeDarkId: SurfaceId =
    mode === 'dark' ? pending.surface
    : (pending.preferredDark ?? 'midnight');

  function setMode(m: 'auto' | 'light' | 'dark') {
    if (m === 'auto') {
      patch({
        autoDark: true,
        surface: currentIsDark ? 'cloud' : pending.surface,
      });
    } else if (m === 'light') {
      patch({
        autoDark: false,
        surface: currentIsDark ? 'cloud' : pending.surface,
      });
    } else {
      // Switch to dark: pick the user's preferred dark surface or midnight
      patch({ autoDark: false, surface: pending.preferredDark ?? 'midnight' });
    }
  }

  function pickDarkSurface(id: SurfaceId) {
    if (mode === 'dark') {
      patch({ surface: id, preferredDark: id });
    } else {
      // In auto mode, set preferredDark so it applies when system goes dark
      patch({ preferredDark: id });
    }
  }

  const showLightGrid = mode !== 'dark';
  const showDarkGrid  = mode === 'dark' || mode === 'auto';

  return (
    <View style={{ gap: 12, paddingHorizontal: 14 }}>
      {/* Three-way toggle */}
      <View style={s.segRow}>
        {(['auto', 'light', 'dark'] as const).map(m => {
          const active = mode === m;
          const label = m === 'auto' ? 'Auto' : m === 'light' ? 'Light' : 'Dark';
          const icon = m === 'auto' ? 'contrast' : m === 'light' ? 'sunny' : 'moon';
          return (
            <AnimatedPressable
              key={m}
              style={[
                s.segBtn,
                active && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}
              onPress={() => setMode(m)}
              scaleDown={0.96}
            >
              <Ionicons name={icon as any} size={12} color={active ? '#fff' : '#1A1A2E'} />
              <Text style={[s.segBtnText, active && { color: '#fff' }]}>{label}</Text>
            </AnimatedPressable>
          );
        })}
      </View>
      <Text style={s.segHint}>
        {mode === 'auto'
          ? 'Follows your phone. Pick which dark theme below.'
          : mode === 'light'
            ? 'Always light. Pick a surface below.'
            : 'Always dark. Pick a dark theme below.'}
      </Text>

      {/* Light surface grid */}
      {showLightGrid && (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {lightSurfaces.map(sp => {
              const selected = pending.surface === sp.id;
              return (
                <AnimatedPressable
                  key={sp.id}
                  style={[
                    s.surfaceCard,
                    { backgroundColor: sp.bg, borderColor: selected ? theme.accent : sp.border, minWidth: 92 },
                    selected && { borderWidth: 2 },
                  ]}
                  onPress={() => patch({ surface: sp.id as SurfaceId, autoDark: mode === 'auto' })}
                  scaleDown={0.96}
                >
                  <View style={[s.surfaceChip, { backgroundColor: sp.s2 }]} />
                  <View style={[s.surfaceChip, { backgroundColor: sp.s1, width: '70%' }]} />
                  <Text style={[s.surfaceLabel, { color: sp.t1 }]}>{sp.label}</Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
          <Text style={s.scrollHint}>Swipe for more →</Text>
        </View>
      )}

      {/* Dark surface grid — shown in both Dark and Auto modes */}
      {showDarkGrid && (
        <View>
          {mode === 'auto' && (
            <Text style={[s.segHint, { marginBottom: 6 }]}>When dark, use:</Text>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {darkSurfaces.map(sp => {
              const selected = activeDarkId === sp.id;
              return (
                <AnimatedPressable
                  key={sp.id}
                  style={[
                    s.surfaceCard,
                    { backgroundColor: sp.bg, borderColor: selected ? '#FFFFFF' : 'rgba(255,255,255,0.15)', minWidth: 92 },
                    selected && { borderWidth: 2 },
                  ]}
                  onPress={() => pickDarkSurface(sp.id as SurfaceId)}
                  scaleDown={0.96}
                >
                  <View style={[s.surfaceChip, { backgroundColor: sp.s2 }]} />
                  <View style={[s.surfaceChip, { backgroundColor: sp.s1, width: '70%' }]} />
                  <Text style={[s.surfaceLabel, { color: sp.t1 }]}>{sp.label}</Text>
                  <Text style={[s.surfaceSubLabel, { color: sp.t2 }]}>DARK</Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
          <Text style={s.scrollHint}>Swipe for more →</Text>
        </View>
      )}
    </View>
  );
}

function ShapePanel({ pending, patch, theme }: AxisProps) {
  return (
    <View style={s.optionRow}>
      {Object.values(SHAPE_PRESETS).map(sp => {
        const selected = pending.shape === sp.id;
        return (
          <AnimatedPressable
            key={sp.id}
            style={[s.optionCard, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
            onPress={() => patch({ shape: sp.id as ShapeId })}
            scaleDown={0.95}
          >
            <View style={{
              width: 34, height: 34, backgroundColor: selected ? theme.accent : '#D5D8E3',
              borderRadius: sp.sm,
            }} />
            <Text style={[s.optionLabel, selected && { color: theme.accent, fontWeight: '800' }]}>{sp.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function TypePanel({ pending, patch, theme }: AxisProps) {
  // ScrollView-wrapped so four vertically-stacked options never push
  // the phone preview up into the top bar on small screens. Before,
  // the panel grew to fit all four rows and could cover the Close /
  // Save buttons. maxHeight lets the user scroll within the panel.
  return (
    <ScrollView
      style={{ maxHeight: 220 }}
      contentContainerStyle={s.optionColumn}
      showsVerticalScrollIndicator={false}
    >
      {Object.values(TYPE_PRESETS).map(tp => {
        const selected = pending.type === tp.id;
        return (
          <AnimatedPressable
            key={tp.id}
            style={[
              s.optionRowCard,
              { backgroundColor: theme.surface.s2, borderColor: theme.surface.border },
              selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft },
            ]}
            onPress={() => patch({ type: tp.id as TypeId })}
            scaleDown={0.98}
          >
            <View style={{ flex: 1 }}>
              <Text style={{
                fontFamily: tp.display,
                fontWeight: tp.heroWeight,
                letterSpacing: tp.heroTracking,
                fontSize: 18,
                color: selected ? theme.accent : theme.surface.t1,
              }}>
                {tp.label}
              </Text>
              <Text style={{ fontSize: 10, color: theme.surface.t3, marginTop: 2 }}>
                {tp.id === 'dilly' ? 'Cinzel display + system body' :
                 tp.id === 'modern' ? 'All sans, extra condensed' :
                 tp.id === 'editorial' ? 'Serif display, open tracking' :
                 'Rounded display'}
              </Text>
            </View>
            {selected && <Ionicons name="checkmark-circle" size={18} color={theme.accent} />}
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
}

function DensityPanel({ pending, patch, theme }: AxisProps) {
  return (
    <View style={s.optionRow}>
      {Object.values(DENSITY_PRESETS).map(dp => {
        const selected = pending.density === dp.id;
        return (
          <AnimatedPressable
            key={dp.id}
            style={[s.optionCard, { flex: 1 }, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
            onPress={() => patch({ density: dp.id as DensityId })}
            scaleDown={0.97}
          >
            <View style={{ gap: Math.round(6 * dp.scale) }}>
              <View style={{ height: 3, width: 60, backgroundColor: selected ? theme.accent : '#D5D8E3', borderRadius: 2 }} />
              <View style={{ height: 3, width: 48, backgroundColor: selected ? theme.accent : '#D5D8E3', borderRadius: 2 }} />
              <View style={{ height: 3, width: 56, backgroundColor: selected ? theme.accent : '#D5D8E3', borderRadius: 2 }} />
            </View>
            <Text style={[s.optionLabel, selected && { color: theme.accent, fontWeight: '800' }]}>{dp.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function StylePanel({ pending, patch, theme }: AxisProps) {
  // Build a preview gradient stop regardless of whether gradient is
  // currently selected. theme.gradient is null when the user is on
  // solid, so the gradient preview card had nothing to compare
  // against. We simulate the second stop locally here with a simple
  // darker tint so BOTH cards always show a clear visual difference.
  const gradientStop = (() => {
    // Parse #RRGGBB to rgb and darken by ~30%.
    const hex = theme.accent.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const dr = Math.max(0, Math.round(r * 0.65));
    const dg = Math.max(0, Math.round(g * 0.65));
    const db = Math.max(0, Math.round(b * 0.65));
    return `rgb(${dr}, ${dg}, ${db})`;
  })();

  return (
    <View style={s.optionRow}>
      {Object.values(ACCENT_STYLE_PRESETS).map(asp => {
        const selected = pending.accentStyle === asp.id;
        return (
          <AnimatedPressable
            key={asp.id}
            style={[s.optionCard, { flex: 1 }, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
            onPress={() => patch({ accentStyle: asp.id as AccentStyleId })}
            scaleDown={0.97}
          >
            {/* Larger swatch so the difference is obvious: 120x36
                with sharper gradient rendering. Solid is one flat
                color; gradient fades from accent to 35%-darker over
                the full width for a clear left-to-right transition. */}
            <View style={{
              width: 120, height: 36, borderRadius: 8,
              backgroundColor: theme.accent,
              overflow: 'hidden',
            }}>
              {asp.id === 'gradient' && (
                <>
                  {/* 4-stop fake gradient built from overlapping
                      translucent rectangles. RN doesn't have a
                      gradient primitive out of the box; this reads
                      as a smooth left->right fade. */}
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%', backgroundColor: theme.accent }} />
                  <View style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: '40%', backgroundColor: theme.accent, opacity: 0.7 }} />
                  <View style={{ position: 'absolute', left: '55%', top: 0, bottom: 0, width: '45%', backgroundColor: gradientStop, opacity: 0.85 }} />
                  <View style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: '25%', backgroundColor: gradientStop }} />
                </>
              )}
            </View>
            <Text style={[s.optionLabel, { color: theme.surface.t1 }, selected && { color: theme.accent, fontWeight: '800' }]}>{asp.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Styles                                                          */
/* ─────────────────────────────────────────────────────────────── */

/**
 * AdvisorPanel — Chapter persona picker.
 *
 * Not a theme-config axis. Saves to profile.advisor_persona via
 * /profile PATCH so the Chapter prompt on the backend can inject
 * the matching persona block (see dilly_core/chapter_persona.py).
 * Three options plus default (unset). Default keeps the current
 * neutral advisor voice. Picking warm / sharp / direct reshapes
 * how every future Chapter reads for this user.
 */
function AdvisorPanel({ theme, pulseSaved }: { theme: ResolvedTheme; pulseSaved: () => void }) {
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Hydrate from profile on mount so the current pick shows active.
  useEffect(() => {
    (async () => {
      try {
        const p: any = await dilly.get('/profile');
        setSelected(String(p?.advisor_persona || '').toLowerCase());
      } catch (_e) {
        // Fail soft — leave blank. User can still pick.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const OPTIONS: Array<{ id: string; title: string; blurb: string; icon: any }> = [
    { id: '',       title: 'Default',
      blurb: 'Balanced advisor voice. Warm but honest. No strong lean.',
      icon: 'ellipsis-horizontal' },
    { id: 'warm',   title: 'Warmer',
      blurb: 'Leads with what is working. Pairs hard truths with belief in you. Ends forward, not flat.',
      icon: 'heart' },
    { id: 'sharp',  title: 'Sharper',
      blurb: 'The honest mirror. Lean hard on the question you are avoiding. Rigorous, not mean.',
      icon: 'flash' },
    { id: 'direct', title: 'Direct',
      blurb: 'Sixty-second version. No preamble, no soft landing. Every sentence is a move.',
      icon: 'return-down-forward' },
  ];

  const commit = async (id: string) => {
    // Optimistic — paint the new selection instantly, pulse the
    // Saved badge, then write to the server. If the write fails we
    // silently roll the selection back so the user notices next
    // Chapter that nothing changed. Matches the other axes' feel.
    const prev = selected;
    setSelected(id);
    pulseSaved();
    try {
      const res = await dilly.fetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ advisor_persona: id || null }),
      });
      if (!res.ok) setSelected(prev);
    } catch (_e) {
      setSelected(prev);
    }
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: 40, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: theme.surface.t3 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      <Text style={{ fontSize: 12, color: theme.surface.t2, fontFamily: theme.type.body, lineHeight: 18, marginBottom: 4 }}>
        How do you want Dilly to advise you in your weekly Chapter?
      </Text>
      {OPTIONS.map(o => {
        const active = o.id === selected;
        return (
          <AnimatedPressable
            key={o.id || 'default'}
            onPress={() => commit(o.id)}
            scaleDown={0.98}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              padding: 14,
              borderRadius: theme.shape.md,
              backgroundColor: active ? theme.accentSoft : theme.surface.s1,
              borderWidth: 1,
              borderColor: active ? theme.accent : theme.surface.border,
            }}
          >
            <View style={{
              width: 32, height: 32, borderRadius: 16,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: active ? theme.accent : theme.surface.s2,
            }}>
              <Ionicons name={o.icon} size={14} color={active ? '#FFFFFF' : theme.surface.t3} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 14, fontWeight: '800',
                color: active ? theme.accent : theme.surface.t1,
                fontFamily: theme.type.body,
                marginBottom: 3,
              }}>
                {o.title}
              </Text>
              <Text style={{
                fontSize: 12, lineHeight: 17,
                color: theme.surface.t2,
                fontFamily: theme.type.body,
              }}>
                {o.blurb}
              </Text>
            </View>
            {active ? (
              <Ionicons name="checkmark-circle" size={16} color={theme.accent} style={{ marginTop: 2 }} />
            ) : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
    // Always above the phone preview — on short screens the preview
    // could overflow its container and paint over the close button.
    // Explicit zIndex + solid background guards against that.
    zIndex: 10,
    backgroundColor: '#FFFFFF',
  },
  topTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A2E', letterSpacing: 0.2 },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  screenPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  screenPickerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F7F8FC', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  screenPickerLabel: { flex: 1, fontSize: 12, color: '#1A1A2E' },
  surpriseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  surpriseBtnText: { fontSize: 11, fontWeight: '800' },

  previewWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F2F8',
    paddingVertical: 10,
  },
  previewPhone: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 5,
    borderWidth: 4, borderColor: '#1A1A2E',
  },

  panel: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
    paddingTop: 10,
  },

  axisRow: {
    paddingHorizontal: 12, gap: 6, paddingBottom: 8,
  },
  axisTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#F7F8FC',
  },
  axisTabText: { fontSize: 11, fontWeight: '700', color: '#1A1A2E' },

  axisContent: { minHeight: 120, paddingTop: 6 },

  swatchGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 14, paddingVertical: 6, justifyContent: 'space-evenly',
  },
  swatchRow: {
    gap: 12, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center',
  },
  scrollHint: {
    fontSize: 10, fontWeight: '700', color: '#8A8AA0',
    letterSpacing: 0.4, textAlign: 'right',
    paddingHorizontal: 14, marginTop: 4,
  },
  // Auto/Light/Dark segmented control.
  segRow: {
    flexDirection: 'row', gap: 6,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#F7F8FC',
  },
  segBtnText: { fontSize: 12, fontWeight: '700', color: '#1A1A2E' },
  segHint: { fontSize: 11, color: '#8A8AA0', lineHeight: 15 },

  surfaceCard: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    padding: 12, gap: 6, minHeight: 86,
  },
  surfaceChip: { height: 6, borderRadius: 3, width: '100%' },
  surfaceLabel: { fontSize: 11, fontWeight: '800', marginTop: 6 },
  surfaceSubLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 1 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 2,
  },
  toggleLabel: { fontSize: 12, fontWeight: '700', color: '#1A1A2E' },
  toggleHint: { fontSize: 10, color: '#8A8AA0', marginTop: 2 },
  toggle: {
    width: 40, height: 22, borderRadius: 11,
    backgroundColor: '#D5D8E3', padding: 2,
  },
  toggleDot: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
  },

  optionRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 14, flexWrap: 'wrap',
  },
  optionColumn: { gap: 6, paddingHorizontal: 14 },
  optionCard: {
    flex: 1, minWidth: 80, alignItems: 'center', gap: 8,
    padding: 10, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#F7F8FC',
  },
  optionRowCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#F7F8FC',
  },
  optionLabel: { fontSize: 11, fontWeight: '700', color: '#1A1A2E' },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, marginTop: 6,
  },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  resetBtnText: { fontSize: 11, fontWeight: '700', color: '#8A8AA0' },

  sheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 18, paddingBottom: 34,
  },
  sheetTitle: {
    fontSize: 11, fontWeight: '800', color: '#8A8AA0',
    letterSpacing: 1.4, marginBottom: 10,
  },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10,
    marginBottom: 4,
  },
  sheetRowText: { fontSize: 14, color: '#1A1A2E', fontWeight: '600' },
});
