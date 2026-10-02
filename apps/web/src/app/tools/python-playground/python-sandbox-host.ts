import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CodeSandboxClient } from "@dude/tool-engine/shared/code-sandbox/code-sandbox-client";
import { SandboxEvent } from "@dude/contracts/sandbox/code-sandbox-protocol";
import { buildPythonSandboxDoc } from "@dude/tool-engine/tools/python-playground/python-sandbox-doc";

/**
 * Hosts the Pyodide sandbox iframe. Reuses `CodeSandboxClient`'s
 * `requestId`-correlated postMessage protocol from `code-sandbox/` — it's
 * fully generic about what's inside the iframe — but not `CodeSandboxHost`
 * itself, since Python's kill-switch works differently (see
 * `python-sandbox-doc.ts`): on timeout or cancel, this component destroys
 * and recreates the `<iframe>` element itself (see the `@for`/`generation`
 * comment on the component decorator below) rather than terminating a
 * nested Worker. Recreating means fully re-running `loadPyodide()` on the
 * next call — a real cost (WASM bootstrap, ~1-3s cache-warm) — so the
 * iframe is reused across runs within a session and only torn down after
 * an actual timeout/cancel.
 */
@Component({
  selector: 'app-python-sandbox-host',
  // `@for` tracking `generation` itself (not a fixed key) is deliberate: it forces Angular to
  // destroy the *element* and create a brand new one whenever `generation` changes, rather
  // than reusing the same `<iframe>` and only mutating its `srcdoc` property. Mutating srcdoc
  // in place was tried first and was not reliable — a hung document's resources did not
  // consistently free up promptly, so a same-tab retry after a timeout could itself hang for
  // a long time despite the host page staying fully responsive throughout. Recreating the
  // element outright gives the browser a completely fresh iframe, matching what a genuinely
  // new page load looks like (and, empirically, is exactly as fast).
  template: `
    @for (gen of [generation()]; track gen) {
      <iframe #frame [srcdoc]="srcdoc()" sandbox="allow-scripts" style="display: none"></iframe>
    }
  `,
})
export class PythonSandboxHost implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly client = new CodeSandboxClient();
  private readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly messageListener: (event: MessageEvent) => void;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private activeRequestId: string | null = null;

  protected readonly generation = signal(0);

  protected readonly srcdoc = computed<SafeHtml>(() => {
    const pyodideDirUrl = new URL('assets/vendor/pyodide/', document.baseURI).href;
    // `location.origin` is the opaque string 'null' under the desktop's custom `dude-app://` scheme.
    const doc = buildPythonSandboxDoc(pyodideDirUrl, `${window.location.protocol}//${window.location.host}`);
    return this.sanitizer.bypassSecurityTrustHtml(doc);
  });

  constructor() {
    this.messageListener = (event: MessageEvent) => {
      const frame = this.frameRef()?.nativeElement;
      if (!frame || event.source !== frame.contentWindow) return;
      this.client.handleMessage(event.data);
    };
    window.addEventListener('message', this.messageListener);
  }

  run(code: string, timeoutMs: number, onEvent: (event: SandboxEvent) => void): void {
    const frame = this.frameRef()?.nativeElement;
    if (!frame?.contentWindow) throw new Error('Sandbox frame is not ready.');

    const handle = this.client.run(
      (request) => frame.contentWindow!.postMessage(request, '*'),
      code,
      timeoutMs,
      (event) => {
        if (event.kind === 'result' || event.kind === 'error') {
          this.clearTimer();
          this.activeRequestId = null;
        }
        onEvent(event);
      },
    );
    this.activeRequestId = handle.requestId;

    this.timeoutHandle = setTimeout(() => this.forceTerminate('timeout'), timeoutMs);
  }

  /** Abandons the current run, if any, and tears down the sandbox iframe (a fresh Pyodide instance loads on the next `run`). */
  cancel(): void {
    this.forceTerminate('cancelled');
  }

  private forceTerminate(reason: 'timeout' | 'cancelled'): void {
    if (!this.activeRequestId) return;
    this.client.handleMessage({ kind: 'terminated', requestId: this.activeRequestId, reason });
    this.activeRequestId = null;
    this.clearTimer();
    this.generation.update((n) => n + 1);
  }

  private clearTimer(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageListener);
    this.clearTimer();
  }
}
