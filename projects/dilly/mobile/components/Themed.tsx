/**
 * Themed primitives — drop-in replacements for common View/Button/
 * TextInput patterns that actually read the user's ResolvedTheme.
 *
 * Use these on hero surfaces (homes, profile header, chat bubbles,
 * Forge / Room done panels). Everything else can keep the static
 * tokens — we deliberately don't blanket-swap the whole app, that
 * would destroy the signature look of the dark Room / dark Arena
 * (which are intentional per-screen decisions, not user preferences).
 *
 * Reads:
 *   accent, accentSoft, accentBorder : from useResolvedTheme()
 *   surface.bg / s1 / s2 / t1 / ...  : honors user's surface pick
 *                                       + auto-dark on system dark
 *   shape.sm / md / lg               : sharp / standard / rounded / pill
 *   density                          : 1.0 or 0.82 multiplier
 *   type.body / display / hero*      : font pairing
 */

import { forwardRef, ReactNode } from 'react';
import {
  View, Text, TextInput, StyleSheet, ViewStyle, TextStyle,
  Pressable, PressableProps, TextInputProps,
} from 'react-native';
import { useResolvedTheme, type ResolvedTheme } from '../hooks/useTheme';
import AnimatedPressable from './AnimatedPressable';

/* ─────────────────────────────────────────────────────────────── */
/* Density-aware spacing                                            */
/* ─────────────────────────────────────────────────────────────── */

/** Scales a number by the current density multiplier. */
export function useScale() {
  const t = useResolvedTheme();
  return (n: number) => Math.round(n * t.density);
}

/** Full spacing scale, density-adjusted. Drop-in replacement for the
 *  static spacing tokens on themed surfaces. */
export function useSpacing() {
  const t = useResolvedTheme();
  const m = t.density;
  return {
    xs: Math.round(4 * m),
    sm: Math.round(8 * m),
    md: Math.round(12 * m),
    lg: Math.round(16 * m),
    xl: Math.round(20 * m),
    xxl: Math.round(28 * m),
  };
}

/* ─────────────────────────────────────────────────────────────── */
/* Themed surfaces                                                  */
/* ─────────────────────────────────────────────────────────────── */

interface ThemedCardProps {
  children?: ReactNode;
  /** sm | md | lg — defaults to md. */
  radius?: 'sm' | 'md' | 'lg';
  /** 'bg' | 's1' | 's2' — defaults to s1 (card on bg). */
  level?: 'bg' | 's1' | 's2';
  /** true to draw the default border, false to skip. */
  bordered?: boolean;
  /** Accent tint — card bg becomes accent+10%, border accent+30%. */
  accentTinted?: boolean;
  style?: ViewStyle;
}

