/**
 * Chapter stack layout.
 *
 * Without this, expo-router walks every file in app/(app)/chapter/
 * (index, notes, schedule) and registers each one as a sibling of
 * the parent Tabs layout, which adds three ghost tabs to the navbar
 * on top of the 4 intended ones. A nested Stack layout here tells
 * expo-router "this directory is one logical surface - render it
 * as a single stack", which means the parent Tabs sees only a
 * single `chapter` entry (already hidden via href:null in the
 * parent _layout).
 */

import { Stack } from 'expo-router';

export default function ChapterLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // ios_from_right enables the native iOS interactive
        // swipe-from-left-edge gesture out of the box.
        animation: 'ios_from_right',
        animationDuration: 260,
        gestureEnabled: true,
        // Make the back gesture work from anywhere on the screen,
        // not just the 25-px-wide left edge - easier to discover and
        // matches the Apple-app standard.
        fullScreenGestureEnabled: true,
      }}
    />
  );
}
