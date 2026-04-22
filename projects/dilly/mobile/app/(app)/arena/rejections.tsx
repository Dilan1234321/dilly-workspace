/**
 * Rejection Pattern Map — seeker tile. Reads the user's recent
 * applications + interviews, derives a pattern, names the move.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook } from '../../../lib/arena/cohort-playbook'
import {
  deriveSignals, rejectionPattern,
  type Listing, type Application, type Signals,
} from '../../../lib/arena/signals'

export default function RejectionPatternMap() {
  const theme = useResolvedTheme()
  const [signals, setSignals] = useState<Signals | null>(null)
  const [apps, setApps] = useState<Application[]>([])

  useEffect(() => {
    (async () => {
      const [prof, feedRes, appsRes] = await Promise.all([
        dilly.get('/profile').catch(() => null),
        dilly.get('/v2/internships/feed?readiness=ready&limit=60').catch(() => null),
        dilly.get('/applications').catch(() => null),
      ])
      const p = (prof || {}) as any
      const pb = resolvePlaybook(p.cohorts || [])
      const listings: Listing[] = Array.isArray((feedRes as any)?.listings) ? (feedRes as any).listings : []
      const a: Application[] = Array.isArray(appsRes) ? (appsRes as Application[]) : []
      setSignals(deriveSignals(listings, a, pb))
      setApps(a)
    })()
  }, [])

  const pattern = useMemo(() => signals ? rejectionPattern(signals) : null, [signals])

  return (
    <ArenaPage
      eyebrow="REJECTION · PATTERN MAP"
      title="What your 'no's are telling you."
      subtitle="Rejections are data. The pattern is what matters — not any one call."
    >
      {!signals ? null : pattern ? (
        <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
          <Text style={[s.label, { color: theme.accent }]}>{pattern.label.toUpperCase()}</Text>
          <Text style={[s.diag, { color: theme.surface.t1 }]}>{pattern.diagnosis}</Text>
          <Text style={[s.moveLabel, { color: theme.accent }]}>THIS WEEK'S MOVE</Text>
          <Text style={[s.move, { color: theme.surface.t1 }]}>{pattern.move}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({ initialMessage: `Dilly flagged this pattern in my recent applications: "${pattern.label}". She said: "${pattern.diagnosis}". Help me actually execute on the move: "${pattern.move}".` })}
            style={[s.cta, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="chatbubbles" size={13} color="#FFF" />
            <Text style={s.ctaText}>Work through it with Dilly</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
          <Text style={[s.diag, { color: theme.surface.t2 }]}>
            Not enough rejection data to spot a pattern yet. Log every application + status inside Dilly and a pattern
            surfaces inside 2-3 weeks.
          </Text>
        </View>
      )}

      <Text style={[s.section, { color: theme.surface.t3 }]}>LAST 30 DAYS</Text>
      <View style={[s.statRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
        <Stat theme={theme} big={String(signals?.appsLast14 ?? 0)} label="applied · 14d" />
        <Stat theme={theme} big={String(signals?.rejectionsLast30 ?? 0)} label="rejected · 30d" />
        <Stat theme={theme} big={String(signals?.interviewsCount ?? 0)} label="interviews" />
      </View>

      {/* Recent app list */}
      {apps.length > 0 ? (
        <>
          <Text style={[s.section, { color: theme.surface.t3 }]}>MOST RECENT</Text>
          {apps.slice(0, 5).map((a, i) => (
            <View key={(a.id || i)} style={[s.appRow, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.appCompany, { color: theme.surface.t1 }]} numberOfLines={1}>{a.company || 'Company'}</Text>
                <Text style={[s.appRole, { color: theme.surface.t3 }]} numberOfLines={1}>{a.role || 'Role'}</Text>
              </View>
              <Text style={[s.appStatus, { color: statusColor(a.status, theme) }]}>
                {(a.status || 'applied').toUpperCase()}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </ArenaPage>
  )
}

function statusColor(st: string | undefined, theme: ReturnType<typeof useResolvedTheme>): string {
  const s = (st || '').toLowerCase()
  if (s.includes('offer')) return '#34C759'
  if (s.includes('interview')) return theme.accent
  if (s.includes('reject')) return '#FF453A'
  return theme.surface.t2
}

function Stat({ theme, big, label }: { theme: ReturnType<typeof useResolvedTheme>; big: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.statBig, { color: theme.surface.t1 }]}>{big}</Text>
      <Text style={[s.statLabel, { color: theme.surface.t3 }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, padding: 16, borderRadius: 14, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  diag: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  moveLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginTop: 14 },
  move: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 14 },
  ctaText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  section: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, paddingHorizontal: 20, marginTop: 22, marginBottom: 8 },
  statRow: { flexDirection: 'row', marginHorizontal: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
  statBig: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase' },
  appRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6, padding: 12, borderRadius: 11, borderWidth: 1 },
  appCompany: { fontSize: 13, fontWeight: '800' },
  appRole: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  appStatus: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
})
