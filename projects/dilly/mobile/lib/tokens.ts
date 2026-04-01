// Dilly Light Mode — Brand Blue (#2B3A8E) from logo
export const colors = {
  // Backgrounds: white → cool gray scale
  bg: '#FFFFFF',
  s1: '#F7F8FC',
  s2: '#EFF0F6',
  s3: '#E4E6F0',
  s4: '#D8DAE8',

  // Borders: blue-tinted transparency
  b1: 'rgba(43,58,142,0.06)',
  b2: 'rgba(43,58,142,0.10)',
  b3: 'rgba(43,58,142,0.16)',

  // Text: dark indigo
  t1: '#1A1A2E',
  t2: 'rgba(26,26,46,0.6)',
  t3: 'rgba(26,26,46,0.35)',

  // Brand: Dilly Blue (replaces gold)
  gold: '#2B3A8E',
  golddim: 'rgba(43,58,142,0.08)',
  goldbdr: 'rgba(43,58,142,0.18)',

  // Status colors (unchanged)
  green: '#34C759',
  gdim: 'rgba(52,199,89,0.08)',
  gbdr: 'rgba(52,199,89,0.18)',

  blue: '#0A84FF',
  bdim: 'rgba(10,132,255,0.08)',
  bbdr: 'rgba(10,132,255,0.18)',

  amber: '#FF9F0A',
  adim: 'rgba(255,159,10,0.08)',
  abdr: 'rgba(255,159,10,0.18)',

  coral: '#FF453A',
  cdim: 'rgba(255,69,58,0.08)',
  cbdr: 'rgba(255,69,58,0.18)',

  indigo: '#2B3A8E',
  idim: 'rgba(43,58,142,0.08)',
  ibdr: 'rgba(43,58,142,0.18)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  full: 999,
};

// Development: localhost for Simulator. Production: set EXPO_PUBLIC_API_BASE in eas.json.
// EAS requires the EXPO_PUBLIC_ prefix for variables accessible in JS bundles.
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:8000';
