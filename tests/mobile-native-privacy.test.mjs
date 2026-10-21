import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { applyPrivacy, backupRules, extractionRules, blockedPermissions, allowedPermissions } = createRequire(import.meta.url)('../apps/mobile/plugins/with-android-privacy.cjs');

test('Android manifest disables cleartext and binds both backup exclusion formats', () => {
  const app = applyPrivacy({ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'true' } });
  assert.equal(app.$['android:allowBackup'], 'false');
  assert.equal(app.$['android:usesCleartextTraffic'], 'false');
  assert.equal(app.$['android:fullBackupContent'], '@xml/dude_backup_rules');
  assert.equal(app.$['android:dataExtractionRules'], '@xml/dude_data_extraction_rules');
  assert.equal(app.$['android:name'], '.MainApplication');
});
test('pre-31 backup and Android12 cloud/device transfer exclude every app data domain', () => {
  for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
    const entry = `<exclude domain="${domain}" path="." />`;
    assert.ok(backupRules.includes(entry));
    for (const section of ['cloud-backup', 'device-transfer']) assert.ok(extractionRules.split(`<${section}>`)[1].split(`</${section}>`)[0].includes(entry));
  }
});
test('mobile config blocks storage/media/microphone/overlay permissions and pins compile/target36', () => {
  const config = readFileSync(new URL('../apps/mobile/app.config.ts', import.meta.url), 'utf8');
  for (const permission of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO', 'RECORD_AUDIO', 'SYSTEM_ALERT_WINDOW']) assert.ok(config.includes(`'android.permission.${permission}'`));
  assert.match(config, /compileSdkVersion: 36/);
  assert.match(config, /targetSdkVersion: 36/);
  assert.match(config, /minSdkVersion: 29/);
});
test('privacy plugin strips every blocked permission a library could add and allows only the vetted set', () => {
  const blocked = ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO', 'RECORD_AUDIO', 'SYSTEM_ALERT_WINDOW', 'ACCESS_WIFI_STATE'];
  for (const permission of blocked) assert.ok(blockedPermissions.includes(`android.permission.${permission}`), permission);
  // expo-network adds ACCESS_NETWORK_STATE and expo-haptics adds VIBRATE; CAMERA comes from expo-camera and INTERNET from the Hub client.
  assert.deepEqual([...allowedPermissions].sort(), ['android.permission.ACCESS_NETWORK_STATE', 'android.permission.CAMERA', 'android.permission.INTERNET', 'android.permission.VIBRATE']);
  for (const permission of allowedPermissions) assert.ok(!blockedPermissions.includes(permission), permission);
});
test('file and photo access use SAF and the Photo Picker: expo-image-picker requests no photo or microphone permission', () => {
  const config = readFileSync(new URL('../apps/mobile/app.config.ts', import.meta.url), 'utf8');
  assert.match(config, /'expo-image-picker', \{ photosPermission: false, microphonePermission: false \}/);
  assert.ok(config.includes("'android.permission.ACCESS_WIFI_STATE'"));
  const pkg = JSON.parse(readFileSync(new URL('../apps/mobile/package.json', import.meta.url), 'utf8'));
  for (const dependency of ['expo-document-picker', 'expo-image-picker', 'expo-file-system', 'expo-sharing', 'expo-network', 'expo-device', 'react-native-svg']) assert.ok(pkg.dependencies[dependency], dependency);
});
