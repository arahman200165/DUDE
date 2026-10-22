const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Share-to-DUDE (Phase 31I PD-091): MainActivity accepts a single ACTION_SEND. The shared content URI is readable through the
 * temporary grant that comes with the intent, so no storage, media or other permission is added. SEND_MULTIPLE is not accepted.
 */
const SEND_ACTION = 'android.intent.action.SEND';
const shareMimeTypes = [
  'text/plain', 'text/*', 'application/json', 'image/*',
  'application/x-pem-file', 'application/pkix-cert', 'application/x-x509-ca-cert', 'application/octet-stream',
];
const shareIntentFilter = () => ({
  action: [{ $: { 'android:name': SEND_ACTION } }],
  category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
  data: shareMimeTypes.map(mimeType => ({ $: { 'android:mimeType': mimeType } })),
});
const hasSendFilter = filter => (filter.action ?? []).some(action => action.$?.['android:name'] === SEND_ACTION);

function applyShareIntent(manifest) {
  const activity = (manifest.manifest.application ?? []).flatMap(application => application.activity ?? []).find(item => item.$?.['android:name'] === '.MainActivity');
  if (!activity) throw new Error('with-share-intent: MainActivity was not found in the generated manifest.');
  activity['intent-filter'] = [...(activity['intent-filter'] ?? []).filter(filter => !hasSendFilter(filter)), shareIntentFilter()];
  return manifest;
}

module.exports = function withShareIntent(config) {
  return withAndroidManifest(config, mod => { applyShareIntent(mod.modResults); return mod; });
};
module.exports.applyShareIntent = applyShareIntent;
module.exports.shareMimeTypes = shareMimeTypes;
