/**
 * DillyCard — premium digital business card.
 *
 * Reusable component that renders a business card (3.5:2 ratio).
 * Front: photo + name + school + major + email + QR code.
 * Back: template-specific design with Dilly branding.
 *
 * Supports capture to PNG via react-native-view-shot for sharing.
 *
 * Templates (8 total):
 *   classic, dark, minimal, executive, modern, bold, gradient, stripe
 */

import { useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, Dimensions, TouchableOpacity,
  TextInput, ScrollView, Share, Animated, Easing,
} from 'react-native';
import InlineToastView, { useInlineToast } from './InlineToast';
import { Ionicons } from '@expo/vector-icons';
import { lightHaptic, mediumHaptic, successHaptic } from '../lib/haptics';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
// Lazy-load native modules to prevent crash if not properly linked
let QRCode: any = null;
let captureRef: any = null;
try { QRCode = require('react-native-qrcode-svg').default; } catch {}
try { captureRef = require('react-native-view-shot').captureRef; } catch {}

const W = Dimensions.get('window').width;
const CARD_W = W - 48;
const CARD_H = CARD_W * (2 / 3.5); // Business card ratio
const DILLY_BLUE = '#1B3FA0';
const DARK = '#1A1A2E';
const GRAY = '#6B7280';
const LIGHT_GRAY = '#9CA3AF';

interface PhoneEntry {
  label: string;
  number: string;
}

interface CardData {
  name: string;
  school: string;
  major: string;
  classYear: string;
  tagline: string;
  email: string;
  phones: PhoneEntry[];
  username: string;
  photoUri: string | null;
}

// ── Templates ────────────────────────────────────────────────────────────────

export type CardTemplate = 'classic' | 'dark' | 'minimal' | 'executive' | 'modern' | 'bold' | 'stripe';

export const CARD_TEMPLATES: { id: CardTemplate; label: string; bg: string; fg: string }[] = [
  { id: 'classic',   label: 'Classic',   bg: '#FAFAF8', fg: DARK },
  { id: 'dark',      label: 'Dark',      bg: '#1A1A2E', fg: '#FFFFFF' },
  { id: 'minimal',   label: 'Minimal',   bg: '#FFFFFF', fg: DARK },
  { id: 'executive', label: 'Executive', bg: '#F5F0E8', fg: '#2C2C2C' },
  { id: 'modern',    label: 'Modern',    bg: '#FFFFFF', fg: DARK },
  { id: 'bold',      label: 'Bold',      bg: '#000000', fg: '#FFFFFF' },
  { id: 'stripe',    label: 'Stripe',    bg: '#FFFFFF', fg: DARK },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function PhotoCircle({ photoUri, initial, size, bgColor }: { photoUri: string | null; initial: string; size: number; bgColor?: string }) {
  const photoWithCache = photoUri ? `${photoUri}${photoUri.includes('?') ? '&' : '?'}_t=${Date.now()}` : null;
  if (photoWithCache) {
    return <Image source={{ uri: photoWithCache }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor || DILLY_BLUE, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '800', color: '#fff' }}>{initial}</Text>
    </View>
  );
}

function ContactBlock({ data, colors: cl }: { data: CardData; colors: { email: string; phone: string; url: string } }) {
  const profileUrl = `hellodilly.com/p/${data.username || 'you'}`;
  return (
    <>
      {data.email ? <Text style={{ fontSize: 11, color: cl.email }}>{data.email}</Text> : null}
      {data.phones?.filter(p => p.number.replace(/\D/g, '').length >= 3).map((p, i) => (
        <Text key={i} style={{ fontSize: 10, color: cl.phone, marginTop: 1 }}>{p.label}: {formatPhone(p.number)}</Text>
      ))}
      <Text style={{ fontSize: 9, color: cl.url, marginTop: 4 }}>{profileUrl}</Text>
    </>
  );
}

// ── Card Front ───────────────────────────────────────────────────────────────

