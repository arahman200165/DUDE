const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const domains = ['root', 'file', 'database', 'sharedpref', 'external'];
const excludes = domains.map(domain => `    <exclude domain="${domain}" path="." />`).join('\n');
const backupRules = `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${excludes}\n</full-backup-content>\n`;
const extractionRules = `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n${excludes}\n  </cloud-backup>\n  <device-transfer>\n${excludes}\n  </device-transfer>\n</data-extraction-rules>\n`;
function applyPrivacy(application) {
  application.$ = { ...application.$, 'android:allowBackup': 'false', 'android:usesCleartextTraffic': 'false', 'android:fullBackupContent': '@xml/dude_backup_rules', 'android:dataExtractionRules': '@xml/dude_data_extraction_rules' };
  return application;
}
module.exports = function withAndroidPrivacy(config) {
  config = withAndroidManifest(config, mod => { mod.modResults.manifest.application.forEach(applyPrivacy); return mod; });
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
