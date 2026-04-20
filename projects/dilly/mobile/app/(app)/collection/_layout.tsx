/**
 * Collection stack layout. Same reasoning as chapter/_layout —
 * without this, expo-router would auto-register collection/[id]
 * as a sibling tab. This makes the whole directory a single Stack
 * that the parent Tabs treats as one entry.
 */

import { Stack } from 'expo-router';

export default function CollectionLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
