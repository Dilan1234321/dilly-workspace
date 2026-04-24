/**
 * ConnectVisibilitySettings — sub-page inside the Connect modal.
 *
 * Controls:
 *   - "Open to Recruiters" master toggle (gates all field-level toggles)
 *   - Per-field visibility: Summary, Skills, Wins, Quotes, Experience, Education
 *   - "Boost for 7 days" button (placeholder — wires to /recruiter/boost in Phase 3)
 *
 * Persistence: AsyncStorage for now.
 * TODO Phase 3: replace AsyncStorage.setItem with /profile PATCH to
 *   { recruiter_visibility: { open, fields } } so settings survive reinstalls
 *   and sync across devices.
 */

import { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { DillyFace } from '../DillyFace';

// Storage key — prefix matches Dilly convention
const STORAGE_KEY = 'dilly_connect_visibility';

interface VisibilitySettings {
  open: boolean;
  summary: boolean;
  skills: boolean;
  wins: boolean;
  quotes: boolean;
  experience: boolean;
  education: boolean;
}

const DEFAULTS: VisibilitySettings = {
  open: false,
  summary: true,
  skills: true,
  wins: true,
  quotes: false,
  experience: true,
  education: true,
};

const FIELDS: { key: keyof Omit<VisibilitySettings, 'open'>; label: string; description: string }[] = [
  { key: 'summary', label: 'Summary', description: 'Your career headline and bio' },
  { key: 'skills', label: 'Skills', description: 'Skill tags and confidence levels' },
  { key: 'wins', label: 'Wins', description: 'Applied, interviews, offers logged' },
  { key: 'quotes', label: 'Quotes', description: 'Standout quotes from your profile' },
  { key: 'experience', label: 'Experience', description: 'Companies, roles, and dates' },
  { key: 'education', label: 'Education', description: 'Schools, majors, graduation year' },
];

export default function ConnectVisibilitySettings({ theme }: { theme: any }) {
  const [settings, setSettings] = useState<VisibilitySettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [boostActive, setBoostActive] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setSettings({ ...DEFAULTS, ...JSON.parse(raw) }); } catch {}
      }
      setLoaded(true);
    });
  }, []);

  async function toggle(key: keyof VisibilitySettings, value: boolean) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // TODO Phase 3: PATCH /profile { recruiter_visibility: next }
  }

  async function handleBoost() {
    if (boostActive || !settings.open) return;
    setBoosting(true);
    // TODO Phase 3: POST /recruiter/boost { days: 7 }
    await new Promise(r => setTimeout(r, 900)); // simulate network
    setBoosting(false);
    setBoostActive(true);
  }

  if (!loaded) {
    return (
      <View style={{ paddingTop: 40, alignItems: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={{ gap: 0 }}>
      {/* Master toggle */}
      <View style={[s.masterCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder, borderRadius: theme.shape.md }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[s.masterLabel, { color: theme.surface.t1, fontFamily: theme.type.display }]}>
            Open to Recruiters
          </Text>
          <Text style={{ fontSize: 12, color: theme.surface.t2, lineHeight: 16 }}>
            Recruiters with matching cohort access can discover your profile. Toggle off to go invisible.
          </Text>
        </View>
        <Switch
          value={settings.open}
          onValueChange={v => toggle('open', v)}
          trackColor={{ false: theme.surface.s3, true: theme.accent }}
          thumbColor={settings.open ? '#fff' : theme.surface.t3}
        />
      </View>

      {/* DillyFace hint when turned on */}
      {settings.open && (
        <View style={[s.onHint, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, borderRadius: theme.shape.sm }]}>
          <DillyFace size={36} mood="happy" ring={false} />
          <Text style={{ flex: 1, fontSize: 12, color: theme.surface.t2, lineHeight: 17 }}>
            You're discoverable. Recruiters searching your cohort can see your profile.
          </Text>
        </View>
      )}

      {/* Field-level toggles */}
      {settings.open && (
        <>
          <Text style={[s.fieldHeading, { color: theme.surface.t2, fontFamily: theme.type.body }]}>
            WHAT THEY SEE
          </Text>
          <View style={[s.fieldCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, borderRadius: theme.shape.md }]}>
            {FIELDS.map((field, i) => (
              <View
                key={field.key}
                style={[
                  s.fieldRow,
                  i < FIELDS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.surface.border },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.surface.t1 }}>{field.label}</Text>
                  <Text style={{ fontSize: 11, color: theme.surface.t3 }}>{field.description}</Text>
                </View>
                <Switch
                  value={settings[field.key]}
                  onValueChange={v => toggle(field.key, v)}
                  trackColor={{ false: theme.surface.s3, true: theme.accent }}
                  thumbColor={settings[field.key] ? '#fff' : theme.surface.t3}
                />
              </View>
            ))}
          </View>
        </>
      )}

      {/* Boost button */}
      <TouchableOpacity
        onPress={handleBoost}
        disabled={!settings.open || boostActive || boosting}
        style={[
          s.boostBtn,
          {
            backgroundColor: boostActive ? '#22c55e' : settings.open ? theme.accent : theme.surface.s2,
            borderRadius: theme.shape.md,
            opacity: !settings.open ? 0.45 : 1,
          },
        ]}
      >
        {boosting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons
              name={boostActive ? 'checkmark-circle' : 'rocket-outline'}
              size={18}
              color="#fff"
            />
            <Text style={s.boostLabel}>
              {boostActive ? 'Boost active — 7 days' : 'Boost for 7 days'}
            </Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={[s.boostNote, { color: theme.surface.t3 }]}>
        {boostActive
          ? 'Your profile is pinned to the top of recruiter searches for 7 days.'
          : settings.open
          ? 'Temporarily pins your profile to the top of recruiter searches.'
          : 'Turn on "Open to Recruiters" to unlock Boost.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  masterCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1, marginBottom: 12 },
  masterLabel: { fontSize: 16, fontWeight: '700' },
  onHint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, marginBottom: 20 },
  fieldHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  fieldCard: { borderWidth: 1, marginBottom: 24, overflow: 'hidden' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  boostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  boostLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  boostNote: { fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17 },
});
