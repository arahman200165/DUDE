/**
 * Builds the `srcdoc` document that hosts one Markdown Workspace plugin.
 *
 * Sandboxing: `<iframe sandbox="allow-scripts">` (no `allow-same-origin`,
 * giving the iframe an opaque origin with no cookie/storage/DOM access
 * into the host) plus an internal CSP (`connect-src 'none'`) blocking the
 * plugin from making network requests — a restriction a Web Worker
 * alternative could not as cleanly guarantee (a worker can still
 * `fetch`/`importScripts` unless painstakingly proxied).
 *
 * Protocol: the host `postMessage`s `{ requestId, input }`; this document
 * calls the plugin's global `run(input)` function and posts back
 * `{ requestId, ok, output | error }`, mirroring `worker-protocol.ts`'s
 * request/response correlation shape over `postMessage` instead of a
 * `Worker`.
 */
export function buildPluginSrcdoc(pluginSource: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none';">
</head>
<body>
<script>
${pluginSource}
window.addEventListener('message', function (event) {
  var data = event.data || {};
  try {
    var output = run(data.input);
    parent.postMessage({ requestId: data.requestId, ok: true, output: String(output) }, '*');
  } catch (err) {
    parent.postMessage({ requestId: data.requestId, ok: false, error: (err && err.message) ? err.message : 'Plugin error' }, '*');
  }
});
</script>
</body>
</html>`;
}
