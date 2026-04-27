/**
 * AI Arena - tab entry point.
 *
 * V2 is the only path. Immediately replaces to the field-intel screen
 * inside the arena stack. All V1 code has been removed.
 */

import { useEffect } from 'react'
import { router } from 'expo-router'

export default function AIArenaEntryPoint() {
  useEffect(() => {
    router.replace('/(app)/arena/field-intel' as any)
  }, [])
  return null
}
