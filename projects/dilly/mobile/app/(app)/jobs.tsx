/**
 * Jobs — BISECT STAGE 1 (build 351).
 *
 * Keeps render ultra-minimal but re-adds every import from the full
 * Jobs screen. If the app crashes when you tap this tab, the culprit
 * is a module side effect at require time (something in one of the
 * imports is initializing and blowing up). If it loads fine, imports
 * are safe and stage 2 will bring back the hooks.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator,
  Linking, RefreshControl, LayoutAnimation, Animated, Image, Modal,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Dimensions, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { dilly } from '../../lib/dilly';
import { colors, spacing, radius } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import { DillyFace } from '../../components/DillyFace';
import DillyFooter from '../../components/DillyFooter';
import InlineToastView, { useInlineToast } from '../../components/InlineToast';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';
import { useAppMode } from '../../hooks/useAppMode';
import { useSituationCopy } from '../../hooks/useSituationCopy';
import { useResolvedTheme } from '../../hooks/useTheme';
import { useSubscription } from '../../hooks/useSubscription';
import { FirstVisitCoach } from '../../components/FirstVisitCoach';
import { openPaywall } from '../../hooks/usePaywall';
import { useCachedFetch, getCached } from '../../lib/sessionCache';

// Reference every import once so bundlers do not tree-shake the ones
// we are actively probing. Without this, an unused import might be
// dropped from the bundle and we would get a false green on stage 1.
const _unused = {
  useEffect, useState, useCallback, useMemo, useRef,
  TextInput, ActivityIndicator, Linking, RefreshControl, LayoutAnimation,
  Animated, Image, Modal, TouchableOpacity, Alert, KeyboardAvoidingView,
  Platform, Dimensions, Easing, Ionicons, useSafeAreaInsets, router, dilly,
  colors, spacing, radius, AnimatedPressable, FadeInView, DillyFace,
  DillyFooter, InlineToastView, useInlineToast, ErrorBoundary,
  openDillyOverlay, useAppMode, useSituationCopy, useResolvedTheme,
  useSubscription, FirstVisitCoach, openPaywall, useCachedFetch, getCached,
};

export default function JobsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Jobs (stage 1, build 351)</Text>
      <Text style={styles.body}>
        All imports from the full Jobs file are now loaded. Render is still
        trivial (pure RN primitives). If this page shows up, module-level
        side effects are safe and we move to stage 2: hooks.
      </Text>
      <Text style={styles.body}>
        If the app kicked you out instead, one of the imports is crashing
        at require time and we investigate which.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 24, paddingTop: 80 },
  title: { fontSize: 22, fontWeight: '800', color: '#0E0E18', marginBottom: 12 },
  body: { fontSize: 14, color: '#333', lineHeight: 21, marginBottom: 12 },
});
