/**
 * @bacons/apple-targets config for the Dilly home-screen widget.
 *
 * Generates a WidgetKit extension target during `expo prebuild`.
 * Shares the App Group with the main app so the widget can read
 * cached data (top job match, readiness score, new-jobs count)
 * without an API call.
 *
 * Three families: small (2x2), medium (4x2), large (4x4). Lock-screen
 * accessories live in a separate target if we add them later.
 */

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'DillyWidget',
  displayName: 'Dilly',
  icon: '../../assets/icon.png',
  colors: {
    $accent: { color: '#3B82F6', darkColor: '#60A5FA' },
    widgetBackground: { color: '#FFFFFF', darkColor: '#0B1426' },
  },
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.dilly.app'],
  },
  deploymentTarget: '17.0',
};
