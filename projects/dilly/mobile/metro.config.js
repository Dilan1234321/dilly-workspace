const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ─── Local @dilly/api package ────────────────────────────────────────────────
const localPackagesDir = path.resolve(__dirname, './packages');
config.watchFolders = [...(config.watchFolders ?? []), localPackagesDir];

// Map the TypeScript path alias so Metro resolves @dilly/api imports.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@dilly/api': path.resolve(__dirname, './packages/dilly-api'),
};

// Stub react-dom on native — avoid breaking Metro's default resolver with a custom resolveRequest
const STUB = path.resolve(__dirname, 'shims/react-dom-stub.js');
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-dom': STUB,
  'react-dom/client': STUB,
  'react-dom/server': STUB,
  'react-dom/server.browser': STUB,
};

module.exports = config;
