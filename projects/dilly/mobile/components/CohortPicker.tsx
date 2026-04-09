/**
 * CohortPicker — full-screen bottom sheet for adding/removing cohorts.
 * Shows all available cohorts from COHORT_META with search, descriptions,
 * and add/remove toggles. Used on the Profile page and New Audit page.
 */

import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, Modal, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COHORT_META } from '../lib/cohorts';
import { colors, spacing, radius } from '../lib/tokens';
import AnimatedPressable from './AnimatedPressable';

const COBALT = '#1652F0';
const ALL_COHORTS = Object.keys(COHORT_META).sort();

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Currently active cohort IDs on the user's profile */
  activeCohorts: string[];
  /** Called when user adds or removes a cohort. Parent does the PATCH. */
  onToggle: (cohortId: string, added: boolean) => void;
  /** Maximum cohorts allowed (default 5) */
  maxCohorts?: number;
}

export default function CohortPicker({ visible, onClose, activeCohorts, onToggle, maxCohorts = 5 }: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_COHORTS;
    const q = search.toLowerCase();
    return ALL_COHORTS.filter(name => {
      const meta = COHORT_META[name];
      return name.toLowerCase().includes(q)
        || (meta?.description || '').toLowerCase().includes(q);
    });
  }, [search]);

  function handleToggle(cohortId: string) {
    const isActive = activeCohorts.includes(cohortId);
    if (isActive) {
      if (activeCohorts.length <= 1) {
        Alert.alert('Cannot remove', 'You need at least one cohort on your profile.');
        return;
      }
      onToggle(cohortId, false);
    } else {
      if (activeCohorts.length >= maxCohorts) {
        Alert.alert('Limit reached', `You can have up to ${maxCohorts} cohorts. Remove one first.`);
        return;
      }
      onToggle(cohortId, true);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>Add Cohorts</Text>
            <AnimatedPressable onPress={onClose} scaleDown={0.9} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.t1} />
            </AnimatedPressable>
          </View>
          <Text style={s.subtitle}>
            Pick the fields you want Dilly to score you against. Your resume is analyzed per cohort.
          </Text>

          {/* Search */}
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.t3} />
            <TextInput
              style={s.searchInput}
              placeholder="Search cohorts..."
              placeholderTextColor={colors.t3}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <AnimatedPressable onPress={() => setSearch('')} scaleDown={0.9} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.t3} />
              </AnimatedPressable>
            )}
          </View>

          {/* Cohort list */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
            {filtered.map(name => {
              const meta = COHORT_META[name];
              const isActive = activeCohorts.includes(name);
              return (
                <AnimatedPressable
                  key={name}
                  style={[s.row, isActive && s.rowActive]}
                  onPress={() => handleToggle(name)}
                  scaleDown={0.98}
                >
                  <View style={[s.checkCircle, isActive && s.checkCircleActive]}>
                    {isActive && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowName, isActive && { color: COBALT }]} numberOfLines={1}>{name}</Text>
                    {meta && <Text style={s.rowDesc} numberOfLines={2}>{meta.description}</Text>}
                  </View>
                </AnimatedPressable>
              );
            })}
            {filtered.length === 0 && (
              <Text style={s.emptyText}>No cohorts match "{search}"</Text>
            )}
          </ScrollView>

          {/* Active count */}
          <View style={s.footer}>
            <Text style={s.footerText}>
              {activeCohorts.length} cohort{activeCohorts.length !== 1 ? 's' : ''} selected
            </Text>
            <AnimatedPressable style={s.doneBtn} onPress={onClose} scaleDown={0.97}>
              <Text style={s.doneBtnText}>Done</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.t1,
  },
  subtitle: {
    fontSize: 13,
    color: colors.t2,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.s2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.t1,
    padding: 0,
  },
  list: {
    gap: 6,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.s1,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  rowActive: {
    backgroundColor: COBALT + '08',
    borderColor: COBALT + '30',
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.b2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    backgroundColor: COBALT,
    borderColor: COBALT,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.t1,
  },
  rowDesc: {
    fontSize: 11,
    color: colors.t3,
    lineHeight: 15,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: colors.t3,
    textAlign: 'center',
    paddingVertical: 40,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.b1,
  },
  footerText: {
    fontSize: 13,
    color: colors.t2,
    fontWeight: '500',
  },
  doneBtn: {
    backgroundColor: COBALT,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
