import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { dilly } from '../../lib/dilly';
import { useResolvedTheme } from '../../hooks/useTheme';
import AnimatedPressable from '../../components/AnimatedPressable';

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
  warnings?: string[];
  manually_edited?: Record<string, boolean>;
  last_edited_at?: string | null;
}

export default function TranscriptReviewScreen() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [major, setMajor] = useState('');
  const [minor, setMinor] = useState('');
  const [gpa, setGpa] = useState('');
  const [bcpmGpa, setBcpmGpa] = useState('');
  const [honors, setHonors] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [manuallyEdited, setManuallyEdited] = useState<Record<string, boolean>>({});

  useEffect(() => { loadTranscript(); }, []);

  async function loadTranscript() {
    setLoading(true);
    try {
      const res = await dilly.get('/profile/transcript');
      if (res?.transcript) {
        const t: TranscriptData = res.transcript;
        setMajor(t.major ?? '');
        setMinor(t.minor ?? '');
        setGpa(t.gpa != null ? String(t.gpa) : '');
        setBcpmGpa(t.bcpm_gpa != null ? String(t.bcpm_gpa) : '');
        setHonors((t.honors ?? []).join(', '));
        setCourses(t.courses ?? []);
        setManuallyEdited(t.manually_edited ?? {});
      }
    } catch {
      Alert.alert('Error', 'Could not load transcript data.');
    } finally {
      setLoading(false);
    }
  }

  async function saveField(field: string, value: unknown) {
    setSaving(true);
    try {
      await dilly.fetch('/profile/transcript', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value, manually_edited_fields: [field] }),
      });
      setManuallyEdited(prev => ({ ...prev, [field]: true }));
    } catch {
      // Silent — will retry on next blur
    } finally {
      setSaving(false);
    }
  }

  function updateCourse(idx: number, field: keyof Course, value: string) {
    setCourses(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === 'credits' ? (parseFloat(value) || undefined) : value };
      return next;
    });
  }

  async function handleReUpload() {
    const hasEdits = Object.values(manuallyEdited).some(Boolean);
    if (hasEdits) {
      Alert.alert(
        'Replace transcript?',
        "You've made manual edits — replacing your transcript will reset them. Continue?",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: doUpload },
        ]
      );
    } else {
      doUpload();
    }
  }

  async function doUpload() {
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
          Alert.alert('Heads up', body.low_confidence_message ?? "We parsed your transcript but couldn't find all the details — you can edit them below.");
        }
        await loadTranscript();
      } else {
        Alert.alert('Upload failed', 'Could not read this file. Make sure it\'s a PDF with selectable text (not a photo).');
      }
    } catch {
      Alert.alert('Upload failed', 'Could not read the file.');
    } finally {
      setUploading(false);
    }
  }

  const editedBorder = (field: string) =>
    manuallyEdited[field] ? theme.accent : theme.surface.border;

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
        {saving
          ? <Text style={{ fontSize: 11, color: theme.surface.t3 }}>Saving…</Text>
          : <View style={{ width: 44 }} />}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.disclaimer, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.accent} style={{ marginTop: 1 }} />
          <Text style={[s.disclaimerText, { color: theme.accent }]}>
            Dilly parsed your transcript automatically. Double-check the details below — changes save when you leave a field.
          </Text>
        </View>

        <Text style={[s.label, { color: theme.surface.t3 }]}>MAJOR</Text>
        <View style={[s.fieldRow, { borderColor: editedBorder('transcript_major'), backgroundColor: theme.surface.s1 }]}>
          <TextInput
            style={[s.input, { color: theme.surface.t1 }]}
            value={major}
            onChangeText={setMajor}
            onBlur={() => saveField('transcript_major', major.trim())}
            placeholder="e.g. Biology"
            placeholderTextColor={theme.surface.t3}
            returnKeyType="done"
          />
          {manuallyEdited['transcript_major'] && <View style={[s.editedDot, { backgroundColor: theme.accent }]} />}
        </View>

        <Text style={[s.label, { color: theme.surface.t3 }]}>MINOR</Text>
        <View style={[s.fieldRow, { borderColor: editedBorder('transcript_minor'), backgroundColor: theme.surface.s1 }]}>
          <TextInput
            style={[s.input, { color: theme.surface.t1 }]}
            value={minor}
            onChangeText={setMinor}
            onBlur={() => saveField('transcript_minor', minor.trim())}
            placeholder="e.g. Chemistry"
            placeholderTextColor={theme.surface.t3}
            returnKeyType="done"
          />
          {manuallyEdited['transcript_minor'] && <View style={[s.editedDot, { backgroundColor: theme.accent }]} />}
        </View>

        <Text style={[s.label, { color: theme.surface.t3 }]}>GPA</Text>
        <View style={[s.fieldRow, { borderColor: editedBorder('transcript_gpa'), backgroundColor: theme.surface.s1 }]}>
          <TextInput
            style={[s.input, { color: theme.surface.t1 }]}
            value={gpa}
            onChangeText={setGpa}
            onBlur={() => { const v = parseFloat(gpa); if (!isNaN(v)) saveField('transcript_gpa', v); }}
            placeholder="e.g. 3.85"
            placeholderTextColor={theme.surface.t3}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          {manuallyEdited['transcript_gpa'] && <View style={[s.editedDot, { backgroundColor: theme.accent }]} />}
        </View>

        <Text style={[s.label, { color: theme.surface.t3 }]}>BCPM GPA</Text>
        <View style={[s.fieldRow, { borderColor: editedBorder('transcript_bcpm_gpa'), backgroundColor: theme.surface.s1 }]}>
          <TextInput
            style={[s.input, { color: theme.surface.t1 }]}
            value={bcpmGpa}
            onChangeText={setBcpmGpa}
            onBlur={() => { const v = parseFloat(bcpmGpa); if (!isNaN(v)) saveField('transcript_bcpm_gpa', v); }}
            placeholder="Biology, Chem, Physics, Math GPA"
            placeholderTextColor={theme.surface.t3}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          {manuallyEdited['transcript_bcpm_gpa'] && <View style={[s.editedDot, { backgroundColor: theme.accent }]} />}
        </View>

        <Text style={[s.label, { color: theme.surface.t3 }]}>HONORS & DISTINCTIONS</Text>
        <View style={[s.fieldRow, { borderColor: editedBorder('transcript_honors'), backgroundColor: theme.surface.s1 }]}>
          <TextInput
            style={[s.input, { color: theme.surface.t1 }]}
            value={honors}
            onChangeText={setHonors}
            onBlur={() => saveField('transcript_honors', honors.split(',').map(h => h.trim()).filter(Boolean))}
            placeholder="Comma-separated, e.g. Dean's List"
            placeholderTextColor={theme.surface.t3}
            returnKeyType="done"
          />
          {manuallyEdited['transcript_honors'] && <View style={[s.editedDot, { backgroundColor: theme.accent }]} />}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 }}>
          <Text style={[s.label, { color: theme.surface.t3, marginTop: 0 }]}>COURSES ({courses.length})</Text>
          {manuallyEdited['transcript_courses'] && <View style={[s.editedDot, { backgroundColor: theme.accent }]} />}
        </View>

        {courses.map((c, i) => (
          <View key={i} style={[s.courseCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
            <View style={s.courseRow}>
              <TextInput
                style={[s.courseInput, { color: theme.surface.t1, borderColor: theme.surface.border, flex: 1 }]}
                value={c.code ?? ''}
                onChangeText={v => updateCourse(i, 'code', v)}
                onBlur={() => saveField('transcript_courses', courses)}
                placeholder="Code"
                placeholderTextColor={theme.surface.t3}
              />
              <TextInput
                style={[s.courseInput, { color: theme.surface.t1, borderColor: theme.surface.border, flex: 2 }]}
                value={c.name ?? ''}
                onChangeText={v => updateCourse(i, 'name', v)}
                onBlur={() => saveField('transcript_courses', courses)}
                placeholder="Course name"
                placeholderTextColor={theme.surface.t3}
              />
            </View>
            <View style={s.courseRow}>
              <TextInput
                style={[s.courseInput, { color: theme.surface.t1, borderColor: theme.surface.border, flex: 1 }]}
                value={c.term ?? ''}
                onChangeText={v => updateCourse(i, 'term', v)}
                onBlur={() => saveField('transcript_courses', courses)}
                placeholder="Term"
                placeholderTextColor={theme.surface.t3}
              />
              <TextInput
                style={[s.courseInput, { color: theme.surface.t1, borderColor: theme.surface.border, flex: 1 }]}
                value={c.grade ?? ''}
                onChangeText={v => updateCourse(i, 'grade', v)}
                onBlur={() => saveField('transcript_courses', courses)}
                placeholder="Grade"
                placeholderTextColor={theme.surface.t3}
              />
              <TextInput
                style={[s.courseInput, { color: theme.surface.t1, borderColor: theme.surface.border, flex: 1 }]}
                value={c.credits != null ? String(c.credits) : ''}
                onChangeText={v => updateCourse(i, 'credits', v)}
                onBlur={() => saveField('transcript_courses', courses)}
                placeholder="Cr"
                placeholderTextColor={theme.surface.t3}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                onPress={() => {
                  const next = courses.filter((_, idx) => idx !== i);
                  setCourses(next);
                  saveField('transcript_courses', next);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ justifyContent: 'center', paddingHorizontal: 4 }}
              >
                <Ionicons name="trash-outline" size={16} color={theme.surface.t3} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <AnimatedPressable
          style={[s.addBtn, { borderColor: theme.surface.border }]}
          onPress={() => setCourses(prev => [...prev, { code: '', name: '', term: '', grade: '' }])}
          scaleDown={0.97}
        >
          <Ionicons name="add" size={16} color={theme.surface.t2} />
          <Text style={{ color: theme.surface.t2, fontSize: 14, marginLeft: 4 }}>Add course</Text>
        </AnimatedPressable>

        <View style={[s.reuploadSection, { borderColor: theme.surface.border }]}>
          <Text style={[s.reuploadHint, { color: theme.surface.t3 }]}>
            Upload the PDF from your school portal. Any official or unofficial transcript PDF with selectable text will work.
          </Text>
          <AnimatedPressable
            style={[s.reuploadBtn, { borderColor: theme.surface.border, backgroundColor: theme.surface.s1 }]}
            onPress={handleReUpload}
            disabled={uploading}
            scaleDown={0.97}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={theme.surface.t2} />
            <Text style={{ color: theme.surface.t2, fontSize: 14, marginLeft: 6 }}>
              {uploading ? 'Uploading…' : 'Re-upload transcript'}
            </Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  disclaimerText: { flex: 1, fontSize: 13, lineHeight: 19 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6, marginTop: 16 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 44,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 8 },
  editedDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 8 },
  courseCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 6,
  },
  courseRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  courseInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 28,
  },
  reuploadSection: {
    borderTopWidth: 1,
    paddingTop: 20,
    gap: 12,
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
