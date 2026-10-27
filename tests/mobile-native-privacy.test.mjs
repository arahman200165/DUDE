import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

// Share-to-DUDE (PD-091): one ACTION_SEND filter on MainActivity, no SEND_MULTIPLE and no permission (the content URI grant is temporary).
const { applyShareIntent, shareMimeTypes } = createRequire(import.meta.url)('../apps/mobile/plugins/with-share-intent.cjs');
const manifestWith = filters => ({ manifest: { application: [{ activity: [{ $: { 'android:name': '.MainActivity' }, 'intent-filter': filters }] }], 'uses-permission': [] } });
const launcherFilter = { action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }], category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }] };

test('share plugin adds exactly one SEND intent filter with the vetted MIME types and no permissions', () => {
  const manifest = applyShareIntent(manifestWith([launcherFilter]));
  const filters = manifest.manifest.application[0].activity[0]['intent-filter'];
  assert.equal(filters.length, 2);
  assert.deepEqual(filters[0], launcherFilter);
  const send = filters[1];
  assert.deepEqual(send.action.map(item => item.$['android:name']), ['android.intent.action.SEND']);
  assert.deepEqual(send.category.map(item => item.$['android:name']), ['android.intent.category.DEFAULT']);
  assert.deepEqual(send.data.map(item => item.$['android:mimeType']), ['text/plain', 'text/*', 'application/json', 'image/*', 'application/x-pem-file', 'application/pkix-cert', 'application/x-x509-ca-cert', 'application/octet-stream']);
  assert.deepEqual(shareMimeTypes, send.data.map(item => item.$['android:mimeType']));
  assert.ok(!JSON.stringify(manifest).includes('SEND_MULTIPLE'));
  assert.deepEqual(manifest.manifest['uses-permission'], []);
  for (const entry of send.data) assert.deepEqual(Object.keys(entry.$), ['android:mimeType']);
});
test('share plugin is idempotent and registered in app.config.ts without touching blocked permissions', () => {
  const once = applyShareIntent(manifestWith([launcherFilter]));
  const twice = applyShareIntent(once);
  assert.equal(twice.manifest.application[0].activity[0]['intent-filter'].length, 2);
  assert.throws(() => applyShareIntent({ manifest: { application: [{ activity: [] }] } }), /MainActivity/);
  const config = readFileSync(new URL('../apps/mobile/app.config.ts', import.meta.url), 'utf8');
  assert.ok(config.includes("'./plugins/with-share-intent.cjs'"));
  const plugin = readFileSync(new URL('../apps/mobile/plugins/with-share-intent.cjs', import.meta.url), 'utf8');
  assert.ok(!/uses-permission|SEND_MULTIPLE|withPermissions/.test(plugin.replace(/\/\*[\s\S]*?\*\//, '')));
});
test('the dude-share module is a local autolinked Expo module that never logs content or reads file: URIs', () => {
  const root = new URL('../apps/mobile/modules/dude-share/', import.meta.url);
  assert.deepEqual(JSON.parse(readFileSync(new URL('expo-module.config.json', root), 'utf8')).android.modules, ['expo.modules.dudeshare.DudeShareModule']);
  const kotlin = readFileSync(new URL('android/src/main/java/expo/modules/dudeshare/DudeShareModule.kt', root), 'utf8');
  assert.ok(!/\bLog\.|println\(|Timber/.test(kotlin));
  assert.ok(kotlin.includes('isAllowedScheme'));
  assert.ok(!readFileSync(new URL('android/src/main/AndroidManifest.xml', root), 'utf8').includes('uses-permission'));
});

// Public-CA trust for the tunnel domain (32-SS1, Milestone 840): the release app trusts the platform defaults (system roots, no user-installed CA, cleartext off).
// The emulator acceptance installs a throwaway CA into the USER store, and only the :dude-hub instrumentation APK (src/androidTest) is configured to trust it.
const mobileRoot = new URL('../apps/mobile/', import.meta.url);
const sourceFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  if (['node_modules', 'build', '.gradle', '.cxx', '.expo', 'dist'].includes(entry.name)) return [];
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? sourceFiles(full) : [full];
});
const mobilePath = file => path.relative(fileURLToPath(mobileRoot), file).split(path.sep).join('/');

test('no release configuration trusts user-installed CAs or sets a network security config', () => {
  const files = sourceFiles(fileURLToPath(mobileRoot)).filter(file => /\.(xml|kt|java|cjs|ts|tsx|json|gradle|properties)$/.test(file)).map(mobilePath);
  assert.ok(files.includes('app.config.ts') && files.includes('plugins/with-android-privacy.cjs'));
  const text = file => readFileSync(new URL(file, mobileRoot), 'utf8');
  // The one place a user store is trusted: the instrumentation APK's own configuration, referenced only by its own manifest.
  const testConfig = 'modules/dude-hub/android/src/androidTest/res/xml/dude_test_network_security_config.xml';
  const withUserTrust = files.filter(file => /src\s*=\s*["']user["']/.test(text(file)));
  assert.deepEqual(withUserTrust, [testConfig]);
  const referencing = files.filter(file => /networkSecurityConfig|network_security_config/.test(text(file)));
  assert.deepEqual(referencing, ['modules/dude-hub/android/src/androidTest/AndroidManifest.xml']);
  // The generated app (when prebuild has run) and every module's main source set carry no configuration at all.
  for (const file of files.filter(item => /(^|\/)src\/main\//.test(item) || item.startsWith('android/app/'))) assert.ok(!/networkSecurityConfig|network_security_config|<certificates|src="user"/.test(text(file)), file);
  assert.ok(!/networkSecurityConfig|network_security_config/.test(text('app.config.ts') + text('plugins/with-android-privacy.cjs')));
  assert.ok(text('plugins/with-android-privacy.cjs').includes("'android:usesCleartextTraffic': 'false'"));
});
