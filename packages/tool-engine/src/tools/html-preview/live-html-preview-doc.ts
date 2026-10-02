import { buildConsoleCaptureBootstrap } from "../../shared/code-sandbox/code-sandbox-doc.js";

/**
 * Builds the document rendered inside HTML Preview's sandboxed iframe. Unlike
 * the JS Playground's constant srcdoc, this one embeds the user's raw HTML
 * directly and is rebuilt (causing the iframe to re-navigate) on every
 * render. Scripts run in the iframe's own top-level realm here — not a
 * nested Worker — because the whole point of this tool is a live DOM a
 * `<script>` can manipulate; a Worker has no DOM. That means, unlike the
 * JS Playground, there is no spec-guaranteed hard-termination mechanism for
 * a hang here (see `live-html-preview.ts`'s timeout, which is best-effort).
 *
 * The CSP still blocks script-initiated network access (`connect-src
 * 'none'`) while allowing passively-loaded images — the same accepted
 * tradeoff `sandboxed-markdown-preview-doc.ts` already makes for `img-src`.
 * The console-capture bootstrap is prepended before the user's markup so it
 * installs before any user `<script>` runs; leading `<meta>`/`<script>`
 * tags are hoisted into an implicit `<head>` by the HTML parser even when
 * the user's own source is a full `<!DOCTYPE html>` document.
 */
export function buildLiveHtmlPreviewDoc(source: string, renderId: number): string {
  // Quoted so the bootstrap's `requestId` is a JS *string* at runtime, matching what the
  // host compares it against (`String(this.renderId())`) — a bare number literal here would
  // make every posted message look "stale" and get silently dropped.
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data:; connect-src 'none';">
${buildConsoleCaptureBootstrap(JSON.stringify(String(renderId)))}
${source}`;
}

/** Replaces a hung render after a timeout — a fresh, inert document that reliably discards whatever was running before. */
export function buildBlankPreviewDoc(): string {
  return '<!DOCTYPE html><html><body></body></html>';
}
