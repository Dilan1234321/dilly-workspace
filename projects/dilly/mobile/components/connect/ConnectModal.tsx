/**
 * ConnectModal — full-screen recruiter Connect surface.
 *
 * Sections (internal stack navigation):
 *   home           → "Who's watching you" + section links
 *   companies      → Browse companies hiring (placeholder list)
 *   requests       → Connection requests (accept / decline UX)
 *   conversations  → Active chat threads shell (reuses Dilly chat patterns)
 *   pipeline       → Application status timeline (mirrors Wins timeline UX)
 *   settings       → Visibility settings sub-page (→ ConnectVisibilitySettings)
 *
 * All data is placeholder fixtures. Phase 3 wire-up:
 *   - Replace CONNECT_FIXTURES with real calls to /recruiter/activity,
 *     /recruiter/requests, /recruiter/conversations, /recruiter/pipeline
 *   - Remove "Coming soon" banners from conversations + pipeline sections
 *   - Wire unread counts back to the header icon red-dot in Home
 */

import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  Animated, Easing, Pressable, TouchableOpacity,
  FlatList, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolvedTheme } from '../../hooks/useTheme';
import { DillyFace } from '../DillyFace';
import AnimatedPressable from '../AnimatedPressable';
import ConnectVisibilitySettings from './ConnectVisibilitySettings';

const W = Dimensions.get('window').width;

// ── Fixture data ──────────────────────────────────────────────────────────────
// TODO Phase 3: replace all CONNECT_FIXTURES with real API data

const CONNECT_FIXTURES = {
  watchers: [
    { id: '1', company: 'Goldman Sachs', field: 'Finance', logo: null },
    { id: '2', company: 'BlackRock', field: 'Finance', logo: null },
    { id: '3', company: 'Citadel', field: 'Finance', logo: null },
  ],
  companies: [
    { id: '1', company: 'Goldman Sachs', field: 'Finance', openRoles: 12 },
    { id: '2', company: 'BlackRock', field: 'Finance', openRoles: 8 },
    { id: '3', company: 'JPMorgan Chase', field: 'Finance', openRoles: 31 },
    { id: '4', company: 'Citadel', field: 'Finance / Quant', openRoles: 5 },
    { id: '5', company: 'Two Sigma', field: 'Quant / Tech', openRoles: 3 },
  ],
  requests: [
    { id: '1', recruiter: 'Sarah K.', company: 'Goldman Sachs', role: 'Summer Analyst – IB', sentAt: '2 days ago' },
    { id: '2', recruiter: 'Marcus T.', company: 'BlackRock', role: 'Risk Analyst Intern', sentAt: '4 days ago' },
  ],
  conversations: [
    { id: '1', recruiter: 'Sarah K.', company: 'Goldman Sachs', lastMsg: 'Looking forward to connecting...', time: '2d ago', unread: true },
  ],
  pipeline: [
    { id: '1', company: 'Goldman Sachs', role: 'Summer Analyst – IB', status: 'Application Reviewed', date: 'Apr 20' },
    { id: '2', company: 'BlackRock', role: 'Risk Analyst Intern', status: 'Recruiter Interested', date: 'Apr 22' },
  ],
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Section = 'home' | 'companies' | 'requests' | 'conversations' | 'pipeline' | 'settings';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialSection?: Section;
}

// ── Sub-section: Who's Watching ───────────────────────────────────────────────

function WatcherCard({ item, theme }: { item: typeof CONNECT_FIXTURES.watchers[0]; theme: any }) {
  return (
    <View style={[ws.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, borderRadius: theme.shape.sm }]}>
      {/* Blurred company initial — Phase 3 will show real logo when recruiter unlocks */}
      <View style={[ws.logo, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.accent, opacity: 0.3 }}>
          {item.company.charAt(0)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        {/* Company name blurred until connection established */}
        <View style={[ws.blurBar, { backgroundColor: theme.surface.s2, width: 80, marginBottom: 4 }]} />
        <Text style={{ fontSize: 11, color: theme.surface.t3 }}>{item.field}</Text>
      </View>
      <View style={[ws.badge, { backgroundColor: theme.accentSoft }]}>
        <Ionicons name="eye-outline" size={12} color={theme.accent} />
      </View>
    </View>
  );
}

