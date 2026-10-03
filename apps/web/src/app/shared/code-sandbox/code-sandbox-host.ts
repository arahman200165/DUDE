import { Component, ElementRef, OnDestroy, inject, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { buildCodeSandboxDoc } from "@dude/tool-engine/shared/code-sandbox/code-sandbox-doc";
import { CodeSandboxClient } from "@dude/tool-engine/shared/code-sandbox/code-sandbox-client";
import { SandboxEvent } from "@dude/contracts/sandbox/code-sandbox-protocol";
import { SandboxChannel, sandboxLoaderUrl } from './sandbox-loader';

/**
 * Hosts the sandboxed iframe that runs arbitrary JS for the JS Playground
 * and Template Renderer. One instance = one iframe = one run at a time (see
 * `code-sandbox-doc.ts`). The document is a fixed constant handed to the static
 * `sandbox/code.html` loader page over `postMessage` (see `sandbox-loader.ts`; a
 * `srcdoc` would inherit the Hub's page CSP), so this iframe never re-navigates
 * between runs. Runs requested before the loader handshake completes are queued.
 */
@Component({
  selector: 'app-code-sandbox-host',
  template: `<iframe #frame [src]="src" sandbox="allow-scripts" style="display: none"></iframe>`,
})
export class CodeSandboxHost implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly client = new CodeSandboxClient();
  private readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly channel = new SandboxChannel(() => this.frameRef()?.nativeElement, () => buildCodeSandboxDoc());
  private readonly messageListener = (event: MessageEvent): void => {
    if (this.channel.handle(event)) return;
    if (event.source !== this.frameRef()?.nativeElement.contentWindow) return;
    this.client.handleMessage(event.data);
  };

  protected readonly src: SafeResourceUrl = sandboxLoaderUrl(this.sanitizer, 'code');

  constructor() {
    window.addEventListener('message', this.messageListener);
  }

  run(code: string, timeoutMs: number, onEvent: (event: SandboxEvent) => void): { requestId: string; cancel(): void } {
    const frame = this.frameRef()?.nativeElement;
    if (!frame?.contentWindow) throw new Error('Sandbox frame is not ready.');

    return this.client.run((request) => this.channel.send(request), code, timeoutMs, onEvent);
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageListener);
  }
}
