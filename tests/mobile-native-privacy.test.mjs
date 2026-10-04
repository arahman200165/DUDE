import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { applyPrivacy, backupRules, extractionRules } = createRequire(import.meta.url)('../apps/mobile/plugins/with-android-privacy.cjs');

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
