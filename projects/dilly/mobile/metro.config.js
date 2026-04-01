const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ─── Monorepo: watch the shared @dilly/api package ───────────────────────────
const packagesDir = path.resolve(__dirname, '../packages');
config.watchFolders = [...(config.watchFolders ?? []), packagesDir];

// Map the TypeScript path alias so Metro resolves @dilly/api imports.
// Point at the package root — Metro reads package.json "main" to find index.ts.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@dilly/api': path.resolve(__dirname, '../packages/dilly-api'),
};

const STUB = path.resolve(__dirname, 'shims/react-dom-stub.js');

// Intercept react-dom and react-dom/* on native — log-box has erroneous web imports
const _resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-dom' || moduleName.startsWith('react-dom/')) {
    return { type: 'sourceFile', filePath: STUB };
  }
  if (_resolveRequest) {
    return _resolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
