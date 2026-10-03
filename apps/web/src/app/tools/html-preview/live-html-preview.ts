import { Component, ElementRef, OnDestroy, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SandboxChannel, sandboxLoaderUrl } from '../../shared/code-sandbox/sandbox-loader';
import { SandboxErrorEvent, SandboxLogEvent } from "@dude/contracts/sandbox/code-sandbox-protocol";
import { buildBlankPreviewDoc, buildLiveHtmlPreviewDoc } from "@dude/tool-engine/tools/html-preview/live-html-preview-doc";

export type LivePreviewEvent = SandboxLogEvent | SandboxErrorEvent;
export type LivePreviewStatus = 'loading' | 'ready' | 'timeout';

/**
 * Hosts the sandboxed iframe that renders live HTML (including its own
 * `<script>`s). Every source change re-navigates the iframe to a fresh
 * document tagged with a monotonically increasing `renderId`; incoming
 * `message`s are matched against the *current* `renderId` so output from a
 * Document already being replaced is ignored rather than misattributed to
 * the new one. See `live-html-preview-doc.ts` for why there is no
 * spec-guaranteed hard-termination here — the timeout below is best-effort:
 * it swaps in a blank document, which reliably discards a hung Document's
 * resources even though it cannot forcibly interrupt a synchronous script
 * already running inside it the way `Worker.terminate()` can.
 *
 * The document is not a `srcdoc` (that would inherit the Hub's page CSP and block its scripts): each render creates a
 * fresh `<iframe>` on the static `sandbox/html.html` loader and posts the document to it (`sandbox-loader.ts`). The
 * loader writes it synchronously, so a hung user script means the loader never reports `loaded`; that is what the
 * timeout watches for.
 */
@Component({
  selector: 'app-live-html-preview',
  template: `
    @for (key of [frameKey()]; track key) {
      <iframe #frame [src]="src" sandbox="allow-scripts" class="dude-doc-frame h-full w-full border-0 bg-transparent"></iframe>
    }
  `,
})
export class LiveHtmlPreview implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  readonly source = input.required<string>();
  readonly timeoutMs = input(5000);
  readonly event = output<LivePreviewEvent>();

  private readonly renderId = signal(0);
  private readonly statusSignal = signal<LivePreviewStatus>('loading');
  readonly status = this.statusSignal.asReadonly();

  protected readonly src: SafeResourceUrl = sandboxLoaderUrl(this.sanitizer, 'html');

  /** A new iframe element per render (and for the blank document after a timeout) so a hung one is discarded outright. */
  protected readonly frameKey = computed(() => `${this.renderId()}:${this.statusSignal() === 'timeout' ? 'blank' : 'live'}`);

  private readonly channel = computed(() => {
    this.frameKey();
    return new SandboxChannel(
      () => this.frameRef()?.nativeElement,
      () => (this.statusSignal() === 'timeout' ? buildBlankPreviewDoc() : buildLiveHtmlPreviewDoc(this.source(), this.renderId())),
      () => this.onLoaded(),
    );
  });

  constructor() {
    // Registered here, not in `onLoad()`: an inline `<script>` at the top of the
    // user's page runs synchronously during parsing, before the iframe's `load`
    // event fires — a listener attached only in `onLoad()` would miss it. The
    // constructor runs strictly before the iframe is even inserted into the DOM,
    // so this is guaranteed to be listening before any srcdoc content can run.
    this.messageListener = (event: MessageEvent) => {
      const frame = this.frameRef()?.nativeElement;
      if (!frame || event.source !== frame.contentWindow) return;
      if (untracked(() => this.channel().handle(event))) return;
      const data = event.data as { requestId?: string } | undefined;
      if (!data || String(this.renderId()) !== data.requestId) return;
      this.event.emit(event.data as LivePreviewEvent);
    };
    window.addEventListener('message', this.messageListener);

    effect(() => {
      this.source();
      this.statusSignal.set('loading');
      this.renderId.update((n) => n + 1);
      this.armTimeout();
    });
  }

  private armTimeout(): void {
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    const expected = this.renderId();
    this.timeoutHandle = setTimeout(() => {
      if (this.renderId() !== expected) return;
      this.statusSignal.set('timeout');
    }, this.timeoutMs());
  }

  private onLoaded(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    if (this.statusSignal() === 'loading') this.statusSignal.set('ready');
  }

  /** Forces a fresh render of the current source — e.g. after a timeout. */
  reload(): void {
    this.statusSignal.set('loading');
    this.renderId.update((n) => n + 1);
    this.armTimeout();
  }

  ngOnDestroy(): void {
    if (this.messageListener) window.removeEventListener('message', this.messageListener);
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
  }
}
