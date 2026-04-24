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
        // ios_from_right uses native iOS interactive swipe-back + the
        // platform's own easing curve, which reads much smoother than
        // the generic slide_from_right. Back swipe works automatically.
        animation: 'ios_from_right',
        animationDuration: 320,
        gestureEnabled: true,
        // Respect the user's reduce-motion setting so accessibility
        // doesn't get a jerky slide.
        animationTypeForReplace: 'push',
      }}
    />
  )
}
