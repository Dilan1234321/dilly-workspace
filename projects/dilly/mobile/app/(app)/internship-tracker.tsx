import { safeBack } from '../../lib/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { DillyFace } from '../../components/DillyFace';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import { openAddToCalendar } from '../../lib/calendar';
import { useResolvedTheme } from '../../hooks/useTheme';
import { showToast } from '../../lib/globalToast';
import { showConfirm } from '../../lib/globalConfirm';

const GOLD   = '#2B3A8E';
const GREEN  = '#34C759';
const AMBER  = '#FF9F0A';
const CORAL  = '#FF453A';
const BLUE   = '#0A84FF';
const INDIGO = '#5E5CE6';

// ── Types ─────────────────────────────────────────────────────────────────────

type AppStatus = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected';

interface Application {
  id: string;
  company: string;
  role: string;
  status: AppStatus;
  applied_at?: string | null;
  deadline?: string | null;
  match_pct?: number | null;
  job_url?: string | null;
  notes?: string | null;
  next_action?: string | null;
  created_at?: string;
  updated_at?: string;
}

const STATUSES: { key: AppStatus; label: string; color: string; icon: string }[] = [
  { key: 'saved',        label: 'Saved',        color: colors.t3,  icon: 'bookmark-outline' },
  { key: 'applied',      label: 'Applied',      color: BLUE,       icon: 'paper-plane-outline' },
  { key: 'interviewing', label: 'Interviewing', color: AMBER,      icon: 'people-outline' },
  { key: 'offer',        label: 'Offer',        color: GREEN,      icon: 'trophy-outline' },
  { key: 'rejected',     label: 'Rejected',     color: CORAL,      icon: 'close-circle-outline' },
];

function statusConfig(s: AppStatus) {
  return STATUSES.find(x => x.key === s) || STATUSES[0];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 0) return `In ${Math.abs(diff)}d`;
  return `${diff}d ago`;
}

// ── Pipeline summary ──────────────────────────────────────────────────────────

