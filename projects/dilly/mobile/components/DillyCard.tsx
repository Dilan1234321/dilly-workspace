/**
 * DillyCard - premium digital business card.
 *
 * Reusable component that renders a business card (3.5:2 ratio).
 * Front: name + tagline + contact info (template-dependent layout).
 * Back: Dilly branding with logo and profile URL.
 *
 * Supports capture to PNG via react-native-view-shot for sharing.
 *
 * Templates (8 total):
 *   photo (Default), clean, dark, statement, navy, sage, coral, midnight
 */

import { useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, Dimensions, TouchableOpacity,
  TextInput, ScrollView, Share, Animated, Easing,
} from 'react-native';
import InlineToastView, { useInlineToast } from './InlineToast';
import { Ionicons } from '@expo/vector-icons';
import { lightHaptic, mediumHaptic, successHaptic } from '../lib/haptics';
import { dilly } from '../lib/dilly';
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
  city?: string;
  readableSlug?: string;
  profilePrefix?: string; // "s" for students, "p" for professionals
}

// ── Templates ────────────────────────────────────────────────────────────────

export type CardTemplate = 'photo' | 'clean' | 'dark' | 'statement' | 'navy' | 'sage' | 'coral' | 'midnight';

export const CARD_TEMPLATES: { id: CardTemplate; label: string }[] = [
  { id: 'photo', label: 'Default' },
  { id: 'clean', label: 'Clean' },
  { id: 'dark', label: 'Dark' },
  { id: 'statement', label: 'Statement' },
  { id: 'navy', label: 'Navy' },
  { id: 'sage', label: 'Sage' },
  { id: 'coral', label: 'Coral' },
  { id: 'midnight', label: 'Midnight' },
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

/** Build profile URL from card data */
function getProfileUrl(data: CardData): string | null {
  if (!data.readableSlug) return null;
  const prefix = data.profilePrefix || 's';
  return `hellodilly.com/${prefix}/${data.readableSlug}`;
}

/** Minimal contact block: email, first phone, city, profile URL (hidden when QR is on) */
function MinimalContact({ data, colors, hideLink = false }: { data: CardData; colors: { email: string; phone: string; url: string }; hideLink?: boolean }) {
  const profileUrl = getProfileUrl(data);
  const firstPhone = (data.phones || []).find(p => p.number.replace(/\D/g, '').length >= 3);
  return (
    <>
      {data.email ? <Text style={{ fontSize: 11, color: colors.email }}>{data.email}</Text> : null}
      {firstPhone ? (
        <Text style={{ fontSize: 10, color: colors.phone, marginTop: 1 }}>{formatPhone(firstPhone.number)}</Text>
      ) : null}
      {data.city ? <Text style={{ fontSize: 10, color: colors.phone, marginTop: 1 }}>{data.city}</Text> : null}
      {!hideLink && profileUrl && <Text style={{ fontSize: 9, color: colors.url, marginTop: 4 }}>{profileUrl}</Text>}
    </>
  );
}

/** QR code badge - positioned absolutely in bottom-right of card */
function QrBadge({ data, color, size = 44 }: { data: CardData; color: string; size?: number }) {
  const profileUrl = getProfileUrl(data);
  if (!QRCode || !profileUrl) return null;
  return (
    <View style={{ position: 'absolute', bottom: 12, right: 14 }}>
      <QRCode value={`https://${profileUrl}`} size={size} color={color} backgroundColor="transparent" />
    </View>
  );
}

// ── Card Front ───────────────────────────────────────────────────────────────

function CardFront({ data, template = 'photo', showQr = false }: { data: CardData; template?: CardTemplate; showQr?: boolean }) {
  const initial = data.name ? data.name[0].toUpperCase() : '?';
  const photoWithCache = data.photoUri ? `${data.photoUri}${data.photoUri.includes('?') ? '&' : '?'}_t=${Date.now()}` : null;

  // ── Clean: extreme white space, typography only ──
  if (template === 'clean') {
    return (
      <View style={[c.card, { backgroundColor: '#FFFFFF', flexDirection: 'column', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 }]}>
        <Text
          style={{ fontSize: 18, fontWeight: '700', color: '#1A1A2E' }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {data.name || 'Your Name'}
        </Text>
        {data.tagline ? (
          <Text style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 2 }}>{data.tagline}</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <MinimalContact data={data} hideLink={showQr} colors={{ email: '#6B7280', phone: '#6B7280', url: '#9CA3AF' }} />
        {showQr && <QrBadge data={data} color="#9CA3AF" />}
      </View>
    );
  }

  // ── Photo (Default): face on the left 35%, info on the right ──
  if (template === 'photo') {
    return (
      <View style={[c.card, { backgroundColor: '#FFFFFF', flexDirection: 'row', overflow: 'hidden' }]}>
        <View style={{ width: '35%', height: '100%' }}>
          {photoWithCache ? (
            <Image source={{ uri: photoWithCache }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
          ) : (
            <View style={{ width: '100%', height: '100%', backgroundColor: DILLY_BLUE, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: '#fff' }}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 16, justifyContent: 'flex-start' }}>
          <Text
            style={{ fontSize: 18, fontWeight: '700', color: '#1A1A2E' }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {data.name || 'Your Name'}
          </Text>
          {data.tagline ? (
            <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{data.tagline}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <MinimalContact data={data} hideLink={showQr} colors={{ email: '#6B7280', phone: '#6B7280', url: '#9CA3AF' }} />
        </View>
        {showQr && <QrBadge data={data} color="#9CA3AF" />}
      </View>
    );
  }

  // ── Dark: premium matte black ──
  if (template === 'dark') {
    return (
      <View style={[c.card, { backgroundColor: '#111111', flexDirection: 'column', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 }]}>
        <Text
          style={{ fontSize: 20, fontWeight: '800', color: '#FFFFFF' }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {data.name || 'Your Name'}
        </Text>
        {data.tagline ? (
          <Text style={{ fontSize: 11, color: '#666666', marginTop: 2 }}>{data.tagline}</Text>
        ) : null}
        <View style={{ width: 30, height: 1, backgroundColor: '#FFFFFF', marginTop: 8 }} />
        <View style={{ flex: 1 }} />
        <MinimalContact data={data} hideLink={showQr} colors={{ email: '#999999', phone: '#999999', url: '#555555' }} />
        {showQr && <QrBadge data={data} color="#FFFFFF" />}
      </View>
    );
  }

  // ── Statement: giant watermark name ──
  if (template === 'statement') {
    return (
      <View style={[c.card, { backgroundColor: '#FFFFFF', flexDirection: 'column', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, overflow: 'hidden' }]}>
        <Text
          style={{
            position: 'absolute',
            top: '15%',
            left: 10,
            right: -10,
            fontSize: 36,
            fontWeight: '900',
            color: '#E8E8E8',
            lineHeight: 40,
          }}
          numberOfLines={2}
        >
          {(data.name || 'Your Name')}
        </Text>
        <Text
          style={{ fontSize: 14, fontWeight: '700', color: '#1A1A2E', zIndex: 1 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {data.name || 'Your Name'}
        </Text>
        {data.tagline ? (
          <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 2, zIndex: 1 }}>{data.tagline}</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={{ zIndex: 1 }}>
          <MinimalContact data={data} hideLink={showQr} colors={{ email: '#6B7280', phone: '#6B7280', url: '#9CA3AF' }} />
        </View>
        {showQr && <QrBadge data={data} color="#1A1A2E" />}
      </View>
    );
  }

  // ── Navy: photo circle left, navy blue background ──
  if (template === 'navy') {
    return (
      <View style={[c.card, { backgroundColor: '#1B2838', flexDirection: 'column', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PhotoCircle photoUri={data.photoUri} initial={initial} size={50} bgColor="#2A3F55" />
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {data.name || 'Your Name'}
            </Text>
            {data.tagline ? (
              <Text style={{ fontSize: 10, color: '#8BA4C4', marginTop: 2 }}>{data.tagline}</Text>
            ) : null}
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <MinimalContact data={data} hideLink={showQr} colors={{ email: '#8BA4C4', phone: '#8BA4C4', url: '#5A7FA0' }} />
        {showQr && <QrBadge data={data} color="#8BA4C4" />}
      </View>
    );
  }

  // ── Sage: green-tinted, photo top-right corner ──
  if (template === 'sage') {
    return (
      <View style={[c.card, { backgroundColor: '#F5F7F4', flexDirection: 'column', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 }]}>
        <View style={{ position: 'absolute', top: 14, right: 16 }}>
          <PhotoCircle photoUri={data.photoUri} initial={initial} size={42} bgColor="#5C6B5C" />
        </View>
        <Text
          style={{ fontSize: 18, fontWeight: '700', color: '#2D3B2D', paddingRight: 54 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {data.name || 'Your Name'}
        </Text>
        {data.tagline ? (
          <Text style={{ fontSize: 11, color: '#5C6B5C', fontStyle: 'italic', marginTop: 2 }}>{data.tagline}</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <MinimalContact data={data} hideLink={showQr} colors={{ email: '#5C6B5C', phone: '#5C6B5C', url: '#8A9B8A' }} />
        {showQr && <QrBadge data={data} color="#5C6B5C" />}
      </View>
    );
  }

  // ── Coral: warm coral accent, no photo ──
  if (template === 'coral') {
    return (
      <View style={[c.card, { backgroundColor: '#FFF5F3', flexDirection: 'column', paddingBottom: 14, overflow: 'hidden' }]}>
        <View style={{ width: '100%', height: 2, backgroundColor: '#E8705A' }} />
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
          <Text
            style={{ fontSize: 20, fontWeight: '700', color: '#2C2C2C' }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {data.name || 'Your Name'}
          </Text>
          {data.tagline ? (
            <Text style={{ fontSize: 11, color: '#E8705A', marginTop: 2 }}>{data.tagline}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <MinimalContact data={data} hideLink={showQr} colors={{ email: '#8B8B8B', phone: '#8B8B8B', url: '#BBBBBB' }} />
        </View>
        {showQr && <QrBadge data={data} color="#E8705A" />}
      </View>
    );
  }

  // ── Midnight: photo on right 40%, dark cinematic ──
  return (
    <View style={[c.card, { backgroundColor: '#0F1724', flexDirection: 'row', overflow: 'hidden' }]}>
      <View style={{ width: '60%', paddingHorizontal: 20, paddingVertical: 16, justifyContent: 'flex-start' }}>
        <Text
          style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {data.name || 'Your Name'}
        </Text>
        {data.tagline ? (
          <Text style={{ fontSize: 10, color: '#6B8DB5', marginTop: 2 }}>{data.tagline}</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <MinimalContact data={data} hideLink={showQr} colors={{ email: '#6B8DB5', phone: '#6B8DB5', url: '#4A6A8A' }} />
      </View>
      <View style={{ width: '40%', height: '100%' }}>
        {photoWithCache ? (
          <Image source={{ uri: photoWithCache }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
        ) : (
          <View style={{ width: '100%', height: '100%', backgroundColor: '#1A2A3E', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 36, fontWeight: '800', color: '#3A5A7A' }}>{initial}</Text>
          </View>
        )}
        {showQr && QRCode && getProfileUrl(data) && (
          <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: '#0F172480', borderRadius: 6, padding: 4 }}>
            <QRCode value={`https://${getProfileUrl(data)}`} size={34} color="#FFFFFF" backgroundColor="transparent" />
          </View>
        )}
      </View>
    </View>
  );
}

// ── Card Back ────────────────────────────────────────────────────────────────

function CardBack({ template = 'photo', username, showQr = false }: { template?: CardTemplate; username?: string; showQr?: boolean }) {
  const isDark = template === 'dark' || template === 'navy' || template === 'midnight';
  const bg = isDark
    ? (template === 'navy' ? '#1B2838' : template === 'midnight' ? '#0F1724' : '#111111')
    : (template === 'sage' ? '#F5F7F4' : template === 'coral' ? '#FFF5F3' : '#FFFFFF');
  const color = isDark
    ? (template === 'navy' ? '#5A7FA0' : template === 'midnight' ? '#4A6A8A' : '#555555')
    : (template === 'sage' ? '#5C6B5C' : template === 'coral' ? '#E8705A' : '#6B7280');
  const dimColor = isDark ? color + '80' : LIGHT_GRAY;

  return (
    <View style={[c.card, { backgroundColor: bg, justifyContent: 'center', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20 }]}>
      <Image source={require('../assets/logo.png')} style={{ width: 100, height: 34, tintColor: color }} resizeMode="contain" />
      <Text style={{ fontSize: 9, color, marginTop: 6, textAlign: 'center', fontWeight: '500' }}>
        Your career, guided by AI.
      </Text>
      <Text style={{ fontSize: 10, fontWeight: '500', color, position: 'absolute', bottom: 12 }}>hellodilly.com</Text>
    </View>
  );
}

// ── Template Picker ─────────────────────────────────────────────────────────

function TemplatePicker({ selected, onSelect }: { selected: CardTemplate; onSelect: (t: CardTemplate) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: DARK }}>Choose a style</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {CARD_TEMPLATES.map((t) => {
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
  const [template, setTemplate] = useState<CardTemplate>('photo');
  const [showQr, setShowQr] = useState(false);
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

  const saveTaglineTimer = useRef<any>(null);
  function update(key: keyof CardData, value: string) {
    setData(prev => ({ ...prev, [key]: value }));
    // Auto-save tagline to profile (debounced)
    if (key === 'tagline') {
      if (saveTaglineTimer.current) clearTimeout(saveTaglineTimer.current);
      saveTaglineTimer.current = setTimeout(() => {
        dilly.fetch('/profile', { method: 'PATCH', body: JSON.stringify({ profile_tagline: value.trim() }) }).catch(() => {});
      }, 1000);
    }
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
          <CardFront data={data} template={template} showQr={showQr} />
        </View>
        <View ref={backRef} collapsable={false}>
          <CardBack template={template} username={data.username} showQr={showQr} />
        </View>
      </View>

      {/* Live preview */}
      <TouchableOpacity onPress={handleFlip} activeOpacity={0.95} style={{ height: CARD_H }}>
        {/* Front */}
        <Animated.View style={{
          position: 'absolute', width: '100%', backfaceVisibility: 'hidden',
          transform: [{ perspective: 1000 }, { rotateY: flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
        }}>
          <CardFront data={data} template={template} showQr={showQr} />
        </Animated.View>
        {/* Back */}
        <Animated.View style={{
          position: 'absolute', width: '100%', backfaceVisibility: 'hidden',
          transform: [{ perspective: 1000 }, { rotateY: flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) }],
        }}>
          <CardBack template={template} username={data.username} showQr={showQr} />
        </Animated.View>
      </TouchableOpacity>
      <Text style={{ fontSize: 10, color: LIGHT_GRAY, textAlign: 'center' }}>
        Tap card to flip
      </Text>

      {/* Template picker + QR toggle */}
      <TemplatePicker selected={template} onSelect={setTemplate} />
      <TouchableOpacity
        onPress={() => setShowQr(!showQr)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 }}
        activeOpacity={0.7}
      >
        <Ionicons name={showQr ? 'qr-code' : 'qr-code-outline'} size={14} color={showQr ? DILLY_BLUE : GRAY} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: showQr ? DILLY_BLUE : GRAY }}>
          {showQr ? 'QR code on' : 'Add QR code'}
        </Text>
      </TouchableOpacity>

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
      {userType !== 'general' && userType !== 'professional' && (
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
      {(userType === 'general' || userType === 'professional') && (
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
        <Text style={[c.fieldInput, { color: GRAY }]}>{getProfileUrl(data) || 'Loading...'}</Text>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  // Photo section (left 35%) - used by photo template
  photoSection: { width: '35%', height: '100%' },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: {
    width: '100%', height: '100%', backgroundColor: DILLY_BLUE,
    justifyContent: 'center', alignItems: 'center',
  },
  photoInitial: { fontSize: 32, fontWeight: '800', color: '#fff' },

  // Info section (right side) - used by photo template
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
