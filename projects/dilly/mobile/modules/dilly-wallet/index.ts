/**
 * dilly-wallet — Apple Wallet pass support.
 *
 * The pass file itself is generated server-side (signed with Dilly's
 * Pass Type ID + WWDR cert). This module handles the client side:
 *   1. addPass(passUrl)        — download the .pkpass and present the
 *                                "Add to Apple Wallet" sheet
 *   2. canAddPasses()          — true if the device supports Wallet
 *   3. hasPass(passId)         — check if a pass is already added
 *
 * Server endpoint to create the pass: GET /wallet/career-pass
 *   returns: { url: 'https://api.dilly.app/wallet/passes/<id>.pkpass' }
 *
 * Refreshing: passes can be updated server-side; iOS polls webServiceURL
 * declared in pass.json (handled by backend, not this module).
 */
import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

let _native: any = null;
function _mod(): any {
  if (Platform.OS !== 'ios') return null;
  if (_native) return _native;
  try {
    _native = requireNativeModule('DillyWallet');
    return _native;
  } catch {
    return null;
  }
}

/** True if the device can add Apple Wallet passes. False on simulator
 *  where PassKit is unavailable. */
export async function canAddPasses(): Promise<boolean> {
  const m = _mod();
  if (!m?.canAddPasses) return false;
  try {
    return Boolean(await m.canAddPasses());
  } catch {
    return false;
  }
}

/** True if a pass with this serial number is already in the user's
 *  Wallet. Used to flip "Add to Wallet" → "Open in Wallet" in the UI. */
export async function hasPass(passTypeId: string, serial: string): Promise<boolean> {
  const m = _mod();
  if (!m?.hasPass) return false;
  try {
    return Boolean(await m.hasPass(passTypeId, serial));
  } catch {
    return false;
  }
}

/** Download the .pkpass at `url` and present the system "Add to
 *  Wallet" sheet. Resolves true on add, false on cancel. */
export async function addPass(url: string): Promise<boolean> {
  const m = _mod();
  if (!m?.addPass) return false;
  try {
    return Boolean(await m.addPass(url));
  } catch {
    return false;
  }
}

export default { canAddPasses, hasPass, addPass };
