/**
 * AddToWalletButton — Apple-styled "Add to Apple Wallet" pill.
 *
 * Self-contained:
 *   - Hides on Android / non-iOS
 *   - Hides if PassKit can't add passes (simulator)
 *   - Fetches the signed pass URL from /wallet/career-pass/url
 *   - Calls dilly-wallet.addPass to present the system add sheet
 *   - Re-checks ownership after add to flip "Open in Wallet" later
 *
 * Honors Apple HIG for Wallet buttons: solid black pill, white wordmark.
 */
import { useEffect, useState } from 'react';
import { View, Text, Platform, ActivityIndicator } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { dilly } from '../lib/dilly';
import { showToast } from '../lib/globalToast';

export default function AddToWalletButton() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setSupported(false);
      return;
    }
    (async () => {
      try {
        const Wallet: any = await import('dilly-wallet').catch(() => null);
        const can = Boolean(await Wallet?.canAddPasses?.());
        setSupported(can);
        if (!can) return;
        // Check if pass already in Wallet (skip if URL fetch fails).
        try {
          const meta = await dilly.get('/wallet/career-pass/url').catch(() => null);
          if (meta?.serial && meta?.pass_type_id) {
            const has = await Wallet.hasPass(meta.pass_type_id, meta.serial);
            setAdded(Boolean(has));
          }
        } catch {}
      } catch {
        setSupported(false);
      }
    })();
  }, []);

  if (Platform.OS !== 'ios' || supported === false) return null;
  if (supported === null) return null;

  async function handlePress() {
    if (busy) return;
    setBusy(true);
    try {
      const Wallet: any = await import('dilly-wallet').catch(() => null);
      if (!Wallet?.addPass) {
        showToast({ message: 'Wallet is not available on this device.', type: 'error' });
        return;
      }
      const meta = await dilly.get('/wallet/career-pass/url').catch(() => null);
      if (!meta?.url) {
        showToast({ message: 'Wallet pass is not ready yet. Try again in a moment.', type: 'error' });
        return;
      }
      // The .pkpass endpoint requires the user's auth token. Pass it
      // through to the native module so URLSession sends Authorization
      // on the download.
      const { authHeaders } = await import('../lib/auth');
      const headers = await authHeaders();
      const ok = await Wallet.addPass(meta.url, headers as Record<string, string>);
      if (ok) {
        setAdded(true);
        showToast({ message: 'Added to Apple Wallet.', type: 'success' });
      }
    } catch (e: any) {
      showToast({ message: e?.message || 'Could not add to Wallet.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      scaleDown={0.97}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, backgroundColor: '#000', paddingVertical: 12, borderRadius: 10,
      }}
    >
      {busy ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          <WalletGlyph />
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff', letterSpacing: 0.2 }}>
            {added ? 'In Apple Wallet' : 'Add to Apple Wallet'}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

// Tiny wallet glyph (rectangle + slot). Avoids shipping an Apple-owned
// asset; close enough to read as "wallet" at button size.
function WalletGlyph() {
  return (
    <View style={{ width: 18, height: 14, justifyContent: 'center' }}>
      <View style={{
        width: 18, height: 12, borderRadius: 2.5,
        borderWidth: 1.4, borderColor: '#fff', backgroundColor: 'transparent',
      }} />
      <View style={{
        position: 'absolute', right: 0, top: 4,
        width: 6, height: 4, borderRadius: 1.5,
        backgroundColor: '#fff',
      }} />
    </View>
  );
}
