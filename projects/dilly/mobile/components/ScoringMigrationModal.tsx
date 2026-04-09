/**
 * ScoringMigrationModal  -  one-time notice for existing users after the
 * Tier 2 scoring cutover (2026-04-08).
 *
 * WHY THIS EXISTS
 * ───────────────
 * When a student's old score was 72 under the legacy auditor and their new
 * score is (say) 58 under the rubric scorer, showing them the new number
 * without context would feel like a punishment  -  "why did my score drop?"
 *
 * This modal is the polite explanation: scoring got upgraded, the new number
 * is honest and actionable, here's why. Student taps a single button to
 * acknowledge. Never shown again after that.
 *
 * The gate is an AsyncStorage key `dilly_scoring_v2_seen`. When true, the
 * modal is never shown. Wired into (app)/_layout.tsx so it fires the first
 * time a user opens the main app surface after deploy.
 *
 * DESIGN
 * ──────
 * - White background, brand-blue accents (tokens.colors.gold === #2B3A8E).
 * - Never red, never orange.
 * - One primary action: "Run a new audit".
 * - One secondary action: "Later"  -  just dismisses the modal without
 *   navigating. The student still gets a new score next time they audit.
 * - Non-blocking: student can close the modal without running the audit.
 *   We don't force them into the audit flow because that would feel like
 *   a paywall.
 */

import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing, radius } from '../lib/tokens';

const SEEN_KEY = 'dilly_scoring_v2_seen';

/**
 * Check once on app open whether the migration modal should show.
 * Returns true if the user has NOT yet seen the modal.
 */
async function shouldShowMigrationModal(): Promise<boolean> {
  try {
    const seen = await AsyncStorage.getItem(SEEN_KEY);
    return seen !== 'true';
  } catch {
    // If AsyncStorage fails, don't show the modal  -  better to skip than to
    // spam the user on every open.
    return false;
  }
}

async function markMigrationSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, 'true');
  } catch {
    // Non-fatal  -  the modal will try to show again next session, not a
    // disaster, but also not ideal. Swallow because there's nothing the
    // user can do about it.
  }
}

export default function ScoringMigrationModal() {
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  // Check the AsyncStorage gate once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const should = await shouldShowMigrationModal();
      if (!cancelled) {
        setVisible(should);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRunAudit = async () => {
    if (dismissing) return;
    setDismissing(true);
    await markMigrationSeen();
    setVisible(false);
    // Navigate to the new-audit screen
    router.push('/(app)/new-audit');
  };

  const handleLater = async () => {
    if (dismissing) return;
    setDismissing(true);
    await markMigrationSeen();
    setVisible(false);
  };

  // Don't render anything until the AsyncStorage check finishes, or if we're
  // not supposed to show
  if (checking || !visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleLater}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="trending-up" size={24} color={colors.gold} />
          </View>

          {/* Eyebrow */}
          <Text style={styles.eyebrow}>Dilly scoring upgrade</Text>

          {/* Heading */}
          <Text style={styles.heading}>Your scoring engine just got sharper.</Text>

          {/* Body */}
          <Text style={styles.body}>
            We rebuilt Dilly's scoring around real employer signals from the companies
            you're targeting. Your next audit will show you exactly what's working,
            exactly what's missing, and exactly how to close the gap.
          </Text>

          <Text style={styles.bodySecondary}>
            Run a new audit to see your updated score and your path forward.
          </Text>

          {/* Primary CTA */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleRunAudit}
            disabled={dismissing}
            activeOpacity={0.85}
          >
            {dismissing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Run a new audit</Text>
                <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Secondary action */}
          <TouchableOpacity
            style={styles.laterBtn}
            onPress={handleLater}
            disabled={dismissing}
            activeOpacity={0.7}
          >
            <Text style={styles.laterBtnText}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26,26,46,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bg,
    borderRadius: 18,
    padding: spacing.xl,
    paddingVertical: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.golddim,
    borderWidth: 1,
    borderColor: colors.goldbdr,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  heading: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 20,
    color: colors.t1,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: 13,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  bodySecondary: {
    fontSize: 12,
    color: colors.t2,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: spacing.xl,
  },
  primaryBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
    flexDirection: 'row',
    gap: 7,
    marginBottom: spacing.sm,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  laterBtn: {
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
  },
  laterBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.t3,
  },
});