const ws = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, marginBottom: 8 },
  logo: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  blurBar: { height: 10, borderRadius: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
});

// ── Sub-section: Companies ────────────────────────────────────────────────────

function CompanyRow({ item, theme }: { item: typeof CONNECT_FIXTURES.companies[0]; theme: any }) {
  return (
    <View style={[cs.row, { borderBottomColor: theme.surface.border }]}>
      <View style={[cs.logo, { backgroundColor: theme.accentSoft }]}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: theme.accent }}>{item.company.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.surface.t1 }}>{item.company}</Text>
        <Text style={{ fontSize: 12, color: theme.surface.t3 }}>{item.field}</Text>
      </View>
      <View style={[cs.pill, { backgroundColor: theme.accentSoft, borderRadius: theme.shape.chip }]}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.accent }}>{item.openRoles} roles</Text>
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  logo: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: 10, paddingVertical: 4 },
});

// ── Sub-section: Requests ─────────────────────────────────────────────────────

function RequestCard({ item, theme }: { item: typeof CONNECT_FIXTURES.requests[0]; theme: any }) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  if (accepted === true) {
    return (
      <View style={[rs.card, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder, borderRadius: theme.shape.sm }]}>
        <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
        <Text style={{ flex: 1, fontSize: 13, color: theme.surface.t2 }}>Connected with {item.recruiter}</Text>
      </View>
    );
  }
  if (accepted === false) {
    return null;
  }
  return (
    <View style={[rs.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, borderRadius: theme.shape.sm }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.surface.t1 }}>{item.recruiter}</Text>
        <Text style={{ fontSize: 12, color: theme.surface.t2 }}>{item.company} · {item.role}</Text>
        <Text style={{ fontSize: 11, color: theme.surface.t3 }}>{item.sentAt}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={[rs.btn, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder, borderRadius: theme.shape.chip }]}
          onPress={() => setAccepted(true)}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.accent }}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[rs.btn, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border, borderRadius: theme.shape.chip }]}
          onPress={() => setAccepted(false)}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.surface.t2 }}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const rs = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, marginBottom: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1 },
});

// ── Sub-section: Conversations (shell) ───────────────────────────────────────

