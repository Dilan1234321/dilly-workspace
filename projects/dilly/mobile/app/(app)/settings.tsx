import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  Linking,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, clearAuth } from '../../lib/auth';
import { colors, spacing, radius, API_BASE } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';

const GOLD = '#2B3A8E';
const GREEN = '#34C759';
const BLUE = '#0A84FF';
const CORAL = '#FF453A';
const AMBER = '#FF9F0A';
const APP_VERSION = '1.0.0';

// ── Tone options ─────────────────────────────────────────────────────────────
const TONE_OPTIONS = [
  { id: 'encouraging', label: 'Encouraging' },
  { id: 'direct', label: 'Direct' },
  { id: 'casual', label: 'Casual' },
  { id: 'professional', label: 'Professional' },
  { id: 'coach', label: 'Coach' },
];

// ── Day buttons for weekly review ────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Nudge categories ─────────────────────────────────────────────────────────
const NUDGE_TYPES = [
  { key: 'deadline', label: 'Deadline approaching', hint: 'Before interviews and due dates' },
  { key: 'app_funnel', label: 'Application follow-up', hint: 'Track your application progress' },
  { key: 'relationship', label: 'Networking nudges', hint: 'Stay in touch with contacts' },
  { key: 'seasonal', label: 'Seasonal tips', hint: 'Recruiting cycle reminders' },
  { key: 'score_wins', label: 'Score celebrations', hint: 'When your scores improve' },
];