export function ThemedCard({ children, radius = 'md', level = 's1', bordered = true, accentTinted, style }: ThemedCardProps) {
  const t = useResolvedTheme();
  const sp = useSpacing();
  const bg = accentTinted ? t.accentSoft : t.surface[level];
  const borderColor = accentTinted ? t.accentBorder : t.surface.border;
  return (
    <View style={[{
      backgroundColor: bg,
      borderRadius: t.shape[radius],
      borderWidth: bordered ? 1 : 0,
      borderColor,
      padding: sp.lg,
    }, style]}>
      {children}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Themed text                                                      */
/* ─────────────────────────────────────────────────────────────── */

type ThemedTextVariant = 'hero' | 'heading' | 'body' | 'caption' | 'eyebrow';

interface ThemedTextProps {
  variant?: ThemedTextVariant;
  /** 't1' (primary) | 't2' (secondary) | 't3' (tertiary) | 'accent'. */
  tone?: 't1' | 't2' | 't3' | 'accent';
  style?: TextStyle;
  children?: ReactNode;
  numberOfLines?: number;
}

export function ThemedText({ variant = 'body', tone = 't1', style, children, numberOfLines }: ThemedTextProps) {
  const t = useResolvedTheme();
  const color = tone === 'accent' ? t.accent : t.surface[tone];
  const base: TextStyle = (() => {
    switch (variant) {
      case 'hero':    return { fontFamily: t.type.display, fontSize: 24, fontWeight: t.type.heroWeight, letterSpacing: t.type.heroTracking, lineHeight: 30, color };
      case 'heading': return { fontFamily: t.type.display, fontSize: 17, fontWeight: '800', letterSpacing: -0.2, color };
      case 'eyebrow': return { fontFamily: t.type.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.6, color };
      case 'caption': return { fontFamily: t.type.body, fontSize: 11, fontWeight: '600', color };
      case 'body':
      default:        return { fontFamily: t.type.body, fontSize: 13, lineHeight: 20, color };
    }
  })();
  return <Text style={[base, style]} numberOfLines={numberOfLines}>{children}</Text>;
}

/* ─────────────────────────────────────────────────────────────── */
/* Themed CTA button                                                */
/* ─────────────────────────────────────────────────────────────── */

interface ThemedButtonProps {
  onPress: () => void;
  label: string;
  /** 'primary' fills with accent, 'soft' uses accentSoft, 'ghost' is text-only. */
  variant?: 'primary' | 'soft' | 'ghost';
  icon?: ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
}

export function ThemedButton({ onPress, label, variant = 'primary', icon, disabled, style }: ThemedButtonProps) {
  const t = useResolvedTheme();
  const sp = useSpacing();

  // Gradient stack: render a base solid layer + a gradient-overlay
  // slice on the right side when accentStyle === 'gradient'. Matches
  // the MockFrame's gradient trick so Customize preview matches real.
  const bg = variant === 'primary' ? t.accent : variant === 'soft' ? t.accentSoft : 'transparent';
  const fg = variant === 'primary' ? '#FFFFFF' : t.accent;
  const borderColor = variant === 'ghost' ? t.accentBorder : 'transparent';
  const showGradient = variant === 'primary' && t.gradient;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      scaleDown={0.96}
      style={[{
        backgroundColor: bg,
        borderRadius: t.shape.sm,
        borderWidth: variant === 'ghost' ? 1 : 0,
        borderColor,
        paddingVertical: sp.md,
        paddingHorizontal: sp.lg,
        overflow: 'hidden',
        opacity: disabled ? 0.4 : 1,
      }, style]}
    >
      {showGradient && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, bottom: 0, right: 0,
            width: '55%',
            backgroundColor: t.gradient![1],
            opacity: 0.9,
          }}
        />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {icon}
        <Text style={{
          fontFamily: t.type.body,
          color: fg,
          fontSize: 14,
          fontWeight: '800',
          letterSpacing: 0.2,
        }}>
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Themed TextInput                                                 */
/* ─────────────────────────────────────────────────────────────── */

interface ThemedInputProps extends TextInputProps {
  multiline?: boolean;
}

export const ThemedInput = forwardRef<TextInput, ThemedInputProps>(function ThemedInput(props, ref) {
  const t = useResolvedTheme();
  const sp = useSpacing();
  const { style, ...rest } = props;
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={t.surface.t3}
      {...rest}
      style={[
        {
          fontFamily: t.type.body,
          backgroundColor: t.surface.bg,
          color: t.surface.t1,
          borderRadius: t.shape.sm,
          borderWidth: 1,
          borderColor: t.surface.border,
          paddingHorizontal: sp.md,
          paddingVertical: sp.md,
          fontSize: 13,
        },
        style,
      ]}
    />
  );
});

/* ─────────────────────────────────────────────────────────────── */
/* Themed chip                                                      */
/* ─────────────────────────────────────────────────────────────── */

interface ThemedChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accentColor?: string;
}

export function ThemedChip({ label, selected, onPress, accentColor }: ThemedChipProps) {
  const t = useResolvedTheme();
  const color = accentColor || t.accent;
  const bg = selected ? color + '22' : t.surface.s2;
  const border = selected ? color + '55' : t.surface.border;
  const textColor = selected ? color : t.surface.t2;
  const pad = Math.max(5, Math.round(6 * t.density));
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleDown={0.95}
      style={{
        paddingHorizontal: pad + 5,
        paddingVertical: pad,
        borderRadius: t.shape.chip,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
      }}
    >
      <Text style={{
        fontFamily: t.type.body,
        fontSize: 11,
        fontWeight: selected ? '800' : '600',
        color: textColor,
      }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Themed Screen wrapper                                            */
/* ─────────────────────────────────────────────────────────────── */

/** A full-screen View that honors the user's surface background.
 *  Drop around the top of a screen to make the whole scroll area
 *  respect the theme's bg + dark mode. */
export function ThemedScreen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useResolvedTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: t.surface.bg }, style]}>
      {children}
    </View>
  );
}
