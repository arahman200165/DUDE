/**
 * Sandbox for running arbitrary, untrusted JavaScript (used directly by the
 * JS Playground, and by the Template Renderer, which bundles the real `ejs`
 * client runtime into the worker source and calls `ejs.render(...)` there —
 * an EJS template compiles to a real JS function internally, so it's
 * exactly as arbitrary as a JS Playground snippet and needs the same
 * sandbox, not a lighter one).
 *
 * CSP allows `'unsafe-eval'`: EJS's own `render()` calls `new Function(...)`
 * internally to compile a template, which needs it. This does not weaken
 * the sandbox — the entire worker source is already attacker-controlled by
 * construction (that's the whole point), so whether that already-untrusted
 * code can *also* reach `eval`/`new Function` changes nothing about the
 * properties CSP is actually relied on for here (`connect-src 'none'`) or
 * about the opaque-origin/`Worker.terminate()` isolation below.
 *
 * Two layers, for two different jobs:
 *
 * - `<iframe sandbox="allow-scripts">` (no `allow-same-origin`, giving an
 *   opaque origin with no cookie/storage/host-DOM access) — same choice as
 *   the Markdown Workspace plugin sandbox, and for the same reason: a bare
 *   same-origin Worker could still `fetch`/`importScripts`.
 * - A `Worker`, spawned from *inside* that iframe for every run, terminated
 *   via `Worker.terminate()` on timeout/cancel. This is the layer that
 *   actually guarantees a hung `while(true){}` gets stopped: a `Worker` is
 *   guaranteed off-thread by every engine (the whole point of the API), and
 *   `terminate()` is an unconditional, non-cooperative hard stop — a
 *   stronger guarantee than hoping an opaque-origin iframe happens to get
 *   its own OS process. The timeout timer itself lives in this bootstrap
 *   script, which never runs user code and so can never hang, keeping the
 *   timer trustworthy regardless of what the worker is doing.
 *
 * The srcdoc below is constant — it never embeds user code and never
 * changes between runs, so the iframe never re-navigates on every "Run"
 * click; only the per-run Worker (built from a fresh Blob URL) is ephemeral.
 * Only one run is active per iframe at a time — starting a new run silently
 * terminates and reports `terminated: cancelled` for any prior one first, so
 * `CodeSandboxClient` never leaks a pending entry.
 *
 * Deliberately synchronous-only for V1: a `result` (the top-level statements
 * finished without throwing) terminates the worker immediately, same as an
 * `error`. Tried the alternative (keep the worker alive so a pending
 * `setTimeout`/`fetch().then()` could still report later) and rejected it —
 * without a real way to detect "no more pending work" from outside the
 * worker, a run with any async callback in flight would sit at the full
 * `timeoutMs` before finishing and get mislabeled `terminated: timeout`
 * even when it actually succeeded, which is worse than the current,
 * honestly-scoped limitation: console output/results from callbacks that
 * haven't fired by the time the script returns are not captured.
 *
 * Protocol: see `code-sandbox-protocol.ts`. The CSP's `connect-src 'none'`
 * blocks network from the worker; `worker-src blob:` is what allows spawning
 * the per-run Worker from a Blob URL at all. As with the existing sandboxed
 * components, this is defense-in-depth only — GitHub Pages cannot serve a
 * real CSP header, so this meta tag is the only CSP in play.
 */

