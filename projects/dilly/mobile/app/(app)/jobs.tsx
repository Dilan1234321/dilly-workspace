/**
 * Jobs — MINIMAL DIAGNOSTIC VERSION (build 350).
 *
 * The real Jobs screen (full feature set) lives at
 * /mobile/_parked/jobs.full.tsx.txt — not routable, expo-router ignores
 * non .tsx files outside app/.
 *
 * This stripped version exists to answer one question: does pressing
 * the Jobs tab crash the app? If THIS minimal screen loads, the crash
 * is in the full Jobs render path (and we can bisect). If THIS also
 * crashes, the problem is structural (router, tab registration, a
 * parent layout side effect).
 *
 * Pure React Native primitives. No imports from ../../lib, no hooks,
 * no network, no SVG, no animation.
 */

import { View, Text, ScrollView, StyleSheet } from 'react-native';

export default function JobsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Jobs (diagnostic)</Text>
      <Text style={styles.body}>
        If you can see this, the Jobs tab itself is fine. The crash was
        coming from inside the full Jobs screen — we can bisect from here.
      </Text>
      <Text style={styles.body}>
        Build 350. Minimal render: no hooks, no fetch, no native modules
        beyond core RN.
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