// ── Section tabs ─────────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'account', label: 'Account', icon: 'person-outline' },
  { key: 'subscription', label: 'Plan', icon: 'diamond-outline' },
  { key: 'app', label: 'App', icon: 'phone-portrait-outline' },
  { key: 'habits', label: 'Habits', icon: 'repeat-outline' },
  { key: 'profile', label: 'Profile', icon: 'id-card-outline' },
  { key: 'voice', label: 'Dilly AI', icon: 'chatbubble-outline' },
  { key: 'data', label: 'Data', icon: 'cloud-download-outline' },
  { key: 'privacy', label: 'Privacy', icon: 'shield-outline' },
  { key: 'family', label: 'Family', icon: 'people-outline' },
  { key: 'support', label: 'Support', icon: 'help-circle-outline' },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={st.sectionHeader}>
      <Ionicons name={icon as any} size={12} color={GOLD} />
      <Text style={st.sectionLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={st.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ToggleRow({
  label, hint, value, onToggle, disabled,
}: {
  label: string; hint?: string; value: boolean; onToggle: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <View style={[st.row, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={st.rowLabel}>{label}</Text>
        {hint ? <Text style={st.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: colors.s3, true: 'rgba(201,168,76,0.35)' }}
        thumbColor={value ? GOLD : colors.t3}
      />
    </View>
  );
}

function LinkRow({ label, icon, onPress, color, badge }: { label: string; icon: string; onPress: () => void; color?: string; badge?: string }) {
  return (
    <AnimatedPressable style={st.row} onPress={onPress} scaleDown={0.98}>
      <Text style={[st.rowLabel, color ? { color } : null]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {badge ? <View style={st.comingSoonBadge}><Text style={st.comingSoonText}>{badge}</Text></View> : null}
        <Ionicons name={icon as any} size={16} color={color || colors.t3} />
      </View>
    </AnimatedPressable>
  );
}

function Divider() {
  return <View style={st.divider} />;
}

function ChipSelector({ options, selected, onSelect }: { options: { id: string; label: string }[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <View style={st.chipGrid}>
      {options.map(opt => {
        const active = opt.id === selected;
        return (
          <AnimatedPressable
            key={opt.id}
            style={[st.chip, active && st.chipActive]}
            onPress={() => onSelect(opt.id)}
            scaleDown={0.95}
          >
            <Text style={[st.chipText, active && st.chipTextActive]}>{opt.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function NumberSelector({ options, selected, onSelect }: { options: number[]; selected: number; onSelect: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 }}>
      {options.map(n => {
        const active = n === selected;
        return (
          <AnimatedPressable
            key={n}
            style={[st.numBtn, active && st.numBtnActive]}
            onPress={() => onSelect(n)}
            scaleDown={0.92}
          >
            <Text style={[st.numBtnText, active && st.numBtnTextActive]}>{n}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const sectionRefs = useRef<Record<string, number>>({});

  const [profile, setProfile] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Toggles
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [deadlineReminders, setDeadlineReminders] = useState(true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [ritualsEnabled, setRitualsEnabled] = useState(false);
  const [weeklyReviewDay, setWeeklyReviewDay] = useState('Mon');
  const [voiceTone, setVoiceTone] = useState('encouraging');
  const [voiceAlwaysAsk, setVoiceAlwaysAsk] = useState(false);
  const [voiceMaxRecs, setVoiceMaxRecs] = useState(2);
  const [nudgePrefs, setNudgePrefs] = useState<Record<string, boolean>>({});
  const [voiceSaveToProfile, setVoiceSaveToProfile] = useState(true);
  const [profileVisibleToRecruiters, setProfileVisibleToRecruiters] = useState(true);
  const [recruiterPrivacy, setRecruiterPrivacy] = useState<Record<string, boolean>>({ scores: true, activity: true, applications: true, experience: true });

  // Profile & Share inputs
  const [tagline, setTagline] = useState('');
  const [bio, setBio] = useState('');
  const [careerGoal, setCareerGoal] = useState('');

  // Family
  const [parentEmail, setParentEmail] = useState('');
  const [parentMilestones, setParentMilestones] = useState(false);

  // Gift code
  const [giftCode, setGiftCode] = useState('');

  // Voice notes
  const [voiceNotes, setVoiceNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');

  // Active section tab
  const [activeSection, setActiveSection] = useState('account');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/profile');
        const data = await res.json();
        const p = data ?? {};
        setProfile(p);
        setNotifEnabled(p.notification_prefs?.enabled !== false);
        setDeadlineReminders(p.notification_prefs?.deadline_reminders !== false);
        setLeaderboardOptIn(p.leaderboard_opt_in !== false);
        setSoundEffects(p.sound_effects !== false);
        setRitualsEnabled(!!p.rituals_enabled);
        setWeeklyReviewDay(p.weekly_review_day || 'Mon');
        setVoiceTone(p.voice_tone || 'encouraging');
        setVoiceAlwaysAsk(!!p.voice_always_end_with_ask);
        setVoiceMaxRecs(typeof p.voice_max_recommendations === 'number' ? p.voice_max_recommendations : 2);
        setNudgePrefs(p.nudge_preferences ?? {});
        setVoiceSaveToProfile(p.voice_save_to_profile !== false);
        setProfileVisibleToRecruiters(p.dilly_profile_visible_to_recruiters !== false);
        setRecruiterPrivacy(p.dilly_profile_privacy ?? { scores: true, activity: true, applications: true, experience: true });
        setTagline(p.profile_tagline || '');
        setBio(p.profile_bio || '');
        setCareerGoal(p.career_goal || '');
        setParentEmail(p.parent_email || '');
        setParentMilestones(!!p.parent_milestone_opt_in);
        setVoiceNotes(Array.isArray(p.voice_notes) ? p.voice_notes : []);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const email = profile.email || '';
  const name = profile.name || '';
  const school = profile.school_id === 'utampa' ? 'University of Tampa' : (profile.school_id || 'Unknown');
  const cohort = profile.track || 'General';
  const profileSlug = profile.profile_slug || '';

  async function saveProfile(patch: Record<string, any>) {
    setSaving(true);
    try {
      await apiFetch('/profile', { method: 'PATCH', body: JSON.stringify(patch) });
    } catch {
      Alert.alert('Error', 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out', "You'll need to verify your email again to sign back in.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await clearAuth();
          // Dismiss all screens and go to root — prevents stale app screens
          while (router.canGoBack()) {
            router.back();
          }
          router.replace('/');
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert('Delete account', 'This permanently deletes your profile, scores, and all data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete my account', style: 'destructive',
        onPress: () => {
          Alert.alert('Are you sure?', 'Last chance. All your data will be permanently deleted.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, delete everything', style: 'destructive',
              onPress: async () => {
                try {
                  const res = await apiFetch('/account/delete', { method: 'POST' });
                  if (!res.ok) throw new Error();
                  await clearAuth();
                  router.replace('/');
                } catch { Alert.alert('Error', 'Could not delete account.'); }
              },
            },
          ]);
        },
      },
    ]);
  }

  function copyToClipboard(text: string, label: string) {
    Clipboard.setString(text);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  }

  function addVoiceNote() {
    const note = newNote.trim();
    if (!note) return;
    const updated = [...voiceNotes, note].slice(-20);
    setVoiceNotes(updated);
    setNewNote('');
    saveProfile({ voice_notes: updated });
  }

  function removeVoiceNote(idx: number) {
    const updated = voiceNotes.filter((_, i) => i !== idx);
    setVoiceNotes(updated);
    saveProfile({ voice_notes: updated });
  }

  function scrollToSection(key: string) {
    setActiveSection(key);
    const y = sectionRefs.current[key];
    if (y != null && scrollRef.current) {
      scrollRef.current.scrollTo({ y: y - 60, animated: true });
    }
  }

  const SECTION_KEYWORDS: Record<string, string> = {
    account: 'account name email school cohort edit profile',
    subscription: 'plan subscription upgrade pro gift code payment',
    app: 'app sound effects notifications push deadline reminders',
    habits: 'habits rituals daily weekly review day streak',
    profile: 'profile share tagline bio career goal recruiter link',
    voice: 'dilly ai voice tone notes question recommendations nudges',
    data: 'data export download calendar linkedin integrations',
    privacy: 'privacy trust leaderboard recruiter visibility scores save',
    family: 'family parent guardian email milestone invite',
    support: 'support feedback contact privacy policy terms referral',
  };

  function sectionVisible(key: string): boolean {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const keywords = SECTION_KEYWORDS[key] || key;
    return keywords.includes(q) || SECTIONS.find(s => s.key === key)?.label.toLowerCase().includes(q) || false;
  }

  if (loading) {
    return (
      <View style={[st.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="small" color={GOLD} />
      </View>
    );
  }

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* Nav bar */}
      <View style={st.navBar}>
        {searchVisible ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="search" size={16} color={colors.t3} />
            <TextInput
              ref={searchRef}
              style={{ flex: 1, fontSize: 14, color: colors.t1, paddingVertical: 0 }}
              placeholder="Search settings..."
              placeholderTextColor={colors.t3}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <AnimatedPressable onPress={() => { setSearchVisible(false); setSearchQuery(''); }} scaleDown={0.9} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.t3} />
            </AnimatedPressable>
          </View>
        ) : (
          <>
            <AnimatedPressable onPress={() => router.back()} scaleDown={0.9} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={colors.t1} />
            </AnimatedPressable>
            <Text style={st.navTitle}>Settings</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {saving ? <ActivityIndicator size="small" color={GOLD} /> : null}
              <AnimatedPressable onPress={() => setSearchVisible(true)} scaleDown={0.9} hitSlop={8}>
                <Ionicons name="search-outline" size={18} color={colors.t3} />
              </AnimatedPressable>
            </View>
          </>
        )}
      </View>

      {/* Section tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.tabBar} contentContainerStyle={st.tabBarContent}>
        {SECTIONS.map(s => (
          <AnimatedPressable
            key={s.key}
            style={[st.tab, activeSection === s.key && st.tabActive]}
            onPress={() => scrollToSection(s.key)}
            scaleDown={0.95}
          >
            <Ionicons name={s.icon as any} size={11} color={activeSection === s.key ? GOLD : colors.t3} />
            <Text style={[st.tabText, activeSection === s.key && st.tabTextActive]}>{s.label}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 60 }]}
      >
        {/* ── 1. Account ─────────────────────────────────────────────────── */}
        <View style={!sectionVisible('account') && { display: 'none' }} onLayout={e => { sectionRefs.current.account = e.nativeEvent.layout.y; }}>
          <FadeInView delay={0}>
            <SectionHeader icon="person-outline" label="ACCOUNT" />
            <View style={st.card}>
              <InfoRow label="Name" value={name || 'Not set'} />
              <Divider />
              <InfoRow label="Email" value={email || 'Not set'} />
              <Divider />
              <InfoRow label="School" value={school} />
              <Divider />
              <InfoRow label="Cohort" value={cohort} />
              <Divider />
              <LinkRow label="Edit profile" icon="chevron-forward" onPress={() => router.push('/(app)/my-dilly-profile')} />
            </View>
          </FadeInView>
        </View>

        {/* ── 2. Subscription ────────────────────────────────────────────── */}
        <View style={!sectionVisible('subscription') && { display: 'none' }} onLayout={e => { sectionRefs.current.subscription = e.nativeEvent.layout.y; }}>
          <FadeInView delay={40}>
            <SectionHeader icon="diamond-outline" label="PLAN" />
            <View style={st.card}>
              <View style={st.planRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.planName}>{profile.subscribed ? 'Dilly' : 'Free Plan'}</Text>
                  <Text style={st.planDesc}>
                    {profile.subscribed ? 'Unlimited audits, AI coaching, all features' : 'Score + leaderboard + 2 recommendations'}
                  </Text>
                </View>
                <View style={st.planBadge}>
                  <Text style={st.planBadgeText}>CURRENT</Text>
                </View>
              </View>
              {!profile.subscribed && (
                <>
                  <Divider />
                  <AnimatedPressable style={st.upgradeBtn} onPress={() => Alert.alert('Coming soon', 'Payments are not yet available.')} scaleDown={0.97}>
                    <Ionicons name="flash" size={14} color="#FFFFFF" />
                    <Text style={st.upgradeBtnText}>Upgrade to Dilly · $9.99/mo</Text>
                  </AnimatedPressable>
                  <Text style={st.upgradeHint}>Unlimited audits, AI coaching, all jobs, score history</Text>
                </>
              )}
              <Divider />
              <View style={st.giftRow}>
                <TextInput
                  style={st.giftInput}
                  placeholder="Gift code"
                  placeholderTextColor={colors.t3}
                  value={giftCode}
                  onChangeText={setGiftCode}
                  autoCapitalize="characters"
                />
                <AnimatedPressable
                  style={[st.giftBtn, !giftCode.trim() && { opacity: 0.4 }]}
                  onPress={() => {
                    if (!giftCode.trim()) return;
                    Alert.alert('Coming soon', 'Gift code redemption is not yet available.');
                  }}
                  scaleDown={0.95}
                  disabled={!giftCode.trim()}
                >
                  <Text style={st.giftBtnText}>Redeem</Text>
                </AnimatedPressable>
              </View>
            </View>
          </FadeInView>
        </View>

        {/* ── 3. App ─────────────────────────────────────────────────────── */}
        <View style={!sectionVisible('app') && { display: 'none' }} onLayout={e => { sectionRefs.current.app = e.nativeEvent.layout.y; }}>
          <FadeInView delay={80}>
            <SectionHeader icon="phone-portrait-outline" label="APP" />
            <View style={st.card}>
              <ToggleRow label="Sound effects" hint="Button taps and transitions" value={soundEffects} onToggle={v => { setSoundEffects(v); saveProfile({ sound_effects: v }); }} />
              <Divider />
              <ToggleRow label="Push notifications" hint="Score updates, coaching tips, job matches" value={notifEnabled} onToggle={v => { setNotifEnabled(v); saveProfile({ notification_prefs: { enabled: v, deadline_reminders: deadlineReminders } }); }} />
              <Divider />
              <ToggleRow label="Deadline reminders" hint="Before interviews and deadlines" value={deadlineReminders} onToggle={v => { setDeadlineReminders(v); saveProfile({ notification_prefs: { enabled: notifEnabled, deadline_reminders: v } }); }} />
            </View>
          </FadeInView>
        </View>

        {/* ── 4. Habits ──────────────────────────────────────────────────── */}
        <View style={!sectionVisible('habits') && { display: 'none' }} onLayout={e => { sectionRefs.current.habits = e.nativeEvent.layout.y; }}>
          <FadeInView delay={120}>
            <SectionHeader icon="repeat-outline" label="HABITS" />
            <View style={st.card}>
              <ToggleRow label="Daily rituals" hint="Reminders to check in and build streak" value={ritualsEnabled} onToggle={v => { setRitualsEnabled(v); saveProfile({ rituals_enabled: v }); }} />
              <Divider />
              <View style={st.innerSection}>
                <Text style={st.innerLabel}>Weekly review day</Text>
                <View style={st.dayRow}>
                  {DAYS.map(d => {
                    const active = weeklyReviewDay === d;
                    return (
                      <AnimatedPressable
                        key={d}
                        style={[st.dayBtn, active && st.dayBtnActive]}
                        onPress={() => { setWeeklyReviewDay(d); saveProfile({ weekly_review_day: d }); }}
                        scaleDown={0.92}
                      >
                        <Text style={[st.dayBtnText, active && st.dayBtnTextActive]}>{d[0]}</Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </FadeInView>
        </View>

        {/* ── 5. Profile & Share ──────────────────────────────────────────── */}
        <View style={!sectionVisible('profile') && { display: 'none' }} onLayout={e => { sectionRefs.current.profile = e.nativeEvent.layout.y; }}>
          <FadeInView delay={160}>
            <SectionHeader icon="id-card-outline" label="PROFILE & SHARE" />
            <View style={st.card}>
              <View style={st.inputSection}>
                <Text style={st.inputLabel}>Professional tagline</Text>
                <TextInput
                  style={st.textInput}
                  placeholder="e.g. Aspiring data analyst with a passion for insights"
                  placeholderTextColor={colors.t3}
                  value={tagline}
                  onChangeText={setTagline}
                  onEndEditing={() => saveProfile({ profile_tagline: tagline })}
                  multiline
                />
              </View>
              <Divider />
              <View style={st.inputSection}>
                <Text style={st.inputLabel}>Short bio</Text>
                <TextInput
                  style={[st.textInput, { minHeight: 60 }]}
                  placeholder="Tell recruiters about yourself in 2-3 sentences"
                  placeholderTextColor={colors.t3}
                  value={bio}
                  onChangeText={setBio}
                  onEndEditing={() => saveProfile({ profile_bio: bio })}
                  multiline
                />
              </View>
              <Divider />
              <View style={st.inputSection}>
                <Text style={st.inputLabel}>Career goal</Text>
                <TextInput
                  style={st.textInput}
                  placeholder="e.g. Software engineering internship at a top-tier company"
                  placeholderTextColor={colors.t3}
                  value={careerGoal}
                  onChangeText={setCareerGoal}
                  onEndEditing={() => saveProfile({ career_goal: careerGoal })}
                  multiline
                />
              </View>
              {profileSlug ? (
                <>
                  <Divider />
                  <LinkRow
                    label="Copy profile link"
                    icon="copy-outline"
                    onPress={() => copyToClipboard(`https://getdilly.com/profile/${profileSlug}`, 'Profile link')}
                    color={BLUE}
                  />
                </>
              ) : null}
            </View>
          </FadeInView>
        </View>

        {/* ── 6. Dilly Voice ─────────────────────────────────────────────── */}
        <View style={!sectionVisible('voice') && { display: 'none' }} onLayout={e => { sectionRefs.current.voice = e.nativeEvent.layout.y; }}>
          <FadeInView delay={200}>
            <SectionHeader icon="chatbubble-outline" label="DILLY AI" />
            <View style={st.card}>
              {/* Tone */}
              <View style={st.innerSection}>
                <Text style={st.innerLabel}>Tone</Text>
                <ChipSelector
                  options={TONE_OPTIONS}
                  selected={voiceTone}
                  onSelect={id => { setVoiceTone(id); saveProfile({ voice_tone: id }); }}
                />
              </View>

              <Divider />

              {/* Voice notes */}
              <View style={st.innerSection}>
                <Text style={st.innerLabel}>Notes for Dilly</Text>
                <Text style={st.innerHint}>Things Dilly should know about you</Text>
                {voiceNotes.slice(-5).map((note, i) => (
                  <View key={i} style={st.noteRow}>
                    <Text style={st.noteText} numberOfLines={2}>{note}</Text>
                    <AnimatedPressable onPress={() => removeVoiceNote(voiceNotes.length - 5 + i)} scaleDown={0.9} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={colors.t3} />
                    </AnimatedPressable>
                  </View>
                ))}
                <View style={st.noteInputRow}>
                  <TextInput
                    style={st.noteInput}
                    placeholder="Add a note..."
                    placeholderTextColor={colors.t3}
                    value={newNote}
                    onChangeText={setNewNote}
                    onSubmitEditing={addVoiceNote}
                    returnKeyType="done"
                  />
                  <AnimatedPressable onPress={addVoiceNote} scaleDown={0.9} disabled={!newNote.trim()}>
                    <Ionicons name="add-circle" size={24} color={newNote.trim() ? GOLD : colors.t3} />
                  </AnimatedPressable>
                </View>
              </View>

              <Divider />

              {/* Always ask */}
              <ToggleRow
                label="Always end with a question"
                hint="Dilly keeps the conversation going"
                value={voiceAlwaysAsk}
                onToggle={v => { setVoiceAlwaysAsk(v); saveProfile({ voice_always_end_with_ask: v }); }}
              />

              <Divider />

              {/* Max recommendations */}
              <View style={st.innerSection}>
                <Text style={st.innerLabel}>Max recommendations per message</Text>
              </View>
              <NumberSelector
                options={[1, 2, 3]}
                selected={voiceMaxRecs}
                onSelect={n => { setVoiceMaxRecs(n); saveProfile({ voice_max_recommendations: n }); }}
              />

              <Divider />

              {/* Proactive nudges */}
              <View style={st.innerSection}>
                <Text style={st.innerLabel}>Proactive nudges</Text>
              </View>
              {NUDGE_TYPES.map((n, i) => (
                <View key={n.key}>
                  {i > 0 && <Divider />}
                  <ToggleRow
                    label={n.label}
                    hint={n.hint}
                    value={nudgePrefs[n.key] !== false}
                    onToggle={v => {
                      const updated = { ...nudgePrefs, [n.key]: v };
                      setNudgePrefs(updated);
                      saveProfile({ nudge_preferences: updated });
                    }}
                  />
                </View>
              ))}
            </View>
          </FadeInView>
        </View>

        {/* ── 7. Data & Integrations ──────────────────────────────────────── */}
        <View style={!sectionVisible('data') && { display: 'none' }} onLayout={e => { sectionRefs.current.data = e.nativeEvent.layout.y; }}>
          <FadeInView delay={240}>
            <SectionHeader icon="cloud-download-outline" label="DATA & INTEGRATIONS" />
            <View style={st.card}>
              <LinkRow label="Download everything" icon="download-outline" onPress={() => {
                Linking.openURL(`${API_BASE}/profile/export`);
              }} />
              <Divider />
              <LinkRow label="Add deadlines to calendar" icon="calendar-outline" onPress={() => {
                Alert.alert('Coming soon', 'Calendar export will be available soon.');
              }} />
              <Divider />
              <LinkRow label="LinkedIn sync" icon="logo-linkedin" onPress={() => Alert.alert('Coming Soon', 'This feature is in development.')} badge="SOON" />
              <Divider />
              <LinkRow label="Email parsing" icon="mail-outline" onPress={() => Alert.alert('Coming Soon', 'This feature is in development.')} badge="SOON" />
            </View>
          </FadeInView>
        </View>

        {/* ── 8. Trust & Privacy ──────────────────────────────────────────── */}
        <View style={!sectionVisible('privacy') && { display: 'none' }} onLayout={e => { sectionRefs.current.privacy = e.nativeEvent.layout.y; }}>
          <FadeInView delay={280}>
            <SectionHeader icon="shield-outline" label="TRUST & PRIVACY" />
            <View style={st.card}>
              <View style={st.privacyStatement}>
                <Text style={st.privacyText}>
                  Your data belongs to you. Dilly never sells your information. We only use it to help you get hired.
                </Text>
              </View>
              <Divider />
              <ToggleRow
                label="Save what I tell Dilly"
                hint="Dilly remembers your preferences and context"
                value={voiceSaveToProfile}
                onToggle={v => { setVoiceSaveToProfile(v); saveProfile({ voice_save_to_profile: v }); }}
              />
              <Divider />
              <ToggleRow
                label="Show on leaderboard"
                hint="Other students can see your rank and score"
                value={leaderboardOptIn}
                onToggle={v => { setLeaderboardOptIn(v); saveProfile({ leaderboard_opt_in: v }); }}
              />
              <Divider />
              <ToggleRow
                label="Profile visible to recruiters"
                hint="Let employers discover your profile"
                value={profileVisibleToRecruiters}
                onToggle={v => { setProfileVisibleToRecruiters(v); saveProfile({ dilly_profile_visible_to_recruiters: v }); }}
              />
              {profileVisibleToRecruiters && (
                <>
                  <Divider />
                  <View style={st.innerSection}>
                    <Text style={[st.innerLabel, { marginBottom: 4 }]}>Recruiters can see</Text>
                  </View>
                  {['scores', 'activity', 'applications', 'experience'].map((key, i) => (
                    <View key={key}>
                      {i > 0 && <Divider />}
                      <ToggleRow
                        label={key.charAt(0).toUpperCase() + key.slice(1)}
                        value={recruiterPrivacy[key] !== false}
                        onToggle={v => {
                          const updated = { ...recruiterPrivacy, [key]: v };
                          setRecruiterPrivacy(updated);
                          saveProfile({ dilly_profile_privacy: updated });
                        }}
                      />
                    </View>
                  ))}
                </>
              )}
            </View>
          </FadeInView>
        </View>

        {/* ── 9. Family ──────────────────────────────────────────────────── */}
        <View style={!sectionVisible('family') && { display: 'none' }} onLayout={e => { sectionRefs.current.family = e.nativeEvent.layout.y; }}>
          <FadeInView delay={320}>
            <SectionHeader icon="people-outline" label="FAMILY" />
            <View style={st.card}>
              <View style={st.inputSection}>
                <Text style={st.inputLabel}>Parent/guardian email</Text>
                <Text style={st.innerHint}>Share your progress with a parent or guardian</Text>
                <TextInput
                  style={st.textInput}
                  placeholder="parent@email.com"
                  placeholderTextColor={colors.t3}
                  value={parentEmail}
                  onChangeText={setParentEmail}
                  onEndEditing={() => saveProfile({ parent_email: parentEmail })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <Divider />
              <ToggleRow
                label="Milestone updates"
                hint="Send parent updates when you hit milestones"
                value={parentMilestones}
                onToggle={v => { setParentMilestones(v); saveProfile({ parent_milestone_opt_in: v }); }}
              />
              {parentEmail.trim() && (
                <>
                  <Divider />
                  <LinkRow
                    label="Send parent invite"
                    icon="paper-plane-outline"
                    onPress={async () => {
                      try {
                        await apiFetch('/profile/parent-invite', { method: 'POST' });
                        Alert.alert('Sent', `Invite sent to ${parentEmail}`);
                      } catch {
                        Alert.alert('Error', 'Could not send invite.');
                      }
                    }}
                    color={GREEN}
                  />
                </>
              )}
            </View>
          </FadeInView>
        </View>

        {/* ── 10. Support ────────────────────────────────────────────────── */}
        <View style={!sectionVisible('support') && { display: 'none' }} onLayout={e => { sectionRefs.current.support = e.nativeEvent.layout.y; }}>
          <FadeInView delay={360}>
            <SectionHeader icon="help-circle-outline" label="SUPPORT" />
            <View style={st.card}>
              <LinkRow label="Send feedback" icon="chatbubble-ellipses-outline" onPress={() => Linking.openURL('mailto:support@dillyapp.com?subject=Dilly%20Feedback')} />
              <Divider />
              <LinkRow label="Contact support" icon="mail-outline" onPress={() => Linking.openURL('mailto:support@dillyapp.com')} />
              <Divider />
              <LinkRow label="Privacy policy" icon="document-text-outline" onPress={() => Linking.openURL('https://getdilly.com/privacy')} />
              <Divider />
              <LinkRow label="Terms of service" icon="document-text-outline" onPress={() => Linking.openURL('https://getdilly.com/terms')} />
              {profile.referral_code ? (
                <>
                  <Divider />
                  <LinkRow
                    label={`Invite a friend · ${profile.referral_code}`}
                    icon="copy-outline"
                    onPress={() => copyToClipboard(`https://getdilly.com/r/${profile.referral_code}`, 'Referral link')}
                    color={GOLD}
                  />
                </>
              ) : null}
            </View>
          </FadeInView>
        </View>

        {/* ── Sign out ──────────────────────────────────────────────────── */}
        <FadeInView delay={400}>
          <View style={[st.card, { marginTop: 24 }]}>
            <LinkRow label="Sign out" icon="log-out-outline" onPress={handleSignOut} color={AMBER} />
          </View>
        </FadeInView>

        {/* Version */}
        <FadeInView delay={440}>
          <View style={st.versionWrap}>
            <Text style={st.versionText}>Dilly v{APP_VERSION}</Text>
            <Text style={st.versionSub}>Made for students who want to win.</Text>
            <AnimatedPressable
              onPress={handleDeleteAccount}
              scaleDown={0.97}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 18, opacity: 0.4 }}
            >
              <Ionicons name="trash-outline" size={12} color={colors.b3} />
              <Text style={{ fontSize: 11, color: colors.b3 }}>Delete account</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  navTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },

  tabBar: { borderBottomWidth: 1, borderBottomColor: colors.b1 },
  tabBarContent: { paddingHorizontal: 14, gap: 4, alignItems: 'center', paddingVertical: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: 'transparent',
  },
  tabActive: { backgroundColor: 'rgba(201,168,76,0.1)' },
  tabText: { fontSize: 11, fontWeight: '500', color: colors.t3 },
  tabTextActive: { color: GOLD, fontWeight: '600' },

  scroll: { paddingHorizontal: spacing.xl },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginTop: 24, marginBottom: 10,
  },
  sectionLabel: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.5, color: GOLD },

  card: {
    backgroundColor: colors.s2, borderRadius: 14,
    borderWidth: 1, borderColor: colors.b1, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.b1, marginHorizontal: 14 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14, gap: 12,
  },
  rowLabel: { flex: 1, fontSize: 14, color: colors.t1, fontWeight: '500' },
  rowValue: { fontSize: 13, color: colors.t3, textAlign: 'right', maxWidth: '55%' },
  rowHint: { fontSize: 11, color: colors.t3, lineHeight: 15, marginTop: 2 },

  planRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14, gap: 12,
  },
  planName: { fontSize: 15, fontWeight: '700', color: colors.t1, marginBottom: 2 },
  planDesc: { fontSize: 11, color: colors.t3, lineHeight: 16 },
  planBadge: { backgroundColor: colors.s3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  planBadgeText: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1, color: colors.t3 },

  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GOLD, marginHorizontal: 14, marginTop: 10, marginBottom: 6,
    borderRadius: 11, paddingVertical: 12,
  },
  upgradeBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 12, letterSpacing: 0.5, color: '#FFFFFF' },
  upgradeHint: { fontSize: 10, color: colors.t3, textAlign: 'center', paddingBottom: 14, paddingHorizontal: 14 },

  giftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  giftInput: {
    flex: 1, height: 38, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b2, backgroundColor: colors.s3,
    paddingHorizontal: 12, fontSize: 13, color: colors.t1, letterSpacing: 1,
  },
  giftBtn: {
    backgroundColor: GOLD, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  giftBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  innerSection: { paddingHorizontal: 14, paddingVertical: 10 },
  innerLabel: { fontSize: 13, fontWeight: '600', color: colors.t1 },
  innerHint: { fontSize: 11, color: colors.t3, marginTop: 2, marginBottom: 6 },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 10, marginTop: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1, borderColor: colors.b2, backgroundColor: colors.s3,
  },
  chipActive: { backgroundColor: GOLD + '20', borderColor: GOLD + '50' },
  chipText: { fontSize: 12, color: colors.t3, fontWeight: '500' },
  chipTextActive: { color: GOLD, fontWeight: '600' },

  numBtn: {
    width: 44, height: 38, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b2, backgroundColor: colors.s3,
    alignItems: 'center', justifyContent: 'center',
  },
  numBtnActive: { backgroundColor: GOLD + '20', borderColor: GOLD + '50' },
  numBtnText: { fontSize: 15, fontWeight: '700', color: colors.t3 },
  numBtnTextActive: { color: GOLD },

  dayRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  dayBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: colors.b2, backgroundColor: colors.s3,
    alignItems: 'center', justifyContent: 'center',
  },
  dayBtnActive: { backgroundColor: GOLD + '20', borderColor: GOLD },
  dayBtnText: { fontSize: 12, fontWeight: '600', color: colors.t3 },
  dayBtnTextActive: { color: GOLD },

  noteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  noteText: { flex: 1, fontSize: 12, color: colors.t2, lineHeight: 17 },
  noteInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
  },
  noteInput: {
    flex: 1, height: 36, borderRadius: 10,
    borderWidth: 1, borderColor: colors.b2, backgroundColor: colors.s3,
    paddingHorizontal: 10, fontSize: 12, color: colors.t1,
  },

  inputSection: { paddingHorizontal: 14, paddingVertical: 10 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.t1, marginBottom: 6 },
  textInput: {
    borderRadius: 10, borderWidth: 1, borderColor: colors.b2,
    backgroundColor: colors.s3, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: colors.t1, minHeight: 40,
  },

  privacyStatement: { paddingHorizontal: 14, paddingVertical: 12 },
  privacyText: { fontSize: 12, color: colors.t3, lineHeight: 18, fontStyle: 'italic' },

  comingSoonBadge: {
    backgroundColor: colors.s3, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  comingSoonText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5, color: colors.t3 },

  versionWrap: { alignItems: 'center', paddingVertical: 28, gap: 4 },
  versionText: { fontFamily: 'Cinzel_400Regular', fontSize: 11, letterSpacing: 1, color: colors.t3 },
  versionSub: { fontSize: 10, color: colors.b3, fontStyle: 'italic' },
});
