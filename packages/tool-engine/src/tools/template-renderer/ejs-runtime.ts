import { hostFetch } from "@dude/crypto/host";
/**
 * Fetches EJS's self-contained client bundle (copied into the build output
 * at `assets/vendor/ejs.min.js` by an `angular.json` assets glob pointing at
 * `node_modules/ejs`, mirroring the Pyodide playground's self-hosted-asset
 * approach — no third-party CDN, so this keeps working fully offline once
 * cached) exactly once per app session, as plain text — never executed in
 * the main thread. Its text is prepended to the code sent into the sandbox
 * by `template-render.ts` so `ejs` becomes a real global there.
 */
let cached: Promise<string> | null = null;

export function loadEjsRuntimeSource(): Promise<string> {
  if (!cached) {
    cached = hostFetch('assets/vendor/ejs.min.js').then((response) => {
      if (!response.ok) throw new Error(`Failed to load the EJS runtime (HTTP ${response.status}).`);
      return response.text();
    });
  }
  return cached;
}
