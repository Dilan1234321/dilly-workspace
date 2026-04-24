/**
 * ConnectMyDillySection — "Recruiter activity" preview on My Dilly.
 *
 * Shows a compact card with watcher count + a "See all" button into Connect.
 * Gated by CONNECT_FEATURE_ENABLED; renders null when flag is false.
 *
 * Phase 3 wire-up: replace FIXTURE_WATCHERS with real count from
 *   /recruiter/activity?summary=true, fetched in the My Dilly screen's
 *   existing profile fetch pass (or as a separate lazy fetch after mount).
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResolvedTheme } from '../../hooks/useTheme';
import { openConnectOverlay } from '../../hooks/useConnectOverlay';
import { CONNECT_FEATURE_ENABLED } from '../../lib/connectConfig';
import { DillyFace } from '../DillyFace';

// TODO Phase 3: fetch from /recruiter/activity?summary=true
const FIXTURE_WATCHERS = 3;
const FIXTURE_REQUESTS = 2;

export default function ConnectMyDillySection() {
  const theme = useResolvedTheme();

  if (!CONNECT_FEATURE_ENABLED) return null;

  return (
    <View style={[s.container, { borderTopColor: theme.surface.border }]}>
      <View style={s.heading}>
        <Text style={[s.title, { color: theme.surface.t1, fontFamily: theme.type.display }]}>
          Recruiter Activity
        </Text>
        <TouchableOpacity onPress={() => openConnectOverlay()} hitSlop={10}>
          <Text style={[s.seeAll, { color: theme.accent }]}>See all</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => openConnectOverlay({ section: 'home' })}
        activeOpacity={0.85}
      >
        <View style={[s.card, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder, borderRadius: theme.shape.md }]}>
          <View style={s.row}>
            <View style={[s.iconWrap, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
              <Ionicons name="eye-outline" size={16} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.statLabel, { color: theme.surface.t1 }]}>
                <Text style={{ fontWeight: '800', color: theme.accent }}>{FIXTURE_WATCHERS} companies</Text>
                {' '}viewed your profile this week
              </Text>
            </View>
          </View>

          {FIXTURE_REQUESTS > 0 && (
            <View style={[s.row, { marginTop: 10 }]}>
              <View style={[s.iconWrap, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                <Ionicons name="person-add-outline" size={16} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.statLabel, { color: theme.surface.t1 }]}>
                  <Text style={{ fontWeight: '800', color: theme.accent }}>{FIXTURE_REQUESTS} connection requests</Text>
                  {' '}waiting for you
                </Text>
              </View>
              {/* Unread badge */}
              <View style={[s.badge, { backgroundColor: '#EF4444' }]}>
                <Text style={s.badgeText}>{FIXTURE_REQUESTS}</Text>
              </View>
            </View>
          )}

          <View style={[s.cta, { borderTopColor: theme.surface.border }]}>
            <Text style={[s.ctaText, { color: theme.accent }]}>Open Connect</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.accent} />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingTop: 20, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  seeAll: { fontSize: 13, fontWeight: '600' },
  card: { borderWidth: 1, overflow: 'hidden', padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statLabel: { fontSize: 13, lineHeight: 18 },
  badge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 12, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  ctaText: { fontSize: 13, fontWeight: '700' },
});