function ConversationsShell({ theme }: { theme: any }) {
  if (CONNECT_FIXTURES.conversations.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 40, gap: 16 }}>
        <DillyFace size={72} mood="curious" ring={false} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.surface.t1 }}>No active conversations yet</Text>
        <Text style={{ fontSize: 13, color: theme.surface.t3, textAlign: 'center', paddingHorizontal: 32 }}>
          Accept a connection request and Dilly will start a thread here.
        </Text>
      </View>
    );
  }
  return (
    <View>
      {/* Coming soon banner — remove when real chat threads are wired (Phase 3) */}
      <View style={[convs.banner, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder, borderRadius: theme.shape.sm }]}>
        <Ionicons name="construct-outline" size={14} color={theme.accent} />
        <Text style={{ fontSize: 12, color: theme.accent }}>Chat threads coming in Phase 3 — accept requests to be first in queue</Text>
      </View>
      {CONNECT_FIXTURES.conversations.map(item => (
        <View
          key={item.id}
          style={[convs.row, { borderBottomColor: theme.surface.border }]}
        >
          <View style={[convs.avatar, { backgroundColor: theme.accentSoft }]}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: theme.accent }}>{item.recruiter.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.surface.t1 }}>{item.recruiter}</Text>
            <Text style={{ fontSize: 12, color: theme.surface.t2 }}>{item.company}</Text>
            <Text style={{ fontSize: 12, color: theme.surface.t3 }} numberOfLines={1}>{item.lastMsg}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={{ fontSize: 11, color: theme.surface.t3 }}>{item.time}</Text>
            {item.unread && (
              <View style={[convs.unread, { backgroundColor: theme.accent }]}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>1</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const convs = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  unread: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

// ── Sub-section: Pipeline ─────────────────────────────────────────────────────

const PIPELINE_STATUS_ORDER = [
  'Profile Saved',
  'Recruiter Interested',
  'Application Reviewed',
  'Interview Scheduled',
  'Offer Extended',
];

function PipelineItem({ item, theme }: { item: typeof CONNECT_FIXTURES.pipeline[0]; theme: any }) {
  const idx = PIPELINE_STATUS_ORDER.indexOf(item.status);
  return (
    <View style={[ps.card, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, borderRadius: theme.shape.sm }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.surface.t1 }}>{item.company}</Text>
        <Text style={{ fontSize: 12, color: theme.surface.t2 }}>{item.role}</Text>
        <View style={[ps.statusPill, { backgroundColor: theme.accentSoft, borderRadius: theme.shape.chip }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.accent }}>{item.status}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ fontSize: 11, color: theme.surface.t3 }}>{item.date}</Text>
        {/* Dot-track mirrors Wins timeline pattern */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {PIPELINE_STATUS_ORDER.map((_, i) => (
            <View
              key={i}
              style={[
                ps.dot,
                { backgroundColor: i <= idx ? theme.accent : theme.surface.s3 },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const ps = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, marginBottom: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

// ── Section nav pill bar ──────────────────────────────────────────────────────

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'home', label: 'Overview', icon: 'people-outline' },
  { id: 'companies', label: 'Companies', icon: 'business-outline' },
  { id: 'requests', label: 'Requests', icon: 'person-add-outline' },
  { id: 'conversations', label: 'Messages', icon: 'chatbubble-outline' },
  { id: 'pipeline', label: 'Pipeline', icon: 'git-branch-outline' },
  { id: 'settings', label: 'Visibility', icon: 'settings-outline' },
];

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ConnectModal({ visible, onClose, initialSection = 'home' }: Props) {
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<Section>(initialSection);
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  if (!mounted) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  const currentSection = SECTIONS.find(s => s.id === section);

  return (
    <Modal
      transparent={false}
      animationType="none"
      visible={mounted}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        style={[m.root, { backgroundColor: theme.surface.bg, opacity: anim, transform: [{ translateY }] }]}
      >
        {/* Header */}
        <View style={[m.header, { paddingTop: insets.top + 12, borderBottomColor: theme.surface.border, backgroundColor: theme.surface.bg }]}>
          <AnimatedPressable onPress={onClose} scaleDown={0.9} hitSlop={12} style={m.backBtn}>
            <Ionicons name="close" size={22} color={theme.surface.t1} />
          </AnimatedPressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[m.title, { color: theme.surface.t1, fontFamily: theme.type.display }]}>
              Connect
            </Text>
            <Text style={[m.subtitle, { color: theme.surface.t3, fontFamily: theme.type.body }]}>
              {currentSection?.label}
            </Text>
          </View>
          {/* Visibility settings shortcut */}
          <AnimatedPressable
            onPress={() => setSection('settings')}
            scaleDown={0.9}
            hitSlop={12}
            style={m.settingsBtn}
          >
            <Ionicons name="options-outline" size={20} color={section === 'settings' ? theme.accent : theme.surface.t3} />
          </AnimatedPressable>
        </View>

        {/* Section pill nav */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[m.navBar, { borderBottomColor: theme.surface.border }]}
        >
          {SECTIONS.map(sec => {
            const active = sec.id === section;
            return (
              <TouchableOpacity
                key={sec.id}
                onPress={() => setSection(sec.id)}
                style={[
                  m.navPill,
                  {
                    backgroundColor: active ? theme.accentSoft : 'transparent',
                    borderColor: active ? theme.accentBorder : 'transparent',
                    borderRadius: theme.shape.chip,
                  },
                ]}
              >
                <Ionicons
                  name={sec.icon as any}
                  size={13}
                  color={active ? theme.accent : theme.surface.t3}
                />
                <Text style={[m.navLabel, { color: active ? theme.accent : theme.surface.t3, fontFamily: theme.type.body }]}>
                  {sec.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Section content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[m.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {section === 'home' && <HomeSection theme={theme} onNavigate={setSection} />}
          {section === 'companies' && (
            <>
              <SectionHeading title="Companies Hiring in Your Field" theme={theme} />
              {CONNECT_FIXTURES.companies.map(item => (
                <CompanyRow key={item.id} item={item} theme={theme} />
              ))}
            </>
          )}
          {section === 'requests' && (
            <>
              <SectionHeading title="Connection Requests" theme={theme} />
              {CONNECT_FIXTURES.requests.length === 0 ? (
                <EmptyState mood="idle" message="No pending requests right now." theme={theme} />
              ) : (
                CONNECT_FIXTURES.requests.map(item => (
                  <RequestCard key={item.id} item={item} theme={theme} />
                ))
              )}
            </>
          )}
          {section === 'conversations' && (
            <>
              <SectionHeading title="Active Conversations" theme={theme} />
              <ConversationsShell theme={theme} />
            </>
          )}
          {section === 'pipeline' && (
            <>
              <SectionHeading title="Your Pipeline" theme={theme} />
              <View style={[pip.banner, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder, borderRadius: theme.shape.sm }]}>
                <Ionicons name="construct-outline" size={14} color={theme.accent} />
                <Text style={{ fontSize: 12, color: theme.accent }}>Full pipeline sync arrives in Phase 3 — placeholder statuses shown</Text>
              </View>
              {CONNECT_FIXTURES.pipeline.map(item => (
                <PipelineItem key={item.id} item={item} theme={theme} />
              ))}
            </>
          )}
          {section === 'settings' && (
            <ConnectVisibilitySettings theme={theme} />
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ── Home overview section ─────────────────────────────────────────────────────

function HomeSection({ theme, onNavigate }: { theme: any; onNavigate: (s: Section) => void }) {
  return (
    <>
      <SectionHeading title="Who's watching you this week" theme={theme} />
      <Text style={{ fontSize: 13, color: theme.surface.t3, marginBottom: 12 }}>
        Company names revealed when a recruiter connects with you.
      </Text>
      {CONNECT_FIXTURES.watchers.map(item => (
        <WatcherCard key={item.id} item={item} theme={theme} />
      ))}

      <View style={m.divider} />

      <Text style={[m.sectionTitle, { color: theme.surface.t1, fontFamily: theme.type.display }]}>
        Jump to
      </Text>
      {([
        { id: 'companies', label: 'Browse Companies', icon: 'business-outline', count: CONNECT_FIXTURES.companies.length },
        { id: 'requests', label: 'Connection Requests', icon: 'person-add-outline', count: CONNECT_FIXTURES.requests.length },
        { id: 'conversations', label: 'Active Conversations', icon: 'chatbubble-outline', count: CONNECT_FIXTURES.conversations.length },
        { id: 'pipeline', label: 'Your Pipeline', icon: 'git-branch-outline', count: CONNECT_FIXTURES.pipeline.length },
      ] as const).map(item => (
        <TouchableOpacity
          key={item.id}
          onPress={() => onNavigate(item.id as Section)}
          style={[
            hm.jumpRow,
            { borderColor: theme.surface.border, borderRadius: theme.shape.sm, backgroundColor: theme.surface.s1 },
          ]}
        >
          <Ionicons name={item.icon as any} size={18} color={theme.accent} />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: theme.surface.t1 }}>{item.label}</Text>
          {item.count > 0 && (
            <View style={[hm.countPill, { backgroundColor: theme.accent, borderRadius: theme.shape.chip }]}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{item.count}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={14} color={theme.surface.t3} />
        </TouchableOpacity>
      ))}
    </>
  );
}

const hm = StyleSheet.create({
  jumpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, marginBottom: 8 },
  countPill: { paddingHorizontal: 8, paddingVertical: 2 },
});

const pip = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, marginBottom: 12 },
});

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHeading({ title, theme }: { title: string; theme: any }) {
  return (
    <Text style={[m.sectionTitle, { color: theme.surface.t1, fontFamily: theme.type.display }]}>
      {title}
    </Text>
  );
}

function EmptyState({ mood, message, theme }: { mood: any; message: string; theme: any }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 32, gap: 12 }}>
      <DillyFace size={72} mood={mood} ring={false} />
      <Text style={{ fontSize: 14, color: theme.surface.t2, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, alignItems: 'flex-start', paddingBottom: 2 },
  settingsBtn: { width: 36, alignItems: 'flex-end', paddingBottom: 2 },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, marginTop: 1 },
  navBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  navLabel: { fontSize: 12, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: 24 },
});
