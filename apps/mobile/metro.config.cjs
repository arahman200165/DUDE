const { getDefaultConfig } = require('expo/metro-config');

// Expo resolves workspace package exports to their compiled dist/ files.
module.exports = getDefaultConfig(__dirname);
