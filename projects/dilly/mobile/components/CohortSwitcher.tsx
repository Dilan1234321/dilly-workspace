/**
 * CohortSwitcher — reusable segmented pill for switching between cohort scores.
 * Hidden when the user has only 1 cohort. iOS-native segmented control feel.
 */

import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../lib/tokens';
import type { CohortScore } from '../lib/cohorts';
import AnimatedPressable from './AnimatedPressable';

const COBALT = '#1652F0';

interface Props {
  cohorts: CohortScore[];
  activeIndex: number;
  onSwitch: (index: number) => void;
  /** Compact mode for tight spaces (smaller text, less padding) */
  compact?: boolean;
}

/** Trim long cohort names for pill labels */
function shortLabel(name: string): string {
  // "Data Science & Analytics" → "Data Science"
  // "Software Engineering & CS" → "Software Eng."
  return name
    .replace(/ & (Analytics|Research|IT|CS|Clinical|Policy|Compliance|Strategy|Design|Operations)$/i, '')
    .replace(/Engineering/i, 'Eng.')
    .replace(/Management/i, 'Mgmt.')
    .trim();
}

export default function CohortSwitcher({ cohorts, activeIndex, onSwitch, compact }: Props) {
  // Don't render if 0 or 1 cohort
  if (!cohorts || cohorts.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.scroll}
    >
      {cohorts.map((c, i) => {
        const active = i === activeIndex;
        const levelBadge = c.level === 'major' ? 'MAJOR' : c.level === 'minor' ? 'MINOR' : null;
        return (
          <AnimatedPressable
            key={c.cohort_id}
            style={[
              s.pill,
              compact && s.pillCompact,
              active && s.pillActive,
            ]}
            onPress={() => onSwitch(i)}
            scaleDown={0.95}
          >
            <Text
              style={[
                s.pillText,
                compact && s.pillTextCompact,
                active && s.pillTextActive,
              ]}
              numberOfLines={1}
            >
              {shortLabel(c.display_name)}
            </Text>
            {levelBadge && !compact && (
              <View style={[s.levelBadge, active && s.levelBadgeActive]}>
                <Text style={[s.levelText, active && s.levelTextActive]}>{levelBadge}</Text>
              </View>
            )}
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: 4,
    gap: 8,
    paddingVertical: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  pillCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillActive: {
    backgroundColor: COBALT,
    borderColor: COBALT,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.t2,
  },
  pillTextCompact: {
    fontSize: 11,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  levelBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: colors.s3,
  },
  levelBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  levelText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.t3,
  },
  levelTextActive: {
    color: 'rgba(255,255,255,0.8)',
  },
});
