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

import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Modal, Pressable,
  Platform, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedPressable from '../../components/AnimatedPressable';
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

type AxisId = 'accent' | 'surface' | 'shape' | 'type' | 'density' | 'style';
const AXES: { id: AxisId; label: string; icon: any }[] = [
  { id: 'accent',  label: 'Accent',  icon: 'color-palette' },
  { id: 'surface', label: 'Surface', icon: 'layers' },
  { id: 'shape',   label: 'Shape',   icon: 'square' },
  { id: 'type',    label: 'Type',    icon: 'text' },
  { id: 'density', label: 'Density', icon: 'resize' },
  { id: 'style',   label: 'Style',   icon: 'sparkles' },
];

export default function CustomizeStudio() {
  const insets = useSafeAreaInsets();
  const committed = useThemeConfig();
  const systemScheme = useColorScheme();
  const systemIsDark = systemScheme === 'dark';

  // PENDING theme — edits stay here until Save.
  const [pending, setPending] = useState<ThemeConfig>(committed);
  const [screen, setScreen] = useState<MockScreenId>('career');
  const [axis, setAxis] = useState<AxisId>('accent');
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);

  const theme: ResolvedTheme = resolveTheme(pending, systemIsDark);
  const dirty = JSON.stringify(pending) !== JSON.stringify(committed);

  function patch(p: Partial<ThemeConfig>) {
    setPending(prev => ({ ...prev, ...p }));
  }

  async function handleSave() {
    await patchTheme(pending);
    router.back();
  }

  async function handleReset() {
    setPending({ ...DEFAULT_CONFIG });
  }

  async function handleSurprise() {
    // Apply surprise-me directly to the pending config so the preview
    // animates. Commit only happens on Save.
    const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    setPending(prev => ({
      ...prev,
      accent: rand(ACCENT_PRESETS).id,
      surface: rand(Object.values(SURFACE_PRESETS)).id,
      shape: rand(Object.values(SHAPE_PRESETS)).id,
      type: rand(Object.values(TYPE_PRESETS)).id,
      accentStyle: rand(Object.values(ACCENT_STYLE_PRESETS)).id,
    }));
  }

  const screenLabel = MOCK_SCREENS.find(s => s.id === screen)?.label || 'Preview';

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: theme.surface.bg }]}>
      {/* Top bar. Reads theme so the Customize studio itself respects
          the user's current surface — on Midnight, the top bar and
          container become dark; on Mint, pastel. */}
      <View style={[s.topBar, { backgroundColor: theme.surface.bg, borderBottomColor: theme.surface.border }]}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={12} scaleDown={0.9}>
          <Ionicons name="close" size={22} color={theme.surface.t1} />
        </AnimatedPressable>
        <Text style={[s.topTitle, { color: theme.surface.t1 }]}>Customize Dilly</Text>
        <AnimatedPressable
          onPress={handleSave}
          scaleDown={0.95}
          style={[s.saveBtn, { backgroundColor: theme.accent }, !dirty && { opacity: 0.4 }]}
          disabled={!dirty}
        >
          <Text style={s.saveBtnText}>Save</Text>
        </AnimatedPressable>
      </View>

      {/* Screen picker */}
      <View style={s.screenPickerRow}>
        <AnimatedPressable
          style={s.screenPickerBtn}
          onPress={() => setScreenPickerOpen(true)}
          scaleDown={0.97}
        >
          <Ionicons name="phone-portrait" size={13} color="#1A1A2E" />
          <Text style={s.screenPickerLabel}>Previewing: <Text style={{ fontWeight: '800' }}>{screenLabel}</Text></Text>
          <Ionicons name="chevron-down" size={14} color="#8A8AA0" />
        </AnimatedPressable>
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
          top bar. maxHeight accounts for: top bar (~56) + screen-picker
          row (~60) + panel (~280) + bottom safe area (~34) so the
          phone never crowds into the Close/Save buttons on short
          screens (SE, older iPhones). */}
      <View style={s.previewWrap}>
        <View style={[s.previewPhone, {
          height: Math.min(360, W * 1.25),
          width: Math.min(210, W * 0.52),
        }]}>
          <MockFrame theme={theme} screen={screen} />
        </View>
      </View>

      {/* Panel */}
      <View style={[s.panel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {/* Axis tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.axisRow}>
          {AXES.map(a => {
            const active = axis === a.id;
            return (
              <AnimatedPressable
                key={a.id}
                style={[
                  s.axisTab,
                  active && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={() => setAxis(a.id)}
                scaleDown={0.95}
              >
                <Ionicons name={a.icon} size={12} color={active ? '#fff' : '#1A1A2E'} />
                <Text style={[s.axisTabText, active && { color: '#fff' }]}>{a.label}</Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        {/* Axis content */}
        <View style={s.axisContent}>
          {axis === 'accent'  && <AccentPanel  pending={pending} patch={patch} theme={theme} />}
          {axis === 'surface' && <SurfacePanel pending={pending} patch={patch} theme={theme} />}
          {axis === 'shape'   && <ShapePanel   pending={pending} patch={patch} theme={theme} />}
          {axis === 'type'    && <TypePanel    pending={pending} patch={patch} theme={theme} />}
          {axis === 'density' && <DensityPanel pending={pending} patch={patch} theme={theme} />}
          {axis === 'style'   && <StylePanel   pending={pending} patch={patch} theme={theme} />}
        </View>

        {/* Footer — reset */}
        <View style={s.footer}>
          <AnimatedPressable onPress={handleReset} scaleDown={0.95} style={s.resetBtn}>
            <Ionicons name="refresh" size={13} color="#8A8AA0" />
            <Text style={s.resetBtnText}>Reset to Dilly default</Text>
          </AnimatedPressable>
        </View>
      </View>

      {/* Screen picker modal */}
      <Modal visible={screenPickerOpen} transparent animationType="fade" onRequestClose={() => setScreenPickerOpen(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setScreenPickerOpen(false)}>
          <View style={s.sheetCard}>
            <Text style={s.sheetTitle}>Preview screen</Text>
            {MOCK_SCREENS.map(ms => {
              const selected = ms.id === screen;
              return (
                <AnimatedPressable
                  key={ms.id}
                  style={[s.sheetRow, selected && { backgroundColor: theme.accentSoft }]}
                  onPress={() => { setScreen(ms.id); setScreenPickerOpen(false); }}
                  scaleDown={0.97}
                >
                  <Text style={[s.sheetRowText, selected && { color: theme.accent, fontWeight: '800' }]}>
                    {ms.label}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color={theme.accent} />}
                </AnimatedPressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
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
          return (
            <AnimatedPressable
              key={p.id}
              style={{ alignItems: 'center', gap: 4, width: 62 }}
              onPress={() => patch({ accent: p.id as AccentId })}
              scaleDown={0.92}
            >
              <View style={[{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: p.color,
                borderWidth: selected ? 3 : 1,
                borderColor: selected ? p.color : 'rgba(0,0,0,0.08)',
                alignItems: 'center', justifyContent: 'center',
              }, selected && {
                shadowColor: p.color, shadowOpacity: 0.4, shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }]}>
                {selected && <Ionicons name="checkmark" size={18} color="#fff" />}
              </View>
              <Text style={{
                fontSize: 9, fontWeight: selected ? '800' : '600',
                color: selected ? p.color : '#8A8AA0',
              }}>
                {p.label}
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
  // Light  = autoDark=false + user's light surface (never midnight)
  // Dark   = autoDark=false + surface='midnight' (overrides light pick)
  const mode: 'auto' | 'light' | 'dark' =
    pending.autoDark ? 'auto'
    : pending.surface === 'midnight' ? 'dark'
    : 'light';

  function setMode(m: 'auto' | 'light' | 'dark') {
    if (m === 'auto') {
      // Going to auto: keep the user's chosen light surface if they
      // had one. If they're currently on midnight, fall back to cloud.
      patch({
        autoDark: true,
        surface: pending.surface === 'midnight' ? 'cloud' : pending.surface,
      });
    } else if (m === 'light') {
      patch({
        autoDark: false,
        surface: pending.surface === 'midnight' ? 'cloud' : pending.surface,
      });
    } else {
      patch({ autoDark: false, surface: 'midnight' });
    }
  }

  // Swatches shown depend on mode. Dark mode only has one surface
  // (Midnight) so we collapse to that. Light/Auto show all the
  // light-family surfaces (Cloud, Cream, Slate + 5 pastels).
  const lightSurfaces = Object.values(SURFACE_PRESETS).filter(sp => !sp.dark);
  const showLightGrid = mode !== 'dark';

  return (
    <View style={{ gap: 12, paddingHorizontal: 14 }}>
      {/* Three-way toggle — Auto / Light / Dark. Pill buttons with
          the active one tinted accent. Always rendered so the user
          sees the other options even if they haven't flipped them. */}
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
          ? 'Follows your phone. Dark when your phone is dark, light when light.'
          : mode === 'light'
            ? 'Always light. Pick a light surface below.'
            : 'Always dark. Midnight surface active.'}
      </Text>

      {/* Light-surface grid. Horizontal scroll so all 8 light
          surfaces (Cloud, Cream, Slate + 5 pastels) are reachable
          without wrapping into many rows. */}
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

      {/* Dark mode explanation when Dark is picked. No grid — there's
          only one dark surface for v1 (Midnight). */}
      {mode === 'dark' && (
        <View style={[s.surfaceCard, { backgroundColor: '#0B0F1E', minWidth: '100%' }]}>
          <View style={[s.surfaceChip, { backgroundColor: '#1D2340' }]} />
          <View style={[s.surfaceChip, { backgroundColor: '#151A2E', width: '70%' }]} />
          <Text style={[s.surfaceLabel, { color: '#E8EAF4' }]}>Midnight</Text>
          <Text style={[s.surfaceSubLabel, { color: 'rgba(232,234,244,0.6)' }]}>DARK</Text>
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
  return (
    <View style={s.optionColumn}>
      {Object.values(TYPE_PRESETS).map(tp => {
        const selected = pending.type === tp.id;
        return (
          <AnimatedPressable
            key={tp.id}
            style={[s.optionRowCard, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
            onPress={() => patch({ type: tp.id as TypeId })}
            scaleDown={0.98}
          >
            <View style={{ flex: 1 }}>
              <Text style={{
                fontFamily: tp.display,
                fontWeight: tp.heroWeight,
                letterSpacing: tp.heroTracking,
                fontSize: 18,
                color: selected ? theme.accent : '#1A1A2E',
              }}>
                {tp.label}
              </Text>
              <Text style={{ fontSize: 10, color: '#8A8AA0', marginTop: 2 }}>
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
    </View>
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
            <View style={{
              width: 80, height: 24, borderRadius: 6,
              backgroundColor: theme.accent,
              overflow: 'hidden',
            }}>
              {asp.id === 'gradient' && (
                <View style={{
                  position: 'absolute', top: 0, bottom: 0, right: 0, width: '55%',
                  backgroundColor: theme.gradient ? theme.gradient[1] : theme.accent,
                  opacity: 0.9,
                }} />
              )}
            </View>
            <Text style={[s.optionLabel, selected && { color: theme.accent, fontWeight: '800' }]}>{asp.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Styles                                                          */
/* ─────────────────────────────────────────────────────────────── */

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
