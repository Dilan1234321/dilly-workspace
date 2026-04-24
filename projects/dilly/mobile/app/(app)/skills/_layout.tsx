/**
 * Skills stack layout.
 *
 * Same reason as chapter/_layout.tsx: without this, expo-router walks
 * every file in app/(app)/skills/ (ask, library, trending, cohort,
 * video) and registers each as a sibling of the parent Tabs layout,
 * adding ghost tabs to the navbar. A nested Stack here tells
 * expo-router "Skills is one logical surface — render it as a single
 * stack", so the parent Tabs sees only one `skills` entry and every
 * sub-page (cohort detail, video detail, ask, library, trending)
 * pushes onto that stack.
 *
 * End result: one Skills tab in the navbar; everything else is
 * accessed from the Skills home page.
 */

import { Stack } from 'expo-router';

export default function SkillsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 260,
      }}
    />
  );
}