function CardFront({ data, template = 'classic' }: { data: CardData; template?: CardTemplate }) {
  const initial = data.name ? data.name[0].toUpperCase() : '?';
  const photoWithCache = data.photoUri ? `${data.photoUri}${data.photoUri.includes('?') ? '&' : '?'}_t=${Date.now()}` : null;

  // ── Classic: photo rectangle left, off-white bg ──
  if (template === 'classic') {
    return (
      <View style={c.card}>
        <View style={c.photoSection}>
          {photoWithCache ? (
            <Image source={{ uri: photoWithCache }} style={c.photo} />
          ) : (
            <View style={c.photoPlaceholder}>
              <Text style={c.photoInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={c.infoSection}>
          <Text style={c.cardName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{data.name || 'Your Name'}</Text>
          {data.school ? <Text style={c.cardSchool}>{data.school}</Text> : null}
          {data.tagline ? <Text style={c.cardTagline}>{data.tagline}</Text> : null}
          {data.major ? <Text style={c.cardMajor}>{data.major}{data.classYear ? `, Class of ${data.classYear}` : ''}</Text> : null}
          <View style={{ flex: 1 }} />
          <ContactBlock data={data} colors={{ email: GRAY, phone: GRAY, url: LIGHT_GRAY }} />
        </View>
      </View>
    );
  }

  // ── Dark: same layout, deep navy bg ──
  if (template === 'dark') {
    return (
      <View style={[c.card, { backgroundColor: '#1A1A2E' }]}>
        <View style={c.photoSection}>
          {photoWithCache ? (
            <Image source={{ uri: photoWithCache }} style={c.photo} />
          ) : (
            <View style={[c.photoPlaceholder, { backgroundColor: '#2D2D5E' }]}>
              <Text style={c.photoInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={c.infoSection}>
          <Text style={[c.cardName, { color: '#FFFFFF' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{data.name || 'Your Name'}</Text>
          {data.school ? <Text style={[c.cardSchool, { color: '#A0A0C0' }]}>{data.school}</Text> : null}
          {data.tagline ? <Text style={[c.cardTagline, { color: '#8888BB' }]}>{data.tagline}</Text> : null}
          {data.major ? <Text style={[c.cardMajor, { color: '#A0A0C0' }]}>{data.major}{data.classYear ? `, Class of ${data.classYear}` : ''}</Text> : null}
          <View style={{ flex: 1 }} />
          <ContactBlock data={data} colors={{ email: '#A0A0C0', phone: '#A0A0C0', url: '#6B6B9E' }} />
        </View>
      </View>
    );
  }

  // ── Minimal: no photo, centered, accent bar ──
  if (template === 'minimal') {
    return (
      <View style={[c.card, { backgroundColor: '#FFFFFF', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 20 }]}>
        <View style={{ width: 40, height: 3, backgroundColor: DILLY_BLUE, borderRadius: 2, marginBottom: 12 }} />
        <Text style={[c.cardName, { textAlign: 'center', fontSize: 20 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{data.name || 'Your Name'}</Text>
        {data.tagline ? <Text style={[c.cardTagline, { textAlign: 'center', marginTop: 2 }]}>{data.tagline}</Text> : null}
        {data.school ? <Text style={[c.cardSchool, { textAlign: 'center', marginTop: 6 }]}>{data.school}</Text> : null}
        {data.major ? <Text style={[c.cardMajor, { textAlign: 'center' }]}>{data.major}{data.classYear ? ` '${data.classYear.slice(-2)}` : ''}</Text> : null}
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center' }}>
          <ContactBlock data={data} colors={{ email: GRAY, phone: GRAY, url: LIGHT_GRAY }} />
        </View>
      </View>
    );
  }

  // ── Executive: circle photo centered top, info below, warm cream bg ──
  if (template === 'executive') {
    const CREAM = '#F5F0E8';
    const EXEC_TEXT = '#2C2C2C';
    const EXEC_SUB = '#7A7060';
    return (
      <View style={[c.card, { backgroundColor: CREAM, flexDirection: 'column', alignItems: 'center', paddingTop: 14, paddingBottom: 12, paddingHorizontal: 20 }]}>
        <PhotoCircle photoUri={data.photoUri} initial={initial} size={52} bgColor="#8B7E6A" />
        <Text style={[c.cardName, { color: EXEC_TEXT, textAlign: 'center', fontSize: 18, marginTop: 6, letterSpacing: 0.5 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {(data.name || 'Your Name').toUpperCase()}
        </Text>
        {data.tagline ? <Text style={{ fontSize: 10, color: EXEC_SUB, fontStyle: 'italic', textAlign: 'center', marginTop: 2 }}>{data.tagline}</Text> : null}
        <View style={{ width: 24, height: 1, backgroundColor: '#C4B99A', marginVertical: 6 }} />
        {data.school ? <Text style={{ fontSize: 10, color: EXEC_SUB, textAlign: 'center' }}>{data.school}</Text> : null}
        {data.major ? <Text style={{ fontSize: 10, color: EXEC_SUB, textAlign: 'center' }}>{data.major}{data.classYear ? `, ${data.classYear}` : ''}</Text> : null}
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center' }}>
          <ContactBlock data={data} colors={{ email: EXEC_SUB, phone: EXEC_SUB, url: '#B0A890' }} />
        </View>
      </View>
    );
  }

  // ── Modern: small circle top-left, bold oversized name, thin accent line ──
  if (template === 'modern') {
    const MOD_ACCENT = '#3B82F6';
    return (
      <View style={[c.card, { backgroundColor: '#FFFFFF', flexDirection: 'column', paddingHorizontal: 18, paddingVertical: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PhotoCircle photoUri={data.photoUri} initial={initial} size={38} bgColor={MOD_ACCENT} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: DARK, letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{data.name || 'Your Name'}</Text>
            {data.tagline ? <Text style={{ fontSize: 10, color: GRAY }}>{data.tagline}</Text> : null}
          </View>
        </View>
        <View style={{ width: '100%', height: 2, backgroundColor: MOD_ACCENT, borderRadius: 1, marginVertical: 8 }} />
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View>
            {data.school ? <Text style={{ fontSize: 11, color: GRAY }}>{data.school}</Text> : null}
            {data.major ? <Text style={{ fontSize: 11, color: GRAY }}>{data.major}{data.classYear ? ` '${data.classYear.slice(-2)}` : ''}</Text> : null}
          </View>
          <View>
            <ContactBlock data={data} colors={{ email: GRAY, phone: GRAY, url: LIGHT_GRAY }} />
          </View>
        </View>
      </View>
    );
  }

  // ── Bold: black bg, huge name, no photo, contact at bottom ──
  if (template === 'bold') {
    return (
      <View style={[c.card, { backgroundColor: '#000000', flexDirection: 'column', paddingHorizontal: 20, paddingVertical: 16 }]}>
        <Text
          style={{ fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8, lineHeight: 32 }}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {(data.name || 'Your Name').toUpperCase()}
        </Text>
        {data.tagline ? <Text style={{ fontSize: 11, color: '#888888', marginTop: 4, fontWeight: '500' }}>{data.tagline}</Text> : null}
        <View style={{ flex: 1 }} />
        <View>
          {data.school ? <Text style={{ fontSize: 10, color: '#666666' }}>{data.school}</Text> : null}
          {data.major ? <Text style={{ fontSize: 10, color: '#666666' }}>{data.major}{data.classYear ? ` '${data.classYear.slice(-2)}` : ''}</Text> : null}
          <View style={{ height: 6 }} />
          <ContactBlock data={data} colors={{ email: '#AAAAAA', phone: '#AAAAAA', url: '#555555' }} />
        </View>
      </View>
    );
  }

  // ── Stripe: white card with indigo vertical stripe on left, info on right ──
  return (
    <View style={[c.card, { backgroundColor: '#FFFFFF', flexDirection: 'row', overflow: 'hidden' }]}>
      {/* Indigo stripe */}
      <View style={{ width: '8%', backgroundColor: '#4338CA', height: '100%' }} />
      <View style={{ flex: 1, padding: 16, justifyContent: 'flex-start' }}>
        <Text style={[c.cardName, { color: '#1E1B4B', fontSize: 20 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{data.name || 'Your Name'}</Text>
        {data.tagline ? <Text style={{ fontSize: 11, color: '#6366F1', fontStyle: 'italic', marginTop: 2 }}>{data.tagline}</Text> : null}
        {data.school ? <Text style={{ fontSize: 11, color: GRAY, marginTop: 4 }}>{data.school}</Text> : null}
        {data.major ? <Text style={{ fontSize: 11, color: GRAY }}>{data.major}{data.classYear ? `, Class of ${data.classYear}` : ''}</Text> : null}
        <View style={{ flex: 1 }} />
        <ContactBlock data={data} colors={{ email: GRAY, phone: GRAY, url: '#A5B4FC' }} />
      </View>
    </View>
  );
}

// ── Card Back ────────────────────────────────────────────────────────────────

function CardBack({ template = 'classic' }: { template?: CardTemplate }) {
  // All backs: logo center, website bottom. Logo color = website color.
  const configs: Record<CardTemplate, { bg: string; color: string }> = {
    classic:   { bg: '#F8F7F4', color: LIGHT_GRAY },
    dark:      { bg: '#1A1A2E', color: '#6B6B9E' },
    minimal:   { bg: '#FFFFFF', color: '#9CA3AF' },
    executive: { bg: '#F5F0E8', color: '#B0A890' },
    modern:    { bg: '#FFFFFF', color: '#93C5FD' },
    bold:      { bg: '#000000', color: '#555555' },
    stripe:    { bg: '#FFFFFF', color: '#A5B4FC' },
  };
  const cfg = configs[template] || configs.classic;
  return (
    <View style={[c.card, { backgroundColor: cfg.bg, justifyContent: 'center', alignItems: 'center' }]}>
      <Image source={require('../assets/logo.png')} style={{ width: 120, height: 40, tintColor: cfg.color }} resizeMode="contain" />
      <Text style={{ fontSize: 9, color: cfg.color, position: 'absolute', bottom: 12 }}>hellodilly.com</Text>
    </View>
  );
}

// ── Template Picker ─────────────────────────────────────────────────────────

function TemplatePicker({ selected, onSelect }: { selected: CardTemplate; onSelect: (t: CardTemplate) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: DARK }}>Choose a style</Text>
        <Text style={{ fontSize: 11, color: LIGHT_GRAY }}>Swipe for more →</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {CARD_TEMPLATES.map((t, idx) => {
          const active = t.id === selected;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => { lightHaptic(); onSelect(t.id); }}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
                backgroundColor: active ? DILLY_BLUE : '#F3F4F6',
                borderWidth: 1.5,
                borderColor: active ? DILLY_BLUE : '#E5E7EB',
                minWidth: 70, alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : GRAY }}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Card Editor ─────────────────────────────────────────────────────────────

interface DillyCardEditorProps {
  initialData: CardData;
  onSave: (data: CardData) => void;
  /** 'professional' hides school/major/classYear fields */
  userType?: string;
}

export default function DillyCardEditor({ initialData, onSave, userType }: DillyCardEditorProps) {
  const [data, setData] = useState<CardData>(initialData);
  const [showBack, setShowBack] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [template, setTemplate] = useState<CardTemplate>('classic');
  const frontRef = useRef<any>(null);
  const backRef = useRef<any>(null);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const toast = useInlineToast();

  function handleFlip() {
    lightHaptic();
    const toValue = showBack ? 0 : 1;
    Animated.timing(flipAnim, {
      toValue,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setShowBack(!showBack));
  }

  function update(key: keyof CardData, value: string) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  /** Build a friendly filename: "{Name} Dilly Card.png" */
  function cardFileName(side: 'Front' | 'Back'): string {
    const safeName = (data.name || 'My').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    return `${safeName} Dilly Card ${side}.png`;
  }

  async function captureAndShare(ref: any, filename: string) {
    if (!ref?.current) { toast.show({ message: 'Card not ready. Try again.' }); return; }
    if (!captureRef) { toast.show({ message: 'Capture not available.' }); return; }
    try {
      // Capture directly to cache with a clean filename
      const uri = await captureRef(ref.current, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        fileName: filename.replace('.png', ''),
      });
      if (!uri) { toast.show({ message: 'Capture returned empty.' }); return; }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
        successHaptic();
      } else {
        toast.show({ message: 'Sharing not available.' });
      }
    } catch (err: any) {
      console.warn('[DillyCard] capture error:', err?.message || err);
      toast.show({ message: `Could not share: ${(err?.message || '').slice(0, 80)}` });
    }
  }

  async function handleShare() {
    await captureAndShare(frontRef, 'My Business Card.png');
  }

  return (
    <View style={{ gap: 16, position: 'relative' }}>
      <InlineToastView {...toast.props} />

      {/* Off-screen renders for capture (must be visible for react-native-view-shot) */}
      <View style={{ position: 'absolute', left: -9999, top: 0 }} pointerEvents="none">
        <View ref={frontRef} collapsable={false}>
          <CardFront data={data} template={template} />
        </View>
        <View ref={backRef} collapsable={false}>
          <CardBack template={template} />
        </View>
      </View>

      {/* Live preview */}
      <TouchableOpacity onPress={handleFlip} activeOpacity={0.95} style={{ height: CARD_H }}>
        {/* Front */}
        <Animated.View style={{
          position: 'absolute', width: '100%', backfaceVisibility: 'hidden',
          transform: [{ perspective: 1000 }, { rotateY: flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
        }}>
          <CardFront data={data} template={template} />
        </Animated.View>
        {/* Back */}
        <Animated.View style={{
          position: 'absolute', width: '100%', backfaceVisibility: 'hidden',
          transform: [{ perspective: 1000 }, { rotateY: flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) }],
        }}>
          <CardBack template={template} />
        </Animated.View>
      </TouchableOpacity>
      <Text style={{ fontSize: 10, color: LIGHT_GRAY, textAlign: 'center' }}>
        Tap card to flip
      </Text>

      {/* Template picker — always visible */}
      <TemplatePicker selected={template} onSelect={setTemplate} />

      {/* Editor toggle */}
      <TouchableOpacity
        onPress={() => setEditorOpen(!editorOpen)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
        activeOpacity={0.7}
      >
        <Ionicons name={editorOpen ? 'chevron-up' : 'create-outline'} size={14} color={GRAY} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: GRAY }}>{editorOpen ? 'Hide editor' : 'Edit your card'}</Text>
      </TouchableOpacity>

      {/* Editor fields */}
      {editorOpen && (<>
      <View style={c.field}>
        <Text style={c.fieldLabel}>Full Name</Text>
        <TextInput style={c.fieldInput} value={data.name} onChangeText={v => update('name', v)} placeholder="Your name" placeholderTextColor={LIGHT_GRAY} />
      </View>
      {userType !== 'professional' && (
        <>
          <View style={c.field}>
            <Text style={c.fieldLabel}>School</Text>
            <TextInput style={c.fieldInput} value={data.school} onChangeText={v => update('school', v)} placeholder="University" placeholderTextColor={LIGHT_GRAY} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[c.field, { flex: 1 }]}>
              <Text style={c.fieldLabel}>Major</Text>
              <TextInput style={c.fieldInput} value={data.major} onChangeText={v => update('major', v)} placeholder="Major" placeholderTextColor={LIGHT_GRAY} />
            </View>
            <View style={[c.field, { width: 80 }]}>
              <Text style={c.fieldLabel}>Class</Text>
              <TextInput style={c.fieldInput} value={data.classYear} onChangeText={v => update('classYear', v)} placeholder="2027" placeholderTextColor={LIGHT_GRAY} keyboardType="number-pad" />
            </View>
          </View>
        </>
      )}
      {userType === 'professional' && (
        <View style={c.field}>
          <Text style={c.fieldLabel}>Field</Text>
          <TextInput style={c.fieldInput} value={data.major} onChangeText={v => update('major', v)} placeholder="Your career field" placeholderTextColor={LIGHT_GRAY} />
        </View>
      )}
      <View style={c.field}>
        <Text style={c.fieldLabel}>Tagline</Text>
        <TextInput style={c.fieldInput} value={data.tagline} onChangeText={v => update('tagline', v.slice(0, 50))} placeholder="e.g. Aspiring Investment Banker" placeholderTextColor={LIGHT_GRAY} maxLength={50} />
      </View>
      <View style={c.field}>
        <Text style={c.fieldLabel}>Email</Text>
        <TextInput style={c.fieldInput} value={data.email} onChangeText={v => update('email', v)} placeholder="you@email.com" placeholderTextColor={LIGHT_GRAY} keyboardType="email-address" autoCapitalize="none" />
      </View>
      <View style={c.field}>
        <Text style={c.fieldLabel}>Phone Numbers</Text>
        {(data.phones || []).map((phone, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
            <TextInput
              style={[c.fieldInput, { width: 70, textAlign: 'center' }]}
              value={phone.label}
              onChangeText={v => {
                const updated = [...(data.phones || [])];
                updated[i] = { ...updated[i], label: v };
                setData(prev => ({ ...prev, phones: updated }));
              }}
              placeholder="Cell"
              placeholderTextColor={LIGHT_GRAY}
            />
            <TextInput
              style={[c.fieldInput, { flex: 1 }]}
              value={formatPhone(phone.number)}
              onChangeText={v => {
                const digits = v.replace(/\D/g, '').slice(0, 10);
                const updated = [...(data.phones || [])];
                updated[i] = { ...updated[i], number: digits };
                setData(prev => ({ ...prev, phones: updated }));
              }}
              placeholder="(555) 123-4567"
              placeholderTextColor={LIGHT_GRAY}
              keyboardType="phone-pad"
            />
            <TouchableOpacity onPress={() => {
              const updated = (data.phones || []).filter((_, idx) => idx !== i);
              setData(prev => ({ ...prev, phones: updated }));
            }} style={{ justifyContent: 'center', paddingHorizontal: 4 }}>
              <Ionicons name="close-circle" size={18} color={LIGHT_GRAY} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          onPress={() => setData(prev => ({ ...prev, phones: [...(prev.phones || []), { label: 'Cell', number: '' }] }))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }}
        >
          <Ionicons name="add-circle-outline" size={16} color={DILLY_BLUE} />
          <Text style={{ fontSize: 12, color: DILLY_BLUE, fontWeight: '500' }}>Add phone number</Text>
        </TouchableOpacity>
      </View>
      <View style={c.field}>
        <Text style={c.fieldLabel}>Profile URL</Text>
        <Text style={[c.fieldInput, { color: GRAY }]}>hellodilly.com/p/{data.username || 'you'}</Text>
      </View>

      </>)}

      {/* Share button */}
      <TouchableOpacity style={c.shareBtn} onPress={handleShare} activeOpacity={0.85}>
        <Ionicons name="share-outline" size={16} color="#fff" />
        <Text style={c.shareBtnText}>Share your Dilly Card</Text>
      </TouchableOpacity>

      {/* Print section */}
      <View style={c.printSection}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Ionicons name="print-outline" size={14} color={GRAY} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: DARK }}>Save for printing</Text>
        </View>
        <Text style={{ fontSize: 11, color: GRAY, lineHeight: 16, marginBottom: 10 }}>
          Save high-quality images to your photos. Upload to Vistaprint, Moo, or your local print shop. Standard size: 3.5" x 2".
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={c.printBtn}
            onPress={() => captureAndShare(frontRef, cardFileName('Front'))}
            activeOpacity={0.8}
          >
            <Ionicons name="download-outline" size={14} color={DILLY_BLUE} />
            <Text style={c.printBtnText}>Front</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={c.printBtn}
            onPress={() => captureAndShare(backRef, cardFileName('Back'))}
            activeOpacity={0.8}
          >
            <Ionicons name="download-outline" size={14} color={DILLY_BLUE} />
            <Text style={c.printBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 9, color: LIGHT_GRAY, marginTop: 6 }}>
          Tip: Upload both files to vistaprint.com &rarr; Business Cards &rarr; Upload Your Design
        </Text>
      </View>
    </View>
  );
}

// Export CardFront for use elsewhere
export { CardFront, CardBack };
export type { CardData };

// ── Styles ───────────────────────────────────────────────────────────────────

const c = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: '#FAFAF8',
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  // Photo section (left 30%) — used by classic + dark
  photoSection: { width: '30%', height: '100%' },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: {
    width: '100%', height: '100%', backgroundColor: DILLY_BLUE,
    justifyContent: 'center', alignItems: 'center',
  },
  photoInitial: { fontSize: 32, fontWeight: '800', color: '#fff' },

  // Info section (right 70%) — used by classic + dark
  infoSection: { flex: 1, padding: 16, justifyContent: 'flex-start' },
  cardName: { fontSize: 22, fontWeight: '800', color: DARK, letterSpacing: -0.3 },
  cardSchool: { fontSize: 12, color: GRAY },
  cardMajor: { fontSize: 12, color: GRAY },
  cardTagline: { fontSize: 11, color: GRAY, fontStyle: 'italic', marginTop: 4 },
  cardEmail: { fontSize: 11, color: GRAY },
  cardPhone: { fontSize: 10, color: GRAY, marginTop: 1 },

  // QR
  qrRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  qrWrap: { alignItems: 'center' },
  qrUrl: { fontSize: 7, color: LIGHT_GRAY, marginTop: 2 },

  // Editor
  field: { gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: GRAY },
  fieldInput: {
    backgroundColor: '#F9FAFB', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: DARK,
  },
  fieldHint: { fontSize: 10, color: LIGHT_GRAY },

  // Share
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: DILLY_BLUE, paddingVertical: 14, borderRadius: 10,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Print
  printSection: {
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  printBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: DILLY_BLUE + '30',
    backgroundColor: DILLY_BLUE + '08',
  },
  printBtnText: { fontSize: 13, fontWeight: '600', color: DILLY_BLUE },
});