const BRIDGE_SOURCE = `
(function () {
  'use strict';
  var active = null;

  function buildWorkerSource(userCode) {
    return [
      "var __MAX_ARG_LENGTH = 10000;",
      "var __logCount = 0;",
      "function __truncate(s) { return s.length > __MAX_ARG_LENGTH ? s.slice(0, __MAX_ARG_LENGTH) + '\\u2026' : s; }",
      "['log','warn','error','info','debug'].forEach(function (level) {",
      "  console[level] = function () {",
      "    __logCount++;",
      "    var args = Array.prototype.slice.call(arguments).map(function (a) {",
      "      var s; try { s = JSON.stringify(a); if (s === undefined) s = String(a); } catch (e) { s = String(a); }",
      "      return __truncate(s);",
      "    });",
      "    postMessage({ kind: 'log', level: level, args: args });",
      "    if (__logCount === 2000) { postMessage({ kind: 'log-flood' }); }",
      "  };",
      "});",
      "self.addEventListener('error', function (event) {",
      "  postMessage({ kind: 'error', source: 'uncaught', message: event.message, stack: event.error && event.error.stack });",
      "  event.preventDefault();",
      "});",
      "self.addEventListener('unhandledrejection', function (event) {",
      "  var reason = event.reason;",
      "  postMessage({ kind: 'error', source: 'unhandledrejection', message: (reason && reason.message) ? reason.message : String(reason), stack: reason && reason.stack });",
      "});",
      "var __start = Date.now();",
      "try {",
      "  var __result = (function () {",
      userCode,
      "  })();",
      "  var __value;",
      "  try { __value = JSON.stringify(__result); if (__value === undefined) __value = String(__result); } catch (e) { __value = String(__result); }",
      "  postMessage({ kind: 'result', value: __value, durationMs: Date.now() - __start });",
      "} catch (err) {",
      "  postMessage({ kind: 'error', source: 'thrown', message: (err && err.message) ? err.message : String(err), name: err && err.name, stack: err && err.stack });",
      "}",
    ].join('\\n');
  }

  function finish(message) {
    parent.postMessage(message, '*');
    cleanupActive();
  }

  function cleanupActive() {
    if (!active) return;
    clearTimeout(active.timeoutHandle);
    try { active.worker.terminate(); } catch (e) {}
    try { URL.revokeObjectURL(active.blobUrl); } catch (e) {}
    active = null;
  }

  function startRun(request) {
    var source = buildWorkerSource(request.code);
    var blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    var worker;
    try {
      worker = new Worker(blobUrl);
    } catch (e) {
      parent.postMessage({ kind: 'error', requestId: request.requestId, source: 'thrown', message: String(e) }, '*');
      URL.revokeObjectURL(blobUrl);
      return;
    }

    active = { requestId: request.requestId, worker: worker, blobUrl: blobUrl, timeoutHandle: null };

    worker.onmessage = function (event) {
      var data = event.data || {};
      if (data.kind === 'log-flood') {
        finish({ kind: 'terminated', requestId: active.requestId, reason: 'log-flood' });
        return;
      }
      data.requestId = active.requestId;
      parent.postMessage(data, '*');
      if (data.kind === 'result' || data.kind === 'error') cleanupActive();
    };

    worker.onerror = function (event) {
      event.preventDefault();
      finish({ kind: 'error', requestId: active.requestId, source: 'thrown', message: event.message || 'Worker error' });
    };

    active.timeoutHandle = setTimeout(function () {
      finish({ kind: 'terminated', requestId: active.requestId, reason: 'timeout' });
    }, request.timeoutMs);
  }

  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.kind === 'run') {
      if (active) finish({ kind: 'terminated', requestId: active.requestId, reason: 'cancelled' });
      startRun(data);
    } else if (data.kind === 'cancel') {
      if (active && active.requestId === data.requestId) {
        finish({ kind: 'terminated', requestId: active.requestId, reason: 'cancelled' });
      }
    }
  });
})();
`;

export function buildCodeSandboxDoc(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none';">
</head>
<body>
<script>${BRIDGE_SOURCE}</script>
</body>
</html>`;
}

/**
 * Console/error capture for a DOM-realm sandbox (HTML Preview), where user
 * `<script>`s need real DOM access and so cannot run inside a Worker. Prepend
 * this as its own `<script>` before the user's HTML — it forwards to the
 * original `console` method too (so the iframe's own devtools console still
 * works) as well as posting a `SandboxLogEvent`/`SandboxErrorEvent`-shaped
 * message to `parent`. Unlike the Worker-based bridge above, there is no
 * per-request correlation here — the host tags outgoing renders with a
 * monotonically increasing counter and ignores messages from a stale one.
 */
export function buildConsoleCaptureBootstrap(requestIdExpr: string): string {
  return `<script>
(function () {
  var requestId = ${requestIdExpr};
  ['log','warn','error','info','debug'].forEach(function (level) {
    var original = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () {
      original.apply(console, arguments);
      var args = Array.prototype.slice.call(arguments).map(function (a) {
        try { var s = JSON.stringify(a); return s === undefined ? String(a) : s; } catch (e) { return String(a); }
      });
      parent.postMessage({ kind: 'log', requestId: requestId, level: level, args: args }, '*');
    };
  });
  window.addEventListener('error', function (event) {
    parent.postMessage({ kind: 'error', requestId: requestId, source: 'uncaught', message: event.message }, '*');
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    parent.postMessage({ kind: 'error', requestId: requestId, source: 'unhandledrejection', message: (reason && reason.message) ? reason.message : String(reason) }, '*');
  });
})();
</script>`;
}
