/**
 * DillyCard — premium digital business card.
 *
 * Reusable component that renders a business card (3.5:2 ratio).
 * Front: photo + name + school + major + email + QR code.
 * Back: Dilly logo centered.
 *
 * Supports capture to PNG via react-native-view-shot for sharing.
 */

import { useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, Dimensions, TouchableOpacity,
  TextInput, ScrollView, Alert, Share, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Lazy-load native modules to prevent crash if not properly linked
let QRCode: any = null;
let ViewShot: any = null;
try { QRCode = require('react-native-qrcode-svg').default; } catch {}
try { ViewShot = require('react-native-view-shot').default; } catch {}

const W = Dimensions.get('window').width;
const CARD_W = W - 48;
const CARD_H = CARD_W * (2 / 3.5); // Business card ratio
const DILLY_BLUE = '#1B3FA0';
const DARK = '#1A1A2E';
const GRAY = '#6B7280';
const LIGHT_GRAY = '#9CA3AF';

interface CardData {
  name: string;
  school: string;
  major: string;
  classYear: string;
  tagline: string;
  email: string;
  username: string;
  photoUri: string | null;
}

// ── Card Front ───────────────────────────────────────────────────────────────

function CardFront({ data }: { data: CardData }) {
  const initial = data.name ? data.name[0].toUpperCase() : '?';
  const profileUrl = `hellodilly.com/p/${data.username || 'you'}`;

  return (
    <View style={c.card}>
      {/* Left: Photo */}
      <View style={c.photoSection}>
        {data.photoUri ? (
          <Image source={{ uri: data.photoUri }} style={c.photo} />
        ) : (
          <View style={c.photoPlaceholder}>
            <Text style={c.photoInitial}>{initial}</Text>
          </View>
        )}
      </View>

      {/* Right: Info */}
      <View style={c.infoSection}>
        <Text style={c.cardName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{data.name || 'Your Name'}</Text>
        {data.school ? <Text style={c.cardSchool}>{data.school}</Text> : null}
        {data.tagline ? <Text style={c.cardTagline}>{data.tagline}</Text> : null}
        {data.major ? (
          <Text style={c.cardMajor}>
            {data.major}{data.classYear ? `, Class of ${data.classYear}` : ''}
          </Text>
        ) : null}

        <View style={{ flex: 1 }} />

        <Text style={c.cardEmail}>{data.email || ''}</Text>
        {(data as any).phone ? <Text style={c.cardEmail}>{(data as any).phone}</Text> : null}
        <Text style={{ fontSize: 9, color: LIGHT_GRAY, marginTop: 4 }}>{profileUrl}</Text>
      </View>
    </View>
  );
}

// ── Card Back ────────────────────────────────────────────────────────────────

function CardBack() {
  return (
    <View style={[c.card, { justifyContent: 'center', alignItems: 'center' }]}>
      <Image source={require('../assets/logo.png')} style={{ width: 120, height: 40 }} resizeMode="contain" />
    </View>
  );
}

// ── Card Editor ──────────────────────────────────────────────────────────────

interface DillyCardEditorProps {
  initialData: CardData;
  onSave: (data: CardData) => void;
}

export default function DillyCardEditor({ initialData, onSave }: DillyCardEditorProps) {
  const [data, setData] = useState<CardData>(initialData);
  const [showBack, setShowBack] = useState(false);
  const frontRef = useRef<any>(null);
  const flipAnim = useRef(new Animated.Value(0)).current;

  function handleFlip() {
    const toValue = showBack ? 0 : 1;
    Animated.timing(flipAnim, {
      toValue,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setShowBack(!showBack));
  }

  const flipRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  function update(key: keyof CardData, value: string) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  async function handleShare() {
    try {
      // Try to capture and share as image
      if (frontRef.current?.capture) {
        try {
          const uri = await frontRef.current.capture();
          const Sharing = await import('expo-sharing').catch(() => null);
          if (Sharing && await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Dilly Card' });
            return;
          }
        } catch {}
      }
      // Fallback: share as text
      await Share.share({ message: `Check out my Dilly Card: https://hellodilly.com/p/${data.username}` });
    } catch {
      Alert.alert('Could not share', 'Try again in a moment.');
    }
  }

  return (
    <View style={{ gap: 16 }}>
      {/* Live preview */}
      <TouchableOpacity onPress={handleFlip} activeOpacity={0.9}>
        <Animated.View style={{ transform: [{ perspective: 1000 }, { rotateY: flipRotate }] }}>
          {showBack ? <CardBack /> : (
            <View ref={frontRef}>
              <CardFront data={data} />
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>
      <Text style={{ fontSize: 10, color: LIGHT_GRAY, textAlign: 'center' }}>
        Tap card to flip
      </Text>

      {/* Editor fields */}
      <View style={c.field}>
        <Text style={c.fieldLabel}>Full Name</Text>
        <TextInput style={c.fieldInput} value={data.name} onChangeText={v => update('name', v)} placeholder="Your name" placeholderTextColor={LIGHT_GRAY} />
      </View>
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
      <View style={c.field}>
        <Text style={c.fieldLabel}>Tagline</Text>
        <TextInput style={c.fieldInput} value={data.tagline} onChangeText={v => update('tagline', v.slice(0, 50))} placeholder="e.g. Aspiring Investment Banker" placeholderTextColor={LIGHT_GRAY} maxLength={50} />
      </View>
      <View style={c.field}>
        <Text style={c.fieldLabel}>Email</Text>
        <TextInput style={c.fieldInput} value={data.email} onChangeText={v => update('email', v)} placeholder="you@email.com" placeholderTextColor={LIGHT_GRAY} keyboardType="email-address" autoCapitalize="none" />
      </View>
      <View style={c.field}>
        <Text style={c.fieldLabel}>Phone</Text>
        <TextInput style={c.fieldInput} value={(data as any).phone || ''} onChangeText={v => setData(prev => ({ ...prev, phone: v } as any))} placeholder="(555) 123-4567" placeholderTextColor={LIGHT_GRAY} keyboardType="phone-pad" />
      </View>
      <View style={c.field}>
        <Text style={c.fieldLabel}>Profile URL</Text>
        <Text style={[c.fieldInput, { color: GRAY }]}>hellodilly.com/p/{data.username || 'you'}</Text>
      </View>

      {/* Share button */}
      <TouchableOpacity style={c.shareBtn} onPress={handleShare} activeOpacity={0.85}>
        <Ionicons name="share-outline" size={16} color="#fff" />
        <Text style={c.shareBtnText}>Share Dilly Card</Text>
      </TouchableOpacity>
    </View>
  );
}

// Export CardFront for use elsewhere
export { CardFront, CardBack };
export type { CardData };

// ── Styles ────────────────────────────────────────────────────────────────────

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

  // Photo section (left 25%)
  photoSection: { width: '25%', height: '100%' },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: {
    width: '100%', height: '100%', backgroundColor: DILLY_BLUE,
    justifyContent: 'center', alignItems: 'center',
  },
  photoInitial: { fontSize: 32, fontWeight: '800', color: '#fff' },

  // Info section (right 75%)
  infoSection: { flex: 1, padding: 16, justifyContent: 'flex-start' },
  cardName: { fontSize: 22, fontWeight: '800', color: DARK, letterSpacing: -0.3 },
  cardSchool: { fontSize: 12, color: GRAY },
  cardMajor: { fontSize: 12, color: GRAY },
  cardTagline: { fontSize: 11, color: GRAY, fontStyle: 'italic', marginTop: 4 },
  cardEmail: { fontSize: 11, color: GRAY },

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
});
