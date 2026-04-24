/**
 * ConnectHomeCard — secondary entry to the Connect surface from Home.
 *
 * Shows a single-line teaser ("3 companies in Finance saved your
 * profile this week →") when CONNECT_FEATURE_ENABLED is true.
 * Taps open the Connect modal.
 *
 * Phase 3 wire-up: replace FIXTURE_COUNT + FIXTURE_FIELD with real
 * data from /recruiter/activity?limit=1 and remove the TODO comment.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from '../AnimatedPressable';
import { openConnectOverlay } from '../../hooks/useConnectOverlay';
import { useResolvedTheme } from '../../hooks/useTheme';

// TODO Phase 3: fetch from /recruiter/activity summary endpoint
const FIXTURE_COUNT = 3;
const FIXTURE_FIELD = 'Finance';

export function ConnectHomeCard() {
  const theme = useResolvedTheme();

  return (
    <AnimatedPressable
      onPress={() => openConnectOverlay({ section: 'home' })}
      scaleDown={0.98}
    >
      <View style={[
        s.card,
        {
          backgroundColor: theme.surface.s1,
          borderColor: theme.accentBorder,
          borderRadius: theme.shape.md,
        },
      ]}>
        <View style={[s.dot, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Ionicons name="eye-outline" size={14} color={theme.accent} />
        </View>
        <Text style={[s.label, { color: theme.surface.t1, fontFamily: theme.type.body }]}>
          <Text style={{ fontWeight: '700', color: theme.accent }}>
            {FIXTURE_COUNT} companies
          </Text>
          {' '}in {FIXTURE_FIELD} saved your profile this week
        </Text>
        <Ionicons name="chevron-forward" size={14} color={theme.surface.t3} />
      </View>
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
