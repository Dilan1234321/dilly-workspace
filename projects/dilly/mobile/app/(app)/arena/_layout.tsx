/**
 * Arena stack layout — keeps every /arena/* sub-page inside the arena
 * tab so we do not end up with ghost tabs in the navbar (same reason
 * /chapter and /skills have their own _layout.tsx). Slide-in-from-
 * right animation for the tap-into-a-tool feel.
 */

import { Stack } from 'expo-router'

export default function ArenaStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 260,
      }}
    />
  )
}
