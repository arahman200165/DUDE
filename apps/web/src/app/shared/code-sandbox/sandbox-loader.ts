import { SafeResourceUrl } from '@angular/platform-browser';
import type { DomSanitizer } from '@angular/platform-browser';

/**
 * Static loader pages under `apps/web/public/sandbox/` (identical content; separate files so the Hub can give each its
 * own CSP header). A `srcdoc` iframe inherits the embedding page's CSP, which blocks inline bootstrap scripts on the
 * Hub, so sandboxed tools load one of these by `src` and then hand it their document over `postMessage`.
 *
 * Handshake: the loader posts `dude-sandbox-ready`; the host answers with `dude-sandbox-load` (the document) and
 * flushes anything queued; the loader writes the document and posts `dude-sandbox-loaded`. Messages the host posts
 * after the load message are delivered after the (synchronous) document write, so queued sends cannot race it.
 */
export type SandboxPage = 'code' | 'python' | 'html' | 'plugin';

export const SANDBOX_READY = 'dude-sandbox-ready';
export const SANDBOX_LOAD = 'dude-sandbox-load';
export const SANDBOX_LOADED = 'dude-sandbox-loaded';

/** Resolved against `document.baseURI` so it works under Pages' `/DUDE/` and the Hub/desktop root alike. */
export function sandboxLoaderUrl(sanitizer: DomSanitizer, page: SandboxPage): SafeResourceUrl {
  return sanitizer.bypassSecurityTrustResourceUrl(new URL(`sandbox/${page}.html`, document.baseURI).href);
}

function messageType(data: unknown): string | undefined {
  return typeof data === 'object' && data !== null ? (data as { type?: string }).type : undefined;
}

/**
 * Per-iframe-element channel. Create one per iframe generation, feed it every `message` event, and send through it.
 * `send` queues until the document has been handed to the loader.
 */
export class SandboxChannel {
  private posted = false;
  private loaded = false;
  private queue: unknown[] = [];

  constructor(
    private readonly frame: () => HTMLIFrameElement | undefined,
    private readonly html: () => string,
    private readonly onLoaded: () => void = () => undefined,
  ) {}

  /** Returns true when the event came from this frame and was a loader handshake message (so the caller skips it). */
  handle(event: MessageEvent): boolean {
    const frame = this.frame();
    if (!frame || event.source !== frame.contentWindow) return false;
    const type = messageType(event.data);
    if (type === SANDBOX_READY) {
      if (!this.posted) {
        this.posted = true;
        frame.contentWindow?.postMessage({ type: SANDBOX_LOAD, html: this.html() }, '*');
        for (const message of this.queue) frame.contentWindow?.postMessage(message, '*');
        this.queue = [];
      }
      return true;
    }
    if (type === SANDBOX_LOADED) {
      if (!this.loaded) {
        this.loaded = true;
        this.onLoaded();
      }
      return true;
    }
    return false;
  }

  send(message: unknown): void {
    if (!this.posted) {
      this.queue.push(message);
      return;
    }
    this.frame()?.contentWindow?.postMessage(message, '*');
  }
}
