/**
 * Navigation helpers.
 *
 * safeBack — the back button users expect. expo-router's Tabs.Screen
 * entries don't always participate in a proper stack history; a
 * router.push from one hidden-tab screen to another can end up with
 * canGoBack()=false, and the default router.back() silently falls
 * back to the initial tab. That's why users on My Dilly -> resume
 * detail -> Back land on Home instead of My Dilly.
 *
 * safeBack(fallback) first tries router.back() when there IS stack
 * history; otherwise it router.replace()s to the screen that should
 * be the sensible parent of the current screen. Each screen passes
 * its own fallback — "/(app)/my-dilly-profile" for resume-generate,
 * "/(app)/jobs" for internship-tracker, etc.
 *
 * Intentionally not a hook — usable from inline onPress handlers
 * without prop-threading the router.
 */

import { router } from 'expo-router'

export function safeBack(fallback: string): void {
  if (router.canGoBack()) {
    router.back()
  } else {
    // `as any` — expo-router's typed route union doesn't include the
    // parenthesized group segments; passing the string directly works.
    router.replace(fallback as any)
  }
}
