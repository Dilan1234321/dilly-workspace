import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, API_BASE } from '../lib/tokens';
import { getToken } from '../lib/auth';
import { dilly } from '../lib/dilly';
import * as ImagePicker from 'expo-image-picker';

const GOLD = '#2B3A8E';

interface Props {
  visible: boolean;
  onClose: () => void;
  profile: Record<string, any>;
  photoUri: string | null;
  onSaved: () => void;
}

// \u2500\u2500 Section header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={es.sectionHeader}>
      <Ionicons name={icon as any} size={12} color={GOLD} />
      <Text style={es.sectionLabel}>{label}</Text>
    </View>
  );
}

// \u2500\u2500 Editable field \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function Field({
  label, value, onChangeText, placeholder, multiline, maxLength, hint, disabled, disabledText, autoCapitalize, keyboardType,
}: {
  label: string;
  value?: string;
  onChangeText?: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  hint?: string;
  disabled?: boolean;
  disabledText?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'url' | 'email-address';
}) {
  if (disabled) {
    return (
      <View style={es.fieldGroup}>
        <Text style={es.fieldLabel}>{label}</Text>
        <View style={[es.fieldInput, es.fieldDisabled]}>
          <Text style={es.fieldDisabledText}>{disabledText || ' - '}</Text>
        </View>
        {hint ? <Text style={es.fieldHint}>{hint}</Text> : null}
      </View>
    );
  }

  return (
    <View style={es.fieldGroup}>
      <Text style={es.fieldLabel}>{label}</Text>
      <TextInput
        style={[es.fieldInput, multiline && { minHeight: 64, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={maxLength ? (t => onChangeText?.(t.slice(0, maxLength))) : onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.t3}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        maxLength={maxLength}
        returnKeyType={multiline ? 'default' : 'next'}
      />
      {hint ? <Text style={es.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// \u2500\u2500 Main component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export default function EditProfileModal({ visible, onClose, profile, photoUri, onSaved }: Props) {
  const insets = useSafeAreaInsets();

  // Personal
  const [name,     setName]     = useState('');
  const [pronouns, setPronouns] = useState('');
  const [tagline,  setTagline]  = useState('');
  const [bio,      setBio]      = useState('');

  // Academic
  const [major,    setMajor]    = useState('');
  const [minor,    setMinor]    = useState('');
  const [school,   setSchool]   = useState('');

  // Career
  const [careerGoal,       setCareerGoal]       = useState('');
  const [industryTarget,   setIndustryTarget]   = useState('');
  const [targetCompanies,  setTargetCompanies]  = useState('');
  const [linkedinUrl,      setLinkedinUrl]      = useState('');

  // Preferences
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(true);

  // Photo
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [saving,     setSaving]     = useState(false);

  // Completion tracking
  const [completionPct, setCompletionPct] = useState(0);

  // Reset fields when modal opens
  useEffect(() => {
    if (visible) {
      const p = profile;
      setName(p.name || '');
      setPronouns(p.pronouns || '');
      setTagline(p.profile_tagline || p.custom_tagline || '');
      setBio(p.profile_bio || '');
      setMajor((p.majors?.[0] || p.major) || '');
      setMinor((p.minors?.[0]) || '');
      setSchool(p.school_id === 'utampa' ? 'University of Tampa' : (p.school_id || ''));
      setCareerGoal(p.career_goal || '');
      setIndustryTarget(p.industry_target || '');
      setTargetCompanies((p.target_companies || []).join(', '));
      setLinkedinUrl(p.linkedin_url || '');
      setLeaderboardOptIn(p.leaderboard_opt_in !== false);
      setLocalPhoto(null);
    }
  }, [visible]);

  // Completion percentage
  useEffect(() => {
    const fields = [name, major, tagline, careerGoal, industryTarget, targetCompanies, linkedinUrl, bio];
    const hasPhoto = !!(localPhoto || photoUri);
    const filled = fields.filter(f => f.trim().length > 0).length + (hasPhoto ? 1 : 0);
    const total = fields.length + 1; // +1 for photo
    setCompletionPct(Math.round((filled / total) * 100));
  }, [name, major, tagline, careerGoal, industryTarget, targetCompanies, linkedinUrl, bio, localPhoto, photoUri]);

  const displayPhoto = localPhoto || photoUri;
  const initial = name ? name[0].toUpperCase() : '?';

  // \u2500\u2500 Photo picker \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  async function pickPhoto() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow Dilly to access your photos to set a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setLocalPhoto(asset.uri);

      setUploading(true);
      try {
        const token = await getToken();
        const formData = new FormData();
        const filename = asset.uri.split('/').pop() || 'photo.jpg';
        const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

        formData.append('file', {
          uri: asset.uri,
          name: filename,
          type: mimeType,
        } as any);

        const res = await fetch(`${API_BASE}/profile/photo`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token ?? ''}` },
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Upload failed');
        }
        // Refresh profile page so photoUri updates to the new photo
        onSaved();
      } catch (e: any) {
        Alert.alert('Upload failed', e.message || 'Could not upload photo.');
        setLocalPhoto(null);
      } finally {
        setUploading(false);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not open photo picker.');
    }
  }

  async function removePhoto() {
    Alert.alert('Remove photo?', 'Your profile picture will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await dilly.delete('/profile/photo');
            setLocalPhoto(null);
            onSaved();
          } catch {
            Alert.alert('Error', 'Could not remove photo.');
          }
        },
      },
    ]);
  }

  // \u2500\u2500 Save \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, any> = {};

      // Only send changed fields
      if (name.trim() !== (profile.name || '')) body.name = name.trim();
      if (pronouns.trim() !== (profile.pronouns || '')) body.pronouns = pronouns.trim();
      if (major.trim()) body.majors = [major.trim()];
      if (minor.trim() !== ((profile.minors?.[0]) || '')) {
        body.minors = minor.trim() ? [minor.trim()] : [];
      }
      if (tagline.trim() !== (profile.profile_tagline || '')) body.profile_tagline = tagline.trim();
      if (bio.trim() !== (profile.profile_bio || '')) body.profile_bio = bio.trim();
      if (careerGoal.trim() !== (profile.career_goal || '')) body.career_goal = careerGoal.trim();
      if (industryTarget.trim() !== (profile.industry_target || '')) body.industry_target = industryTarget.trim();

      const newCompanies = targetCompanies.split(',').map(c => c.trim()).filter(Boolean);
      const oldCompanies = (profile.target_companies || []).join(', ');
      if (targetCompanies.trim() !== oldCompanies) body.target_companies = newCompanies;

      if (linkedinUrl.trim() !== (profile.linkedin_url || '')) body.linkedin_url = linkedinUrl.trim();
      if (leaderboardOptIn !== (profile.leaderboard_opt_in !== false)) body.leaderboard_opt_in = leaderboardOptIn;

      if (Object.keys(body).length > 0) {
        const res = await dilly.fetch('/profile', {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Save failed');
        }
      }
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Save failed', e.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  }

  // \u2500\u2500 Render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <View style={[es.root, { backgroundColor: colors.bg }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

          {/* Header */}
          <View style={[es.header, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.t2} />
            </TouchableOpacity>
            <Text style={es.headerTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              {saving ? (
                <ActivityIndicator size="small" color={GOLD} />
              ) : (
                <Text style={es.saveBtn}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={[es.scroll, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

            {/* Completion bar */}
            <View style={es.completionWrap}>
              <View style={es.completionHeader}>
                <Text style={es.completionLabel}>PROFILE STRENGTH</Text>
                <Text style={[es.completionPct, { color: completionPct >= 80 ? '#34C759' : completionPct >= 50 ? GOLD : '#FF9F0A' }]}>
                  {completionPct}%
                </Text>
              </View>
              <View style={es.completionTrack}>
                <View style={[es.completionFill, {
                  width: `${completionPct}%` as any,
                  backgroundColor: completionPct >= 80 ? '#34C759' : completionPct >= 50 ? GOLD : '#FF9F0A',
                }]} />
              </View>
              <Text style={es.completionHint}>
                {completionPct >= 80
                  ? 'Looking strong. Recruiters see a complete profile.'
                  : completionPct >= 50
                  ? 'Getting there. Fill in a few more fields to stand out.'
                  : 'Add more to your profile so recruiters can find you.'}
              </Text>
            </View>

            {/* \u2500\u2500 Photo \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
            <View style={es.photoSection}>
              <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8} style={es.photoWrap}>
                {displayPhoto ? (
                  <Image source={{ uri: displayPhoto }} style={es.photo} />
                ) : (
                  <View style={es.photoPlaceholder}>
                    <Text style={es.photoInitial}>{initial}</Text>
                  </View>
                )}
                <View style={es.cameraBadge}>
                  {uploading ? (
                    <ActivityIndicator size={10} color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={12} color="#fff" />
                  )}
                </View>
              </TouchableOpacity>
              {displayPhoto ? (
                <TouchableOpacity onPress={removePhoto} style={es.removeBtn}>
                  <Text style={es.removeBtnText}>Remove photo</Text>
                </TouchableOpacity>
              ) : (
                <Text style={es.photoHint}>Add a photo so recruiters recognize you</Text>
              )}
            </View>

            {/* \u2500\u2500 Personal \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
            <SectionHeader icon="person-outline" label="PERSONAL" />

            <Field label="FULL NAME" value={name} onChangeText={setName} placeholder="Dilan Kochhar" autoCapitalize="words" />

            <Field label="PRONOUNS" value={pronouns} onChangeText={setPronouns} placeholder="e.g. he/him, she/her, they/them" autoCapitalize="none" />

            <Field label="TAGLINE" value={tagline} onChangeText={setTagline} placeholder="Future data scientist at Google" maxLength={80} hint={`${tagline.length}/80`} />

            <Field label="BIO" value={bio} onChangeText={setBio} placeholder="Tell recruiters what drives you, what you're building, or what you're looking for." multiline maxLength={280} hint={`${bio.length}/280`} />

            {/* \u2500\u2500 Academic \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
            <SectionHeader icon="school-outline" label="ACADEMIC" />

            <Field label="SCHOOL" disabled disabledText={school || 'University of Tampa'} hint="Set from your email domain" />

            <Field label="MAJOR" value={major} onChangeText={setMajor} placeholder="e.g. Data Science" autoCapitalize="words" />

            <Field label="MINOR" value={minor} onChangeText={setMinor} placeholder="e.g. Computer Science" autoCapitalize="words" />

            {/* \u2500\u2500 Career \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
            <SectionHeader icon="rocket-outline" label="CAREER" />

            <Field label="CAREER GOAL" value={careerGoal} onChangeText={setCareerGoal} placeholder="e.g. Data Science Intern at a top tech company" autoCapitalize="sentences" />

            <Field label="INDUSTRY TARGET" value={industryTarget} onChangeText={setIndustryTarget} placeholder="e.g. Technology, Finance, Healthcare" autoCapitalize="words" />

            <Field label="TARGET COMPANIES" value={targetCompanies} onChangeText={setTargetCompanies} placeholder="e.g. Google, Goldman Sachs, McKinsey" autoCapitalize="words" hint="Separate with commas" />

            <Field label="LINKEDIN" value={linkedinUrl} onChangeText={setLinkedinUrl} placeholder="linkedin.com/in/yourname" autoCapitalize="none" keyboardType="url" />

            {/* \u2500\u2500 Preferences \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
            <SectionHeader icon="settings-outline" label="PREFERENCES" />

            <View style={es.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={es.toggleLabel}>Show on leaderboard</Text>
                <Text style={es.toggleHint}>Other students can see your rank and score</Text>
              </View>
              <Switch
                value={leaderboardOptIn}
                onValueChange={setLeaderboardOptIn}
                trackColor={{ false: colors.s3, true: 'rgba(201,168,76,0.35)' }}
                thumbColor={leaderboardOptIn ? GOLD : colors.t3}
              />
            </View>

            {/* Info */}
            <View style={es.infoCard}>
              <Ionicons name="information-circle-outline" size={14} color={colors.t3} />
              <Text style={es.infoText}>
                Your cohort is determined by your major and industry target. Changing them above will update your cohort automatically.
              </Text>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// \u2500\u2500 Styles \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const es = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.b1,
  },
  headerTitle: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 14,
    letterSpacing: 1,
    color: colors.t1,
  },
  saveBtn: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 13,
    color: GOLD,
    letterSpacing: 0.5,
  },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Completion
  completionWrap: {
    backgroundColor: colors.s2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 14,
    marginBottom: 24,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  completionLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.t3,
  },
  completionPct: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 14,
  },
  completionTrack: {
    height: 4,
    backgroundColor: colors.s3,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  completionFill: {
    height: '100%',
    borderRadius: 999,
  },
  completionHint: {
    fontSize: 11,
    color: colors.t3,
    lineHeight: 16,
  },

  // Photo
  photoSection: { alignItems: 'center', marginBottom: 28 },
  photoWrap: { position: 'relative' },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(201,168,76,0.3)',
  },
  photoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.s3,
    borderWidth: 2,
    borderColor: 'rgba(201,168,76,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitial: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 32,
    color: colors.t2,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  removeBtn: { marginTop: 10 },
  removeBtnText: { fontSize: 12, color: colors.coral, fontWeight: '500' },
  photoHint: { fontSize: 11, color: colors.t3, marginTop: 10 },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 14,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.b1,
  },
  sectionLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 9,
    letterSpacing: 1.5,
    color: GOLD,
  },

  // Fields
  fieldGroup: { marginBottom: 18 },
  fieldLabel: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.t3,
    marginBottom: 7,
  },
  fieldInput: {
    backgroundColor: colors.s2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.b1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.t1,
  },
  fieldDisabled: {
    opacity: 0.45,
    justifyContent: 'center',
  },
  fieldDisabledText: {
    fontSize: 15,
    color: colors.t2,
  },
  fieldHint: {
    fontSize: 10,
    color: colors.t3,
    marginTop: 5,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.s2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  toggleLabel: {
    fontSize: 14,
    color: colors.t1,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleHint: {
    fontSize: 11,
    color: colors.t3,
    lineHeight: 15,
  },

  // Info
  infoCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.s2,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.b1,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.t3,
    lineHeight: 18,
  },
});