function PipelineSummary({ apps }: { apps: Application[] }) {
  const theme = useResolvedTheme();
  const counts = useMemo(() => {
    const c: Record<AppStatus, number> = { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 };
    for (const a of apps) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  }, [apps]);

  return (
    <View style={[ts.pipelineWrap, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
      <View style={ts.pipelineHeader}>
        <Ionicons name="git-branch-outline" size={14} color={theme.accent} />
        <Text style={[ts.pipelineTitle, { color: theme.accent }]}>YOUR PIPELINE</Text>
        <Text style={[ts.pipelineTotal, { color: theme.surface.t3 }]}>{apps.length} total</Text>
      </View>
      <View style={ts.pipelineRow}>
        {STATUSES.map(s => (
          <View key={s.key} style={ts.pipelineCol}>
            <Text style={[ts.pipelineNum, { color: counts[s.key] > 0 ? s.color : theme.surface.t3 }]}>
              {counts[s.key]}
            </Text>
            <Text style={[ts.pipelineLabel, { color: theme.surface.t3 }]}>{s.label}</Text>
            <View style={[ts.pipelineDot, { backgroundColor: counts[s.key] > 0 ? s.color : theme.surface.border }]} />
          </View>
        ))}
      </View>
      {/* Progress bar */}
      <View style={[ts.pipelineBar, { backgroundColor: theme.surface.s2 }]}>
        {STATUSES.filter(s => counts[s.key] > 0).map(s => (
          <View
            key={s.key}
            style={[ts.pipelineBarSeg, { flex: counts[s.key], backgroundColor: s.color + '60' }]}
          />
        ))}
      </View>
      {/* Build-78: silent apps warning */}
      {(() => {
        const now = Date.now();
        const silent = apps.filter(a => {
          if (a.status !== 'applied' || !a.applied_at) return false;
          try {
            return (now - new Date(a.applied_at).getTime()) > 14 * 86400000;
          } catch { return false; }
        });
        if (silent.length === 0) return null;
        return (
          <View style={ts.silentBanner}>
            <Ionicons name="alert-circle" size={12} color={AMBER} />
            <Text style={ts.silentText}>
              {silent.length} application{silent.length !== 1 ? 's' : ''} went quiet (2+ weeks). Follow up this week.
            </Text>
          </View>
        );
      })()}
    </View>
  );
}

// ── Status pill selector ──────────────────────────────────────────────────────

function StatusPills({ current, onChange }: { current: AppStatus; onChange: (s: AppStatus) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ts.statusPillRow}>
      {STATUSES.map(s => (
        <AnimatedPressable
          key={s.key}
          style={[ts.statusPill, current === s.key && { backgroundColor: s.color + '20', borderColor: s.color + '40' }]}
          onPress={() => onChange(s.key)}
          scaleDown={0.95}
        >
          <Ionicons name={s.icon as any} size={12} color={current === s.key ? s.color : colors.t3} />
          <Text style={[ts.statusPillText, current === s.key && { color: s.color }]}>{s.label}</Text>
        </AnimatedPressable>
      ))}
    </ScrollView>
  );
}

// ── Application Card ──────────────────────────────────────────────────────────

function AppCard({ app, onStatusChange, onDelete, onEdit, onTailor, onFollowUp }: {
  app: Application;
  onStatusChange: (id: string, status: AppStatus) => void;
  onDelete: (id: string) => void;
  onEdit: (app: Application) => void;
  onTailor: (app: Application) => void;
  onFollowUp: (app: Application) => void;
}) {
  const theme = useResolvedTheme();
  const cfg = statusConfig(app.status);
  const isInterviewing = app.status === 'interviewing';
  const appliedAge = daysAgo(app.applied_at);
  const isSilent = app.status === 'applied' && app.applied_at && (() => {
    try { return (Date.now() - new Date(app.applied_at).getTime()) > 14 * 86400000; } catch { return false; }
  })();

  // Deadline info
  const hasDeadline = !!app.deadline;
  const deadlineDays = hasDeadline ? (() => {
    try {
      const parts = (app.deadline || '').slice(0, 10).split('-');
      const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      const now = new Date(); now.setHours(0,0,0,0); d.setHours(0,0,0,0);
      return Math.ceil((d.getTime() - now.getTime()) / 86400000);
    } catch { return 999; }
  })() : 999;
  const deadlineUrgent = deadlineDays >= 0 && deadlineDays <= 3;

  // Next status actions
  const nextStatuses: AppStatus[] = [];
  if (app.status === 'saved') nextStatuses.push('applied');
  if (app.status === 'applied') nextStatuses.push('interviewing', 'rejected');
  if (app.status === 'interviewing') nextStatuses.push('offer', 'rejected');

  return (
    <AnimatedPressable
      style={[
        ts.appCard,
        { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
        isInterviewing && { borderColor: AMBER + '30' },
        deadlineUrgent && { borderColor: CORAL + '30' },
      ]}
      onPress={() => onEdit(app)}
      scaleDown={0.985}
    >
      {/* Header */}
      <View style={ts.appCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[ts.appCompany, { color: theme.surface.t1 }]} numberOfLines={1}>{app.company}</Text>
          <Text style={[ts.appRole, { color: theme.surface.t2 }]} numberOfLines={1}>{app.role}</Text>
        </View>
        <View style={[ts.statusBadge, { backgroundColor: cfg.color + '15', borderColor: cfg.color + '30' }]}>
          <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
          <Text style={[ts.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Meta */}
      <View style={ts.appMeta}>
        {appliedAge ? (
          <View style={[ts.appMetaChip, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border }]}>
            <Ionicons name="time-outline" size={10} color={theme.surface.t3} />
            <Text style={[ts.appMetaText, { color: theme.surface.t2 }]}>{appliedAge}</Text>
          </View>
        ) : null}
        {hasDeadline && deadlineDays < 999 && (
          <View style={[
            ts.appMetaChip,
            { backgroundColor: theme.surface.s2, borderColor: theme.surface.border },
            deadlineUrgent && { backgroundColor: CORAL + '10', borderColor: CORAL + '30' },
          ]}>
            <Ionicons name="calendar-outline" size={10} color={deadlineUrgent ? CORAL : theme.surface.t3} />
            <Text style={[
              ts.appMetaText,
              { color: theme.surface.t2 },
              deadlineUrgent && { color: CORAL, fontWeight: '700' },
            ]}>
              {deadlineDays === 0 ? 'Due today' : deadlineDays === 1 ? 'Due tomorrow' : deadlineDays > 0 ? `${deadlineDays}d left` : 'Overdue'}
            </Text>
          </View>
        )}
        {app.match_pct != null && (
          <View style={[ts.appMetaChip, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
            <Ionicons name="analytics-outline" size={10} color={theme.accent} />
            <Text style={[ts.appMetaText, { color: theme.accent }]}>{app.match_pct}% match</Text>
          </View>
        )}
        {isSilent && (
          <View style={[ts.appMetaChip, { backgroundColor: CORAL + '10', borderColor: CORAL + '30' }]}>
            <Ionicons name="alert-circle" size={10} color={CORAL} />
            <Text style={[ts.appMetaText, { color: CORAL }]}>No response 2+ weeks</Text>
          </View>
        )}
      </View>

      {/* Notes / next action */}
      {app.next_action ? (
        <View style={[ts.nextActionRow, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
          <Ionicons name="flash" size={10} color={theme.accent} />
          <Text style={[ts.nextActionText, { color: theme.surface.t1 }]} numberOfLines={1}>{app.next_action}</Text>
        </View>
      ) : null}

      {/* Quick actions: tailor + follow-up + calendar */}
      <View style={ts.quickActionRow}>
        <AnimatedPressable
          style={[ts.quickAction, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
          onPress={() => onTailor(app)}
          scaleDown={0.95}
        >
          <Ionicons name="document-text-outline" size={11} color={theme.accent} />
          <Text style={[ts.quickActionText, { color: theme.accent }]}>Tailor</Text>
        </AnimatedPressable>
        {isSilent && (
          <AnimatedPressable style={ts.quickAction} onPress={() => onFollowUp(app)} scaleDown={0.95}>
            <Ionicons name="mail-outline" size={11} color={CORAL} />
            <Text style={[ts.quickActionText, { color: CORAL }]}>Follow up</Text>
          </AnimatedPressable>
        )}
        {hasDeadline && (
          <AnimatedPressable
            style={ts.quickAction}
            onPress={() => openAddToCalendar({
              title: `${app.company}  -  ${app.role || 'deadline'}`,
              date: (app.deadline || '').slice(0, 10),
              description: app.notes || 'Application deadline',
            })}
            scaleDown={0.95}
          >
            <Ionicons name="calendar-outline" size={11} color={GREEN} />
            <Text style={[ts.quickActionText, { color: GREEN }]}>Add to cal</Text>
          </AnimatedPressable>
        )}
        {app.job_url && (
          <AnimatedPressable style={ts.quickAction} onPress={() => Linking.openURL(app.job_url!)} scaleDown={0.95}>
            <Ionicons name="open-outline" size={11} color={BLUE} />
            <Text style={[ts.quickActionText, { color: BLUE }]}>Open</Text>
          </AnimatedPressable>
        )}
      </View>

      {/* Status progression buttons */}
      <View style={ts.appActions}>
        {nextStatuses.map(ns => {
          const nsCfg = statusConfig(ns);
          return (
            <AnimatedPressable
              key={ns}
              style={[ts.actionChip, { borderColor: nsCfg.color + '30' }]}
              onPress={() => onStatusChange(app.id, ns)}
              scaleDown={0.95}
            >
              <Ionicons name={nsCfg.icon as any} size={10} color={nsCfg.color} />
              <Text style={[ts.actionChipText, { color: nsCfg.color }]}>
                {ns === 'applied' ? 'Mark Applied' : ns === 'interviewing' ? 'Got Interview' : ns === 'offer' ? 'Got Offer' : 'Rejected'}
              </Text>
            </AnimatedPressable>
          );
        })}
        <AnimatedPressable onPress={() => onDelete(app.id)} scaleDown={0.9} hitSlop={8}>
          <Ionicons name="trash-outline" size={13} color={colors.t3 + '50'} />
        </AnimatedPressable>
      </View>
    </AnimatedPressable>
  );
}

// ── Add Application Modal ─────────────────────────────────────────────────────

function AddAppModal({ visible, onClose, onAdd }: {
  visible: boolean; onClose: () => void;
  onAdd: (company: string, role: string, notes: string, deadline?: string, jobUrl?: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const onAccent = (() => {
    const hex = (theme.accent || '').replace('#', '');
    if (hex.length !== 6) return '#fff';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#0B1426' : '#FFFFFF';
  })();
  const [company, setCompany]   = useState('');
  const [role, setRole]         = useState('');
  const [notes, setNotes]       = useState('');
  const [deadline, setDeadline] = useState('');
  const [jobUrl, setJobUrl]     = useState('');

  function handleAdd() {
    if (!company.trim()) { showToast({ message: 'Company required', type: 'error' }); return; }
    if (!role.trim()) { showToast({ message: 'Role required', type: 'error' }); return; }
    onAdd(
      company.trim(), role.trim(), notes.trim(),
      deadline.trim() || undefined,
      jobUrl.trim() || undefined,
    );
    setCompany(''); setRole(''); setNotes(''); setDeadline(''); setJobUrl('');
    onClose();
  }

  const inputStyle = [ts.modalInput, { backgroundColor: theme.surface.s2, borderColor: theme.surface.border, color: theme.surface.t1 }];

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={ts.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ justifyContent: 'flex-end' }}>
          <View style={[ts.modalCard, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, paddingBottom: insets.bottom + 20 }]}>
            <View style={ts.modalHeader}>
              <Text style={[ts.modalTitle, { color: theme.surface.t1 }]}>Track Application</Text>
              <AnimatedPressable onPress={onClose} scaleDown={0.9} hitSlop={12}>
                <Ionicons name="close" size={20} color={theme.surface.t2} />
              </AnimatedPressable>
            </View>

            <TextInput style={inputStyle} value={company} onChangeText={setCompany} placeholder="Company name" placeholderTextColor={theme.surface.t3} autoFocus />
            <TextInput style={inputStyle} value={role} onChangeText={setRole} placeholder="Role (e.g. Data Science Intern)" placeholderTextColor={theme.surface.t3} />
            <TextInput style={inputStyle} value={deadline} onChangeText={setDeadline} placeholder="Deadline (YYYY-MM-DD, optional)" placeholderTextColor={theme.surface.t3} keyboardType="numbers-and-punctuation" />
            <TextInput style={inputStyle} value={jobUrl} onChangeText={setJobUrl} placeholder="Job URL (optional)" placeholderTextColor={theme.surface.t3} autoCapitalize="none" keyboardType="url" />
            <TextInput style={[...inputStyle, { minHeight: 56 }]} value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor={theme.surface.t3} multiline />

            <AnimatedPressable style={[ts.modalBtn, { backgroundColor: theme.accent }]} onPress={handleAdd} scaleDown={0.97}>
              <Ionicons name="add-circle" size={16} color={onAccent} />
              <Text style={[ts.modalBtnText, { color: onAccent }]}>Add to Pipeline</Text>
            </AnimatedPressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function InternshipTrackerScreen() {
  const insets = useSafeAreaInsets();
  // Full theme so the tracker flips with Customize Dilly. Previously
  // the page used frozen colors.bg / colors.s1 via StyleSheet which
  // meant it stayed dark-themed regardless of user preference.
  const theme = useResolvedTheme();

  const [apps, setApps]             = useState<Application[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchKey, setFetchKey]     = useState(0);
  const [showAdd, setShowAdd]       = useState(false);
  const [filterStatus, setFilterStatus] = useState<AppStatus | 'all'>('all');
  const [profile, setProfile]       = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      try {
        const [appsRes, profileRes] = await Promise.all([
          dilly.get('/applications'),
          dilly.get('/profile'),
        ]);
        setApps(appsRes?.applications || []);
        setProfile(profileRes || {});
      } catch {}
      finally { setLoading(false); }
    })();
  }, [fetchKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFetchKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return apps;
    return apps.filter(a => a.status === filterStatus);
  }, [apps, filterStatus]);

  // Sort: interviewing first, then applied, saved, offer, rejected
  const sorted = useMemo(() => {
    const order: Record<AppStatus, number> = { interviewing: 0, applied: 1, saved: 2, offer: 3, rejected: 4 };
    return [...filtered].sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));
  }, [filtered]);

  async function handleAdd(company: string, role: string, notes: string, deadline?: string, jobUrl?: string) {
    try {
      const res = await dilly.fetch('/applications', {
        method: 'POST',
        body: JSON.stringify({
          company, role, status: 'saved',
          notes: notes || undefined,
          deadline: deadline || undefined,
          job_url: jobUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data?.application) {
        setApps(prev => [data.application, ...prev]);
      }
    } catch {
      showToast({ message: 'Could not save this application. Check your connection and try again.', type: 'error' });
    }
  }

  async function handleStatusChange(id: string, status: AppStatus) {
    const previousApps = [...apps];
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    try {
      await dilly.fetch(`/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    } catch {
      setApps(previousApps);
      showToast({ message: 'Status update failed. Your change was not saved.', type: 'error' });
    }
  }

  async function handleDelete(id: string) {
    const ok = await showConfirm({
      title: 'Remove application?',
      message: 'This will remove it from your pipeline.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    setApps(prev => prev.filter(a => a.id !== id));
    try { await dilly.delete(`/applications/${id}`); } catch {}
  }

  function handleTailor(app: Application) {
    router.push('/(app)/resume-generate');
  }

  function handleFollowUp(app: Application) {
    const appliedDays = app.applied_at
      ? Math.round((Date.now() - new Date(app.applied_at).getTime()) / 86400000)
      : 14;
    openDillyOverlay({
      name: '', cohort: '', score: 0, smart: 0, grit: 0, build: 0, gap: 0, cohortBar: 75,
      referenceCompany: app.company,
      applicationTarget: `${app.role} at ${app.company}`,
      isPaid: true,
      initialMessage: `Help me write a follow-up email to ${app.company} about the ${app.role} position I applied to ${appliedDays} days ago. Keep it short, professional, and genuine  -  not pushy.`,
    });
  }

  function handleEdit(app: Application) {
    // Show a detail view with all fields and actions
    const lines: string[] = [];
    lines.push(`Role: ${app.role}`);
    lines.push(`Status: ${statusConfig(app.status).label}`);
    if (app.applied_at) lines.push(`Applied: ${daysAgo(app.applied_at)}`);
    if (app.deadline) lines.push(`Deadline: ${app.deadline}`);
    if (app.notes) lines.push(`Notes: ${app.notes}`);
    if (app.next_action) lines.push(`Next: ${app.next_action}`);

    const buttons: any[] = [{ text: 'Close' }];
    if (app.job_url) buttons.push({ text: 'Open Link', onPress: () => Linking.openURL(app.job_url!) });
    buttons.push({
      text: 'Tailor Resume',
      onPress: () => handleTailor(app),
    });
    Alert.alert(app.company, lines.join('\n'), buttons);
  }

  if (loading) {
    return (
      <View style={[ts.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', paddingBottom: 80, backgroundColor: theme.surface.bg }]}>
        <DillyFace size={100} />
        <Text style={{ color: theme.surface.t2, fontSize: 15, fontWeight: '600', marginTop: 20 }}>Loading your pipeline...</Text>
      </View>
    );
  }

  return (
    <View style={[ts.container, { paddingTop: insets.top, backgroundColor: theme.surface.bg }]}>

      {/* Nav bar */}
      <FadeInView delay={0}>
        <View style={[ts.navBar, { borderBottomColor: theme.surface.border }]}>
          <AnimatedPressable onPress={() => safeBack('/(app)/jobs')} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={theme.surface.t1} />
          </AnimatedPressable>
          <Text style={[ts.navTitle, { color: theme.surface.t1 }]}>Tracker</Text>
          <AnimatedPressable onPress={() => setShowAdd(true)} scaleDown={0.9} hitSlop={12}>
            <View style={[ts.addBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
              <Ionicons name="add" size={18} color={theme.accent} />
            </View>
          </AnimatedPressable>
        </View>
      </FadeInView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[ts.scroll, { paddingBottom: insets.bottom + 80 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2B3A8E" />}>

        {/* Pipeline summary */}
        <FadeInView delay={60}>
          <PipelineSummary apps={apps} />
        </FadeInView>

        {/* Filter pills */}
        <FadeInView delay={120}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ts.filterRow}>
            <AnimatedPressable
              style={[
                ts.statusPill,
                { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                filterStatus === 'all' && { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder },
              ]}
              onPress={() => setFilterStatus('all')}
              scaleDown={0.95}
            >
              <Text style={[
                ts.statusPillText,
                { color: theme.surface.t2 },
                filterStatus === 'all' && { color: theme.accent },
              ]}>All ({apps.length})</Text>
            </AnimatedPressable>
            {STATUSES.map(s => {
              const count = apps.filter(a => a.status === s.key).length;
              return (
                <AnimatedPressable
                  key={s.key}
                  style={[
                    ts.statusPill,
                    { backgroundColor: theme.surface.s1, borderColor: theme.surface.border },
                    filterStatus === s.key && { backgroundColor: s.color + '20', borderColor: s.color + '40' },
                  ]}
                  onPress={() => setFilterStatus(s.key)}
                  scaleDown={0.95}
                >
                  <Ionicons name={s.icon as any} size={10} color={filterStatus === s.key ? s.color : theme.surface.t3} />
                  <Text style={[
                    ts.statusPillText,
                    { color: theme.surface.t2 },
                    filterStatus === s.key && { color: s.color },
                  ]}>{s.label} ({count})</Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
        </FadeInView>

        {/* Application cards */}
        {sorted.length === 0 ? (
          <FadeInView delay={180}>
            <View style={[ts.emptyWrap, { backgroundColor: theme.surface.s1, borderColor: theme.surface.border }]}>
              <Ionicons name="briefcase-outline" size={40} color={theme.surface.t3 + '60'} />
              <Text style={[ts.emptyTitle, { color: theme.surface.t1 }]}>No applications yet</Text>
              <Text style={[ts.emptyText, { color: theme.surface.t2 }]}>
                Find a job on the Internships page and tap "Apply + Track"  -  or add one manually below.
              </Text>
              <AnimatedPressable style={[ts.emptyBtn, { backgroundColor: theme.accent }]} onPress={() => setShowAdd(true)} scaleDown={0.97}>
                <Ionicons name="add-circle" size={16} color="#FFFFFF" />
                <Text style={ts.emptyBtnText}>Add manually</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[ts.emptyBtn, { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accentBorder, marginTop: 8 }]}
                onPress={() => router.push('/(app)/jobs')}
                scaleDown={0.97}
              >
                <Ionicons name="search" size={14} color={theme.accent} />
                <Text style={[ts.emptyBtnText, { color: theme.accent }]}>Browse jobs</Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        ) : (
          sorted.map((app, i) => (
            <FadeInView key={app.id} delay={180 + i * 40}>
              <AppCard
                app={app}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onTailor={handleTailor}
                onFollowUp={handleFollowUp}
              />
            </FadeInView>
          ))
        )}

      </ScrollView>


      <AddAppModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ts = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.b1,
  },
  navTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(43,58,142,0.12)', borderWidth: 1, borderColor: 'rgba(43,58,142,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: 16 },

  // Pipeline
  pipelineWrap: {
    backgroundColor: colors.s2, borderRadius: 16, borderWidth: 1, borderColor: colors.b1,
    padding: 16, marginBottom: 16,
  },
  pipelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  pipelineTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 9, letterSpacing: 1.5, color: GOLD, flex: 1 },
  pipelineTotal: { fontSize: 11, color: colors.t3, fontWeight: '600' },
  pipelineRow: { flexDirection: 'row', marginBottom: 10 },
  pipelineCol: { flex: 1, alignItems: 'center', gap: 3 },
  pipelineNum: { fontFamily: 'Cinzel_700Bold', fontSize: 18 },
  pipelineLabel: { fontSize: 8, color: colors.t3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  pipelineDot: { width: 6, height: 3, borderRadius: 1.5 },
  pipelineBar: { flexDirection: 'row', height: 4, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.s3 },
  pipelineBarSeg: { height: '100%' },
  silentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF7E6', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    marginTop: 10,
  },
  silentText: { fontSize: 11, color: '#92400E', flex: 1, lineHeight: 15 },

  // Filter
  filterRow: { gap: 6, paddingBottom: 14 },
  statusPillRow: { gap: 6 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.s3, borderRadius: 10, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  statusPillText: { fontSize: 11, color: colors.t3, fontWeight: '600' },

  // App card
  appCard: {
    backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1,
    padding: 14, marginBottom: 10,
  },
  appCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  appCompany: { fontSize: 15, fontWeight: '700', color: colors.t1 },
  appRole: { fontSize: 12, color: colors.t2, marginTop: 1 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Meta
  appMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  appMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.s3, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  appMetaText: { fontSize: 10, color: colors.t3 },

  // Next action
  nextActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(43,58,142,0.06)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6, marginBottom: 8,
  },
  nextActionText: { fontSize: 11, color: GOLD, flex: 1 },

  // Quick action row (tailor, follow-up, calendar, open link)
  quickActionRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8,
  },
  quickAction: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: colors.s3, borderRadius: 7,
    borderWidth: 1, borderColor: colors.b1,
  },
  quickActionText: { fontSize: 10, fontWeight: '600' },

  // Actions
  appActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  actionChipText: { fontSize: 10, fontWeight: '600' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.t1 },
  emptyText: { fontSize: 13, color: colors.t3, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  emptyBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 12, letterSpacing: 0.5, color: '#FFFFFF' },

  // FAB
  fab: {
    position: 'absolute', right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.s1, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingTop: 16,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  modalInput: {
    backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.t1, marginBottom: 10,
  },
  modalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, marginTop: 6,
  },
  modalBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, letterSpacing: 0.5, color: '#FFFFFF' },
});