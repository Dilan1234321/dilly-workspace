/**
 * DillyFooter — subtle logo at the very bottom of scroll content.
 * Only visible when you scroll past all content.
 */

import { View, Image, StyleSheet } from 'react-native';

export default function DillyFooter() {
  return (
    <View style={f.wrap}>
      <Image source={require('../assets/logo.png')} style={f.logo} resizeMode="contain" />
    </View>
  );
}

const f = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 24, opacity: 0.15 },
  logo: { width: 60, height: 20 },
});
