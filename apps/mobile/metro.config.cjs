const { getDefaultConfig } = require('expo/metro-config');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');

// Expo resolves workspace package exports to their compiled dist/ files.
// Bundle Mode lets react-native-worklets runtimes run bundled modules (see babel.config.cjs and src/kit/off-thread.ts).
module.exports = getBundleModeMetroConfig(getDefaultConfig(__dirname));
