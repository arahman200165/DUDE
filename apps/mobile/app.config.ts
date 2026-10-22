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
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.READ_MEDIA_AUDIO',
      'android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.ACCESS_WIFI_STATE',
    ],
  },
  updates: { enabled: false },
  plugins: [
    'expo-router',
    './plugins/with-hermes.cjs',
    './plugins/with-preview-signing.cjs',
    './plugins/with-android-privacy.cjs',
    './plugins/with-share-intent.cjs',
    ['expo-camera', { cameraPermission: 'Allow DUDE to scan a Hub pairing QR code.', recordAudioAndroid: false }],
    // Photo Picker only: no READ_MEDIA_*/storage permissions (blocked above and in with-android-privacy.cjs); CAMERA stays from expo-camera.
    ['expo-image-picker', { photosPermission: false, microphonePermission: false }],
    ['expo-build-properties', { android: { minSdkVersion: 29, compileSdkVersion: 36, targetSdkVersion: 36 } }],
  ],
};

export default config;
