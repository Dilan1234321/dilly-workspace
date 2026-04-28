/**
 * Transcript review — READ-ONLY.
 *
 * Product rule: nobody hand-edits a transcript. Lying about your GPA
 * by typing into a field is way too easy, and the whole point of
 * "Dilly verified your transcript" falls apart if anyone can change
 * the numbers. The ONLY way to update what's shown here is to
 * re-upload the underlying PDF.
 *
 * Everything below is a Text view. No TextInput, no Add/Delete
 * buttons. Re-upload is the single mutation path.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { dilly } from '../../lib/dilly';
import { useResolvedTheme } from '../../hooks/useTheme';
import AnimatedPressable from '../../components/AnimatedPressable';
import { showToast } from '../../lib/globalToast';

interface Course {
  code?: string | null;
  name?: string | null;
  term?: string | null;
  credits?: number | null;
  grade?: string | null;
}

interface TranscriptData {
  uploaded_at?: string | null;
  gpa?: number | null;
  bcpm_gpa?: number | null;
  courses?: Course[];
  honors?: string[];
  major?: string | null;
  minor?: string | null;
  majors?: string[];
  minors?: string[];
  school?: string | null;
  warnings?: string[];
}

export default function TranscriptReviewScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState<TranscriptData | null>(null);

  useEffect(() => { loadTranscript(); }, []);

  async function loadTranscript() {
    setLoading(true);
    try {
      const res = await dilly.get('/profile/transcript');
      setData(res?.transcript ?? null);
    } catch {
      showToast({ message: 'Could not load transcript data.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleReUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setUploading(true);
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/pdf' } as any);
      const res = await dilly.fetch('/profile/transcript', { method: 'POST', body: formData });
      if (res.ok) {
        const body = await res.json();
        if (body.low_confidence) {
          showToast({
            message: body.low_confidence_message ?? 'Transcript uploaded — some fields may be partial. Re-upload a clearer PDF if needed.',
            type: 'info',
          });
        } else {
          showToast({ message: 'Transcript uploaded.', type: 'success' });
        }
        await loadTranscript();
      } else {
        let detail = '';
        try {
          const body = await res.json();
          const raw = body?.detail ?? body?.error ?? body?.message;
          if (typeof raw === 'string') detail = raw.trim();
          else if (raw && typeof raw === 'object') detail = String(raw.message || raw.detail || raw.error || '').trim();
        } catch {}
        showToast({
          message: detail || `Upload failed (${res.status}). Make sure it's a PDF with selectable text.`,
          type: 'error',
          durationMs: 5000,
        });
      }
    } catch (e: any) {
      showToast({ message: e?.message ? `Could not read the file: ${e.message}` : 'Could not read the file.', type: 'error' });
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: theme.surface.bg, paddingTop: insets.top }]}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.replace('/(app)/my-dilly-profile')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={22} color={theme.surface.t2} />
          </TouchableOpacity>
          <Text style={[s.navTitle, { color: theme.surface.t1 }]}>Transcript</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.surface.t3, fontSize: 14 }}>Loading…</Text>
        </View>
      </View>
    );
  }

  const majors = data?.majors && data.majors.length ? data.majors : (data?.major ? [data.major] : []);
  const minors = data?.minors && data.minors.length ? data.minors : (data?.minor ? [data.minor] : []);
  const honors = data?.honors ?? [];
  const courses = data?.courses ?? [];
  const hasAny =
    majors.length || minors.length || honors.length || courses.length ||
    data?.gpa != null || data?.bcpm_gpa != null || !!data?.school;

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.surface.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.replace('/(app)/my-dilly-profile')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={22} color={theme.surface.t2} />
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: theme.surface.t1 }]}>Transcript</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.disclaimer, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Ionicons name="lock-closed" size={14} color={theme.accent} style={{ marginTop: 2 }} />
          <Text style={[s.disclaimerText, { color: theme.accent }]}>
            Your transcript is read-only. The only way to change what's shown here is to re-upload the PDF from your school.
          </Text>
        </View>

        {!hasAny ? (
          <View style={[s.empty, { borderColor: theme.surface.border, backgroundColor: theme.surface.s1 }]}>
            <Ionicons name="document-outline" size={28} color={theme.surface.t3} />
            <Text style={{ color: theme.surface.t1, fontSize: 14, fontWeight: '700', marginTop: 8 }}>
              No transcript on file
            </Text>
            <Text style={{ color: theme.surface.t3, fontSize: 12, marginTop: 4, textAlign: 'center', maxWidth: 280, lineHeight: 17 }}>
              Upload your transcript PDF to fill in your school, GPA, majors, minors, honors, and courses.
            </Text>
          </View>
        ) : (
          <>
            {data?.school ? <ReadOnlyRow theme={theme} label="SCHOOL" value={data.school} /> : null}
            {majors.length ? <ReadOnlyList theme={theme} label="MAJORS" items={majors} /> : null}
            {minors.length ? <ReadOnlyList theme={theme} label="MINORS" items={minors} /> : null}
            {data?.gpa != null ? <ReadOnlyRow theme={theme} label="GPA" value={String(data.gpa)} /> : null}
            {data?.bcpm_gpa != null ? <ReadOnlyRow theme={theme} label="BCPM GPA" value={String(data.bcpm_gpa)} /> : null}
            {honors.length ? <ReadOnlyList theme={theme} label="HONORS & DISTINCTIONS" items={honors} /> : null}

            {courses.length ? (
              <>
                <Text style={[s.label, { color: theme.surface.t3 }]}>COURSES ({courses.length})</Text>
                {courses.map((c, i) => (
                  <View key={i} style={[s.courseCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
                    <View style={s.courseRow}>
                      <Text style={[s.courseCode, { color: theme.surface.t1 }]}>{c.code || '—'}</Text>
                      <View style={{ flex: 1 }} />
                      {c.grade ? (
                        <View style={[s.gradePill, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
                          <Text style={{ fontSize: 11, fontWeight: '900', color: theme.accent, letterSpacing: 0.4 }}>{c.grade}</Text>
                        </View>
                      ) : null}
                    </View>
                    {c.name ? <Text style={[s.courseName, { color: theme.surface.t2 }]} numberOfLines={2}>{c.name}</Text> : null}
                    <View style={s.courseMeta}>
                      {c.term ? <Text style={[s.courseMetaText, { color: theme.surface.t3 }]}>{c.term}</Text> : null}
                      {c.term && c.credits != null ? <Text style={[s.courseMetaText, { color: theme.surface.t3 }]}> · </Text> : null}
                      {c.credits != null ? <Text style={[s.courseMetaText, { color: theme.surface.t3 }]}>{c.credits} cr</Text> : null}
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </>
        )}

        <View style={[s.reuploadSection, { borderColor: theme.surface.border }]}>
          <Text style={[s.reuploadHint, { color: theme.surface.t3 }]}>
            {hasAny
              ? 'Need to update? Upload your latest transcript PDF and Dilly re-parses everything from scratch.'
              : 'Upload the PDF from your school portal. Any official or unofficial transcript PDF with selectable text will work.'}
          </Text>
          <AnimatedPressable
            style={[s.reuploadBtn, { borderColor: theme.surface.border, backgroundColor: theme.surface.s1 }]}
            onPress={handleReUpload}
            disabled={uploading}
            scaleDown={0.97}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={theme.surface.t2} />
            <Text style={{ color: theme.surface.t2, fontSize: 14, marginLeft: 6 }}>
              {uploading ? 'Uploading…' : (hasAny ? 'Re-upload transcript' : 'Upload transcript')}
            </Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ReadOnlyRow({ theme, label, value }: { theme: any; label: string; value: string }) {
  return (
    <>
      <Text style={[s.label, { color: theme.surface.t3 }]}>{label}</Text>
      <View style={[s.fieldRow, { borderColor: theme.surface.border, backgroundColor: theme.surface.s1 }]}>
        <Text style={[s.readOnlyValue, { color: theme.surface.t1 }]}>{value}</Text>
      </View>
    </>
  );
}

function ReadOnlyList({ theme, label, items }: { theme: any; label: string; items: string[] }) {
  return (
    <>
      <Text style={[s.label, { color: theme.surface.t3 }]}>{label}</Text>
      <View style={{ gap: 6, marginBottom: 4 }}>
        {items.map((item, i) => (
          <View key={`${i}-${item}`} style={[s.fieldRow, { borderColor: theme.surface.border, backgroundColor: theme.surface.s1 }]}>
            <Text style={[s.readOnlyValue, { color: theme.surface.t1 }]}>{item}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  navTitle: { fontSize: 16, fontWeight: '700' },
  disclaimer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  disclaimerText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6, marginTop: 16 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  readOnlyValue: { flex: 1, fontSize: 15, fontWeight: '600' },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  courseCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  courseRow: { flexDirection: 'row', alignItems: 'center' },
  courseCode: { fontSize: 13, fontWeight: '900', letterSpacing: 0.4 },
  courseName: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  courseMeta: { flexDirection: 'row', marginTop: 4 },
  courseMetaText: { fontSize: 11, fontWeight: '600' },
  gradePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  reuploadSection: {
    borderTopWidth: 1,
    paddingTop: 20,
    gap: 12,
    marginTop: 28,
  },
  reuploadHint: { fontSize: 13, lineHeight: 19 },
  reuploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
});
