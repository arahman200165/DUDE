# AGENTS.md — apps/web/src/app/shared/code-sandbox/

Shared sandbox (opaque-origin `<iframe sandbox="allow-scripts">` + a nested `Worker`, terminated per run) backing the JS Playground and, unchanged, the Template Renderer (an EJS template compiles to real JS internally, so it's exactly as arbitrary as a JS Playground snippet). **Read `code-sandbox-doc.ts`'s doc comment before changing anything here** — it explains the two-layer design and why each layer exists.

HTML Preview and Python Playground do **not** use this module — their execution models can't use a Worker (HTML needs a live DOM; Pyodide needs real `fetch`/WebAssembly access), so they each ship a tool-local sandbox variant instead (see `packages/tool-engine/src/tools/python-playground/python-sandbox-doc.ts` for that variant's reasoning).

## Three gotchas found only through live browser testing (unit tests catch none of them)

1. **CSP `connect-src` is not enough for an external `<script src>`.** That also needs the origin listed in `script-src`. `'unsafe-inline'` alone only covers inline `<script>` blocks.
2. **An opaque-origin document's dynamic `import()` is always a CORS-mode fetch**, even for a same-looking URL — it needs a matching `Access-Control-Allow-Origin` response header or it fails with "Failed to fetch dynamically imported module." GitHub Pages sends this by default; `ng serve` needs it added explicitly via `angular.json`'s `serve.options.headers`.
3. **Mutating an `<iframe>`'s `srcdoc` in place is not a reliable kill switch** for a hung document — resources don't consistently free up, and subsequent runs in the same tab silently degrade even though the host page stays responsive. The fix is to destroy and recreate the `<iframe>` *element* (keyed on a generation counter), not just reassign its `srcdoc`.

**If you're building a new sandboxed-execution tool**, budget real browser-testing time for exactly these three failure modes — code review and unit tests won't surface them.
