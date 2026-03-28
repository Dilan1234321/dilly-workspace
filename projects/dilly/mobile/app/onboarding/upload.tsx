import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius, spacing } from '../../lib/tokens';

export const PENDING_UPLOAD_KEY = 'dilly_pending_upload';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

function truncateFilename(name: string, max = 28): string {
  if (name.length <= max) return name;
  const idx = name.lastIndexOf('.');
  const ext = idx !== -1 ? name.slice(idx) : '';
  return name.slice(0, max - ext.length - 1) + '…' + ext;
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={pb.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            pb.seg,
            i < current ? pb.done : i === current ? pb.active : pb.inactive,
          ]}
        />
      ))}
    </View>
  );
}

const pb = StyleSheet.create({
  row:      { flexDirection: 'row', gap: 3, paddingHorizontal: spacing.xl, paddingBottom: 4 },
  seg:      { flex: 1, height: 2.5, borderRadius: 999 },
  done:     { backgroundColor: colors.gold },
  active:   { backgroundColor: 'rgba(201,168,76,0.4)' },
  inactive: { backgroundColor: 'rgba(255,255,255,0.08)' },
});

// ── Types ─────────────────────────────────────────────────────────────────────

type ZoneState = 'idle' | 'selected' | 'error_format' | 'error_size';

interface PickedFile {
  name: string;
  size: number;
  uri: string;
  mimeType?: string;
}

// ── Zone icon ─────────────────────────────────────────────────────────────────

function ZoneIcon({ state }: { state: ZoneState }) {
  const isError    = state === 'error_format' || state === 'error_size';
  const isSelected = state === 'selected';

  return (
    <View
      style={[
        s.iconTile,
        {
          backgroundColor: isError ? colors.cdim : isSelected ? colors.gdim : colors.golddim,
          borderColor: isError
            ? 'rgba(255,69,58,0.4)'
            : isSelected
            ? colors.gbdr
            : colors.goldbdr,
        },
      ]}
    >
      <Ionicons
        name={isError ? 'close' : isSelected ? 'checkmark' : 'cloud-upload-outline'}
        size={22}
        color={isError ? colors.coral : isSelected ? colors.green : colors.gold}
      />
    </View>
  );
}

// ── Pending upload store (module-level, consumed by scanning.tsx) ──────────────

export const pendingUpload: {
  uri:      string | null;
  name:     string | null;
  mimeType: string | null;
} = { uri: null, name: null, mimeType: null };

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const scaleAnim  = useRef(new Animated.Value(1)).current;

  const [zoneState, setZoneState] = useState<ZoneState>('idle');
  const [file, setFile]           = useState<PickedFile | null>(null);

  const isError    = zoneState === 'error_format' || zoneState === 'error_size';
  const isSelected = zoneState === 'selected';

  async function pickFile() {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      const asset = result.assets[0];

      const nameLower = asset.name.toLowerCase();
      if (!nameLower.endsWith('.pdf') && !nameLower.endsWith('.docx')) {
        setFile(null); setZoneState('error_format'); return;
      }
      const size = asset.size ?? 0;
      if (size > 10 * 1024 * 1024) {
        setFile(null); setZoneState('error_size'); return;
      }

      setFile({ name: asset.name, size, uri: asset.uri, mimeType: asset.mimeType });
      setZoneState('selected');
    } catch { /* cancelled */ }
  }

  async function handleContinue() {
    const uri      = file?.uri      ?? null;
    const name     = file?.name     ?? null;
    const mimeType = file?.mimeType ?? null;

    // Module-level (same JS session)
    pendingUpload.uri      = uri;
    pendingUpload.name     = name;
    pendingUpload.mimeType = mimeType;

    // AsyncStorage fallback (survives Fast Refresh / module re-eval)
    await AsyncStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify({ uri, name, mimeType }));

    router.push('/onboarding/scanning');
  }


  const zoneBorderColor = isError
    ? 'rgba(255,69,58,0.55)'
    : isSelected
    ? colors.gbdr
    : 'rgba(201,168,76,0.28)';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Back */}
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={16} color={colors.blue} />
        <Text style={s.backText}>Back</Text>
      </TouchableOpacity>

      <ProgressBar current={3} total={6} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.eyebrow}>Step 3 of 6 · Your resume</Text>
        <Text style={s.heading}>{"Your resume goes in.\nYour future comes out."}</Text>
        <Text style={s.sub}>
          Dilly reads it the way a recruiter does and tells you exactly where you stand.
        </Text>
      </View>

      {/* Upload zone */}
      <Animated.View style={[s.zoneWrap, { transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={pickFile}
          style={[
            s.zone,
            {
              backgroundColor: isError ? colors.cdim : isSelected ? colors.gdim : colors.s3,
              borderColor: zoneBorderColor,
              borderStyle: isSelected ? 'solid' : 'dashed',
            },
          ]}
        >
          <ZoneIcon state={zoneState} />

          {isSelected && file ? (
            <>
              <Text style={s.filename}>{truncateFilename(file.name)}</Text>
              <Text style={s.filesize}>{formatBytes(file.size)}</Text>
              <Text style={s.tapChange}>Tap to change</Text>
            </>
          ) : isError ? (
            <>
              <Text style={s.errorTitle}>
                {zoneState === 'error_size'
                  ? 'That file is too large (max 10MB)'
                  : "That file type isn't supported"}
              </Text>
              <Text style={s.errorSub}>Upload a PDF or DOCX file</Text>
            </>
          ) : (
            <>
              <Text style={s.zonePrimary}>Upload your resume</Text>
              <Text style={s.zoneSub}>Tap to choose a file</Text>
              <View style={s.fmtRow}>
                {['PDF', 'DOCX'].map((fmt) => (
                  <View key={fmt} style={s.fmtPill}>
                    <Text style={s.fmtText}>{fmt}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* CTA */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity style={s.button} onPress={handleContinue} activeOpacity={0.85}>
          <Text style={s.buttonText}>
            {file ? 'Score my resume →' : 'See my Dilly score →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 4,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.blue,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: colors.gold,
    marginBottom: 7,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_900Black',
    fontSize: 22,
    color: colors.t1,
    lineHeight: 27,
    letterSpacing: -0.3,
    marginBottom: 5,
  },
  sub: {
    fontSize: 11,
    color: colors.t2,
    lineHeight: 17,
  },
  zoneWrap: {
    marginHorizontal: spacing.xl,
  },
  zone: {
    borderWidth: 1.5,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    minHeight: 200,
  },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filename: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.t1,
    textAlign: 'center',
  },
  filesize: {
    fontSize: 10,
    color: colors.t3,
    textAlign: 'center',
  },
  tapChange: {
    fontSize: 10,
    color: colors.t3,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.coral,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 10,
    color: colors.t3,
    textAlign: 'center',
  },
  zonePrimary: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.t1,
    textAlign: 'center',
  },
  zoneSub: {
    fontSize: 10,
    color: colors.t3,
    textAlign: 'center',
  },
  fmtRow: {
    flexDirection: 'row',
    gap: 5,
  },
  fmtPill: {
    backgroundColor: colors.s4,
    borderWidth: 1,
    borderColor: colors.b1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  fmtText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.t3,
  },
  ctaWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: 10,
    marginTop: 'auto',
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: 13,
    padding: 13,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1400',
    letterSpacing: -0.1,
  },
});
