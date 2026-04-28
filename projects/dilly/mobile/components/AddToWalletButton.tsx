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
import { View, Text, Platform, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { dilly } from '../lib/dilly';
import { showToast } from '../lib/globalToast';

// Surface diagnostic info via BOTH toast AND system Alert so the user
// can't miss feedback when something fails. Earlier the toast alone
// showed nothing because the press handler was apparently swallowed.
function notify(message: string, type: 'success' | 'error') {
  try { showToast({ message, type }); } catch {}
  if (type === 'error') {
    setTimeout(() => Alert.alert('Add to Apple Wallet', message), 100);
  }
}

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
        const wallet = Wallet?.canAddPasses ? Wallet : Wallet?.default;
        const can = Boolean(await wallet?.canAddPasses?.());
        setSupported(can);
        if (!can) return;
        try {
          const meta = await dilly.get('/wallet/career-pass/url').catch(() => null);
          if (meta?.serial && meta?.pass_type_id && wallet.hasPass) {
            const has = await wallet.hasPass(meta.pass_type_id, meta.serial);
            setAdded(Boolean(has));
          }
        } catch {}
      } catch {
        setSupported(false);
      }
    })();
  }, []);

  if (Platform.OS !== 'ios') return null;
  // Show button even before canAddPasses resolves — earlier this hid
  // the button entirely when the native module didn't load. Now if
  // the module isn't loaded, the press handler shows a friendly
  // toast so the user can see the button is THERE and report back.

  async function handlePress() {
    if (busy) return;
    setBusy(true);
    try {
      const Wallet: any = await import('dilly-wallet').catch(() => null);
      // Two ways the module can resolve: as namespace (Wallet.addPass)
      // or as default-only (Wallet.default.addPass). Try both.
      const wallet = Wallet?.addPass ? Wallet : Wallet?.default;
      if (!wallet?.addPass) {
        notify('Wallet module not loaded. The next app build will fix this.', 'error');
        return;
      }
      const meta = await dilly.get('/wallet/career-pass/url').catch(() => null);
      if (!meta?.url) {
        notify('Wallet pass server is not ready. Check Railway env vars.', 'error');
        return;
      }
      const { authHeaders } = await import('../lib/auth');
      const headers = await authHeaders();
      try {
        const ok = await wallet.addPass(meta.url, headers as Record<string, string>);
        if (ok) {
          setAdded(true);
          notify('Added to Apple Wallet.', 'success');
        } else {
          notify('Wallet returned without adding the pass.', 'error');
        }
      } catch (passErr: any) {
        // Surface the native error verbatim so we know what's wrong:
        // INVALID_PASS = signing/asset issue; DOWNLOAD_FAILED = HTTP
        // error (likely auth or 503 from server); NO_PRESENTER = view
        // controller hierarchy issue; INVALID_URL = bad URL.
        const code = passErr?.code || 'UNKNOWN';
        const msg = passErr?.message || String(passErr);
        notify(`${code}: ${msg}`, 'error');
      }
    } catch (e: any) {
      notify(e?.message || 'Could not add to Wallet.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, backgroundColor: '#000', paddingVertical: 14, borderRadius: 10,
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
    </TouchableOpacity>
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
