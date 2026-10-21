const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const domains = ['root', 'file', 'database', 'sharedpref', 'external'];
const excludes = domains.map(domain => `    <exclude domain="${domain}" path="." />`).join('\n');
const backupRules = `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${excludes}\n</full-backup-content>\n`;
const extractionRules = `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n${excludes}\n  </cloud-backup>\n  <device-transfer>\n${excludes}\n  </device-transfer>\n</data-extraction-rules>\n`;
/** Permissions that no dependency may re-introduce (file/photo access goes through SAF and the Photo Picker; Wi-Fi state is not needed). */
const blockedPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.READ_MEDIA_AUDIO',
  'android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.ACCESS_WIFI_STATE',
];
/** The only permissions DUDE Preview may declare (merged manifest), see tests/mobile-native-privacy.test.mjs. */
const allowedPermissions = [
  'android.permission.INTERNET', 'android.permission.CAMERA', 'android.permission.VIBRATE', 'android.permission.ACCESS_NETWORK_STATE',
];
function applyPrivacy(application) {
  application.$ = { ...application.$, 'android:allowBackup': 'false', 'android:usesCleartextTraffic': 'false', 'android:fullBackupContent': '@xml/dude_backup_rules', 'android:dataExtractionRules': '@xml/dude_data_extraction_rules' };
  return application;
}
module.exports = function withAndroidPrivacy(config) {
  config = withAndroidManifest(config, mod => { mod.modResults.manifest.application.forEach(applyPrivacy); return mod; });
  // Adds <uses-permission tools:node="remove"> so library manifests (expo-file-system, expo-image-picker, expo-network) cannot re-add them.
  config = AndroidConfig.Permissions.withBlockedPermissions(config, blockedPermissions);
  return withDangerousMod(config, ['android', async mod => {
    const dir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'dude_backup_rules.xml'), backupRules);
    await fs.writeFile(path.join(dir, 'dude_data_extraction_rules.xml'), extractionRules);
    return mod;
  }]);
};
module.exports.applyPrivacy = applyPrivacy;
module.exports.backupRules = backupRules;
module.exports.extractionRules = extractionRules;
module.exports.blockedPermissions = blockedPermissions;
module.exports.allowedPermissions = allowedPermissions;
