/**
 * dilly-scanner — VisionKit document camera + Vision OCR.
 *
 * Three async functions exposed to RN:
 *   scanDocument()              → opens system scanner, returns
 *                                 { fileUris, pageCount }
 *   scanAndExtractText()        → same + OCRs every page, returns
 *                                 { fileUris, text, pageCount }
 *   extractTextFromImage(uri)   → OCR an existing image at uri,
 *                                 returns { text }
 *
 * All silently no-op (return null / empty) on Android / web. iOS only.
 * Cancellation throws — wrap in try/catch.
 */
import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

let _native: any = null;
function _mod(): any {
  if (Platform.OS !== 'ios') return null;
  if (_native) return _native;
  try {
    _native = requireNativeModule('DillyScanner');
    return _native;
  } catch {
    return null;
  }
}

export interface ScanResult {
  fileUris: string[];
  pageCount: number;
  text?: string;
}

export async function scanDocument(): Promise<ScanResult | null> {
  const m = _mod();
  if (!m?.scanDocument) return null;
  return await m.scanDocument();
}

export async function scanAndExtractText(): Promise<ScanResult | null> {
  const m = _mod();
  if (!m?.scanAndExtractText) return null;
  return await m.scanAndExtractText();
}

export async function extractTextFromImage(uri: string): Promise<string | null> {
  const m = _mod();
  if (!m?.extractTextFromImage) return null;
  try {
    const result = await m.extractTextFromImage(uri);
    return (result?.text as string) || '';
  } catch {
    return null;
  }
}

export default { scanDocument, scanAndExtractText, extractTextFromImage };
