/**
 * ArenaTile - one-line card used in the 2x2 (or 2x3) grid below the
 * hero on each arena mode. Every tool that is not the centerpiece
 * reads as a tile.
 *
 * Style: subdued by default (border only), accent-tinted when the
 * tool has a live signal worth calling out ("3 threats updated",
 * "prep a new role"). Caller passes a `signal` string to trigger the
 * ambient state.
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useResolvedTheme } from '../../hooks/useTheme'

interface Props {
  icon: keyof typeof import('@expo/vector-icons/build/Ionicons').default.glyphMap | string
  title: string
  subtitle: string
  onPress: () => void
  /** Short live status line (e.g. "3 new signals"). Triggers accent
   *  tinting so the user sees which tiles have something fresh. */
  signal?: string | null
}

export default function ArenaTile({ icon, title, subtitle, onPress, signal }: Props) {
  const theme = useResolvedTheme()
  const live = !!signal
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        s.wrap,
        live
          ? { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }
          : { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
      ]}
    >
      <View style={[s.iconWrap, { backgroundColor: live ? theme.accent : theme.surface.s2 }]}>
        <Ionicons name={icon as any} size={18} color={live ? '#FFFFFF' : theme.surface.t2} />
      </View>
      <Text style={[s.title, { color: theme.surface.t1 }]} numberOfLines={1}>{title}</Text>
      <Text style={[s.sub, { color: theme.surface.t3 }]} numberOfLines={2}>{subtitle}</Text>
      {signal ? (
        <Text style={[s.signal, { color: theme.accent }]} numberOfLines={1}>{signal}</Text>
      ) : null}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  wrap: {
    width: '48.5%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    minHeight: 130,
  },
  iconWrap: {
    width: 34, height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  sub: { fontSize: 11, fontWeight: '600', marginTop: 3, lineHeight: 15 },
  signal: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 8 },
})
