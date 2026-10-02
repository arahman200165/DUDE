/**
 * Sandbox for running Python via Pyodide (WebAssembly CPython). Same
 * `<iframe sandbox="allow-scripts">` opaque-origin choice as `code-sandbox/`
 * — no cookie/storage/host-DOM access — but Pyodide runs directly in the
 * iframe's own realm rather than a nested Worker: it needs to fetch its own
 * WASM/stdlib assets and call `WebAssembly.instantiate`, which is simpler to
 * grant to the top-level realm than to thread through a Worker for a first
 * version.
 *
 * That means there is no `Worker.terminate()`-grade hard-termination
 * guarantee here (see `code-sandbox-doc.ts` for why that matters) — a
 * runaway `while True: pass` is instead handled by `PythonSandboxHost`
 * destroying and recreating this iframe on timeout, the same
 * discard-the-Document mechanism `live-html-preview.ts` already relies on
 * for the same reason.
 *
 * Both `script-src` (needed to load `pyodide.js` itself via a `<script
 * src>` tag — `'unsafe-inline'` alone only covers inline scripts) and
 * `connect-src` (needed for the `fetch`/dynamic-`import()` calls Pyodide's
 * own loader makes for its `.wasm`/`.mjs`/stdlib files) name the app's own
 * real origin explicitly, not `'self'`: this document's opaque origin
 * (`allow-scripts` with no `allow-same-origin`) means `'self'` would
 * resolve to that one unforgeable opaque origin, which nothing — including
 * the static host actually serving the Pyodide assets — can ever match,
 * silently blocking everything. Naming the real origin explicitly is
 * *tighter* than a working `'self'` would have been (one allowed origin,
 * not a broad same-origin grant), and lets Pyodide fetch its self-hosted
 * assets (never a third-party CDN, so this keeps working fully offline
 * once the assets are cached) while every other origin stays blocked.
 *
 * CORS, separately from CSP: `pyodide.js`'s own `import('./pyodide.asm.mjs')`
 * is an ES module load, which — unlike a classic `<script src>` — is always
 * fetched in CORS mode. Because this document's origin is opaque (not
 * merely different-looking, but a distinct, unforgeable origin per the HTML
 * spec), the browser treats that fetch as cross-origin even though the URL
 * points back at this same static site, and requires a matching
 * `Access-Control-Allow-Origin` response header or it fails with "Failed to
 * fetch dynamically imported module" — a CSP-allowed URL can still be
 * blocked by this. GitHub Pages sends `Access-Control-Allow-Origin: *` on
 * static files by default, which is why this is expected to work in
 * production; `ng serve`'s dev server does not by default, so
 * `angular.json`'s `serve` target adds the same header for local dev.
 * **Verify this against a real deployed GitHub Pages URL after shipping** —
 * it is inferred from GitHub Pages' known default behavior, not confirmed
 * against this repo's own deployment.
 */
export function buildPythonSandboxDoc(pyodideDirUrl: string, allowedOrigin: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' ${allowedOrigin}; connect-src ${allowedOrigin}; worker-src 'none';">
</head>
<body>
<script>
(function () {
  'use strict';
  var PYODIDE_DIR = ${JSON.stringify(pyodideDirUrl)};
  var pyodideReady = null;

  function ensurePyodide() {
    if (!pyodideReady) {
      pyodideReady = new Promise(function (resolve, reject) {
        var scriptEl = document.createElement('script');
        scriptEl.src = PYODIDE_DIR + 'pyodide.js';
        scriptEl.onload = function () {
          loadPyodide({ indexURL: PYODIDE_DIR }).then(resolve, reject);
        };
        scriptEl.onerror = function () { reject(new Error('Failed to load the Python runtime.')); };
        document.head.appendChild(scriptEl);
      });
    }
    return pyodideReady;
  }

  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.kind !== 'run') return;
    var requestId = data.requestId;
    var start = Date.now();
    ensurePyodide().then(function (pyodide) {
      pyodide.setStdout({ batched: function (text) { parent.postMessage({ kind: 'log', requestId: requestId, level: 'log', args: [text] }, '*'); } });
      pyodide.setStderr({ batched: function (text) { parent.postMessage({ kind: 'log', requestId: requestId, level: 'error', args: [text] }, '*'); } });
      return pyodide.runPythonAsync(data.code);
    }).then(function (result) {
      var value = result === undefined || result === null ? null : String(result);
      parent.postMessage({ kind: 'result', requestId: requestId, value: value, durationMs: Date.now() - start }, '*');
    }).catch(function (err) {
      parent.postMessage({ kind: 'error', requestId: requestId, source: 'thrown', message: (err && err.message) ? err.message : String(err) }, '*');
    });
  });
})();
</script>
</body>
</html>`;
}
