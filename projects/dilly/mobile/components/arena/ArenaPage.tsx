/**
 * ArenaPage — the shell used by every arena tool page (12 tiles).
 * Keeps typography/padding consistent so the tools read as one system.
 */

import { ReactNode } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useResolvedTheme } from '../../hooks/useTheme'

interface Props {
  eyebrow: string
  title: string
  subtitle?: string
  children: ReactNode
}

export default function ArenaPage({ eyebrow, title, subtitle, children }: Props) {
  const theme = useResolvedTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 60 }}
    >
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.navigate('/(app)/ai-arena' as any)}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={26} color={theme.surface.t2} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
          <Text style={[s.title, { color: theme.surface.t1 }]}>{title}</Text>
          {subtitle ? <Text style={[s.sub, { color: theme.surface.t2 }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingBottom: 14 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 6 },
})
