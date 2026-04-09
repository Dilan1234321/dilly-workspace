import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../lib/dilly';
import { colors } from '../lib/tokens';
import AnimatedPressable from './AnimatedPressable';

const GOLD = '#2B3A8E';
const GREEN = '#34C759';
const BLUE = '#0A84FF';
const AMBER = '#FF9F0A';

interface InterestGroup {
  label: string;
  interests: string[];
}

interface Props {
  selected: string[];
  onChange: (interests: string[]) => void;
  autoPopulated?: string[];  // majors/minors that are pre-selected (shown with a badge)
  maxVisible?: number;       // how many to show before "Show more" (per group)
  excluded?: string[];       // hide these from the list (e.g. user's primary cohort)
}

export default function InterestsPicker({ selected, onChange, autoPopulated = [], maxVisible = 20, excluded = [] }: Props) {
  const [allInterests, setAllInterests] = useState<string[]>([]);
  const [groups, setGroups] = useState<InterestGroup[]>([]);
  const [recommended, setRecommended] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await dilly.fetch('/interests/list');
        const data = await res.json();
        setAllInterests(data.interests || []);
        if (Array.isArray(data.groups) && data.groups.length > 0) {
          setGroups(data.groups);
        }
        if (Array.isArray(data.recommended)) {
          setRecommended(data.recommended);
        }
      } catch {
        setAllInterests([
          'Software Engineering & CS', 'Data Science & Analytics', 'Finance & Accounting',
          'Marketing & Advertising', 'Healthcare & Clinical', 'Design & Creative Arts',
          'Consulting & Strategy', 'Cybersecurity & IT', 'Life Sciences & Research',
        ]);
      }
      finally { setLoading(false); }
    })();
  }, []);

  const excludedLower = excluded.map(e => (e || '').toLowerCase().trim()).filter(Boolean);
  const isExcluded = (i: string) => excludedLower.includes((i || '').toLowerCase().trim());
  const matchesSearch = (i: string) =>
    !search.trim() || i.toLowerCase().includes(search.toLowerCase());

  function toggle(interest: string) {
    if (selected.includes(interest)) {
      onChange(selected.filter(s => s !== interest));
    } else {
      onChange([...selected, interest]);
    }
  }

  function renderChip(interest: string) {
    if (isExcluded(interest)) return null;
    if (!matchesSearch(interest)) return null;
    const isSelected = selected.includes(interest);
    const isAuto = autoPopulated.includes(interest);
    const isRec = recommended.includes(interest) && !isSelected;
    return (
      <AnimatedPressable
        key={interest}
        style={[
          s.chip,
          isSelected && s.chipSelected,
          isAuto && isSelected && s.chipAuto,
          isRec && s.chipRecommended,
        ]}
        onPress={() => toggle(interest)}
        scaleDown={0.95}
      >
        <Text style={[
          s.chipText,
          isSelected && s.chipTextSelected,
          isAuto && isSelected && { color: GREEN },
          isRec && { color: AMBER },
        ]}>
          {interest}
        </Text>
        {isAuto && isSelected && (
          <Ionicons name="school" size={10} color={GREEN} />
        )}
        {isSelected && !isAuto && (
          <Ionicons name="checkmark" size={10} color={GOLD} />
        )}
        {isRec && (
          <Ionicons name="sparkles" size={9} color={AMBER} />
        )}
      </AnimatedPressable>
    );
  }

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="small" color={GOLD} />
      </View>
    );
  }

  // If we have groups, render grouped; otherwise flat
  const hasGroups = groups.length > 0;
  const hasSearch = search.trim().length > 0;

  // Recommended interests that the user hasn't selected yet
  const unselectedRecs = recommended.filter(r => !selected.includes(r) && !isExcluded(r));

  return (
    <View style={s.container}>
      {/* Search */}
      <View style={s.searchWrap}>
        <Ionicons name="search" size={14} color={colors.t3} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search fields..."
          placeholderTextColor={colors.t3}
        />
        {search.length > 0 && (
          <AnimatedPressable onPress={() => setSearch('')} scaleDown={0.9} hitSlop={8}>
            <Ionicons name="close-circle" size={14} color={colors.t3} />
          </AnimatedPressable>
        )}
      </View>

      {/* Selected count */}
      {selected.length > 0 && (
        <Text style={s.selectedCount}>{selected.length} selected</Text>
      )}

      {/* Recommended for you — only if there are unselected recs and no search */}
      {unselectedRecs.length > 0 && !hasSearch && (
        <View style={s.recSection}>
          <View style={s.recHeader}>
            <Ionicons name="sparkles" size={11} color={AMBER} />
            <Text style={s.recLabel}>RECOMMENDED FOR YOU</Text>
          </View>
          <View style={s.chipGrid}>
            {unselectedRecs.slice(0, 5).map(renderChip)}
          </View>
        </View>
      )}

      {/* Grouped layout */}
      {hasGroups && !hasSearch ? (
        groups.map((group) => {
          const visible = group.interests.filter(i => !isExcluded(i));
          if (visible.length === 0) return null;
          return (
            <View key={group.label} style={s.groupSection}>
              <Text style={s.groupLabel}>{group.label.toUpperCase()}</Text>
              <View style={s.chipGrid}>
                {visible.map(renderChip)}
              </View>
            </View>
          );
        })
      ) : (
        /* Flat layout (search results or fallback) */
        <View style={s.chipGrid}>
          {(showAll
            ? allInterests.filter(i => !isExcluded(i) && matchesSearch(i))
            : allInterests.filter(i => !isExcluded(i) && matchesSearch(i)).slice(0, maxVisible)
          ).map(renderChip)}
        </View>
      )}

      {!hasGroups && !showAll && allInterests.filter(i => !isExcluded(i) && matchesSearch(i)).length > maxVisible && (
        <AnimatedPressable style={s.showMore} onPress={() => setShowAll(true)} scaleDown={0.97}>
          <Text style={s.showMoreText}>
            Show {allInterests.filter(i => !isExcluded(i) && matchesSearch(i)).length - maxVisible} more
          </Text>
          <Ionicons name="chevron-down" size={12} color={BLUE} />
        </AnimatedPressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {},
  loadingWrap: { padding: 20, alignItems: 'center' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.s2, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.t1, paddingVertical: 0 },

  selectedCount: { fontSize: 10, color: GOLD, fontWeight: '600', marginBottom: 8 },

  // Recommended section
  recSection: { marginBottom: 16 },
  recHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8,
  },
  recLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.1,
    color: AMBER,
  },

  // Group section
  groupSection: { marginBottom: 14 },
  groupLabel: {
    fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.1,
    color: colors.t3, marginBottom: 8,
  },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.s3, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 10, paddingVertical: 7,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  chipSelected: {
    backgroundColor: GOLD + '25', borderColor: GOLD + '60',
  },
  chipAuto: {
    backgroundColor: GREEN + '10', borderColor: GREEN + '30',
  },
  chipRecommended: {
    backgroundColor: AMBER + '10', borderColor: AMBER + '30',
  },
  chipText: { fontSize: 12, color: colors.t3, fontWeight: '500' },
  chipTextSelected: { color: GOLD, fontWeight: '600' },

  showMore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, marginTop: 6,
  },
  showMoreText: { fontSize: 12, color: BLUE, fontWeight: '600' },
});
