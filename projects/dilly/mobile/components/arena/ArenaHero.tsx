/**
 * ArenaHero — the big centerpiece card at the top of each arena mode.
 *
 * Shared shell around three very different payloads (Market Value Live
 * for holders, Conviction Builder for seekers, Future Pulse for
 * students). The shell gives us:
 *   - accent-tinted backdrop (feels like the ceremonial surface)
 *   - an eyebrow + title + optional subtitle
 *   - a body area we fill in with the mode-specific visual
 *   - a CTA chip that deep-links to the full centerpiece page
 *
 * The hero is always tappable — tap anywhere → full centerpiece.
 */

import { ReactNode } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useResolvedTheme } from '../../hooks/useTheme'

interface Props {
  eyebrow: string
  title: string
  subtitle?: string
  ctaLabel: string
  onPress: () => void
  children: ReactNode
}

export default function ArenaHero({ eyebrow, title, subtitle, ctaLabel, onPress, children }: Props) {
  const theme = useResolvedTheme()
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[s.wrap, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
    >
      <View style={s.headerRow}>
        <Text style={[s.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
      </View>
      <Text style={[s.title, { color: theme.surface.t1 }]}>{title}</Text>
      {subtitle ? <Text style={[s.subtitle, { color: theme.surface.t2 }]}>{subtitle}</Text> : null}
      <View style={s.body}>{children}</View>
      <View style={[s.cta, { backgroundColor: theme.accent }]}>
        <Text style={s.ctaText}>{ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, lineHeight: 28, marginTop: 6 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  body: { marginTop: 14, marginBottom: 6 },
  cta: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 11,
    marginTop: 12,
  },
  ctaText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
})
