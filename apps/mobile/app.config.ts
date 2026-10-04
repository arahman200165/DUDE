import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'DUDE Preview',
  slug: 'dude-preview',
  version: '0.0.0',
  scheme: 'dude',
  platforms: ['android'],
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'io.github.arahman200165.dude.preview',
    allowBackup: false,
  },
  updates: { enabled: false },
  plugins: [
    'expo-router',
    './plugins/with-hermes.cjs',
    ['expo-build-properties', { android: { minSdkVersion: 29, targetSdkVersion: 36 } }],
  ],
};

export default config;
