import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
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

interface Props {
  selected: string[];
  onChange: (interests: string[]) => void;
  autoPopulated?: string[];  // majors/minors that are pre-selected (shown with a badge)
  maxVisible?: number;  // how many to show before "Show more"
}

export default function InterestsPicker({ selected, onChange, autoPopulated = [], maxVisible = 20 }: Props) {
  const [allInterests, setAllInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await dilly.fetch('/interests/list');
        const data = await res.json();
        setAllInterests(data.interests || []);
      } catch {
        // Fallback list
        setAllInterests([
          'Computer Science', 'Data Science', 'Business Administration', 'Finance',
          'Marketing', 'Economics', 'Entrepreneurship', 'Software Engineering',
          'Cybersecurity', 'Design', 'Psychology', 'Communications',
        ]);
      }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = search.trim()
    ? allInterests.filter(i => i.toLowerCase().includes(search.toLowerCase()))
    : allInterests;

  const visible = showAll ? filtered : filtered.slice(0, maxVisible);
  const hasMore = !showAll && filtered.length > maxVisible;

  function toggle(interest: string) {
    if (selected.includes(interest)) {
      onChange(selected.filter(s => s !== interest));
    } else {
      onChange([...selected, interest]);
    }
  }

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="small" color={GOLD} />
      </View>
    );
  }

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

      {/* Chips */}
      <View style={s.chipGrid}>
        {visible.map(interest => {
          const isSelected = selected.includes(interest);
          const isAuto = autoPopulated.includes(interest);
          return (
            <AnimatedPressable
              key={interest}
              style={[
                s.chip,
                isSelected && s.chipSelected,
                isAuto && isSelected && s.chipAuto,
              ]}
              onPress={() => toggle(interest)}
              scaleDown={0.95}
            >
              <Text style={[
                s.chipText,
                isSelected && s.chipTextSelected,
                isAuto && isSelected && { color: GREEN },
              ]}>
                {interest}
              </Text>
              {isAuto && isSelected && (
                <Ionicons name="school" size={10} color={GREEN} />
              )}
              {isSelected && !isAuto && (
                <Ionicons name="checkmark" size={10} color={GOLD} />
              )}
            </AnimatedPressable>
          );
        })}
      </View>

      {hasMore && (
        <AnimatedPressable style={s.showMore} onPress={() => setShowAll(true)} scaleDown={0.97}>
          <Text style={s.showMoreText}>Show {filtered.length - maxVisible} more fields</Text>
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
  chipText: { fontSize: 12, color: colors.t3, fontWeight: '500' },
  chipTextSelected: { color: GOLD, fontWeight: '600' },

  showMore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, marginTop: 6,
  },
  showMoreText: { fontSize: 12, color: BLUE, fontWeight: '600' },
});
