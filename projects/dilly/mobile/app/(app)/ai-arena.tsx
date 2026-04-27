/**
 * AI Arena - tab entry point.
 *
 * Renders the FieldIntelScreen directly. The previous implementation
 * did `router.replace('/(app)/arena/field-intel')` from a useEffect on
 * a null-rendering component, which left a white screen on tab re-entry:
 * the entry point would mount, return null, then try to navigate cross-
 * tab to a different stack - on the second visit the redirect fired
 * after the tab already showed the empty placeholder, so the user saw
 * navbar + nothing. Direct render guarantees content on every visit.
 */

import FieldIntelScreen from './arena/field-intel'

export default function AIArenaEntryPoint() {
  return <FieldIntelScreen />
}
