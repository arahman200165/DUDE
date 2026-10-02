import { Component, ElementRef, OnDestroy, inject, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { buildCodeSandboxDoc } from "@dude/tool-engine/shared/code-sandbox/code-sandbox-doc";
import { CodeSandboxClient } from "@dude/tool-engine/shared/code-sandbox/code-sandbox-client";
import { SandboxEvent } from "@dude/contracts/sandbox/code-sandbox-protocol";

/**
 * Hosts the sandboxed iframe that runs arbitrary JS for the JS Playground
 * and Template Renderer. One instance = one iframe = one run at a time (see
 * `code-sandbox-doc.ts`). The srcdoc is a fixed constant, so — unlike
 * `PluginRuntimeHost`, which rebuilds its srcdoc per plugin — this iframe
 * never re-navigates between runs.
 */
@Component({
  selector: 'app-code-sandbox-host',
  template: `<iframe #frame [srcdoc]="srcdoc" sandbox="allow-scripts" style="display: none" (load)="onLoad()"></iframe>`,
})
export class CodeSandboxHost implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly client = new CodeSandboxClient();
  private readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private messageListener: ((event: MessageEvent) => void) | null = null;

  protected readonly srcdoc: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(buildCodeSandboxDoc());

  protected onLoad(): void {
    const frame = this.frameRef()?.nativeElement;
    if (!frame || this.messageListener) return;

    this.messageListener = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      this.client.handleMessage(event.data);
    };
    window.addEventListener('message', this.messageListener);
  }

  run(code: string, timeoutMs: number, onEvent: (event: SandboxEvent) => void): { requestId: string; cancel(): void } {
    const frame = this.frameRef()?.nativeElement;
    if (!frame?.contentWindow) throw new Error('Sandbox frame is not ready.');

    return this.client.run((request) => frame.contentWindow!.postMessage(request, '*'), code, timeoutMs, onEvent);
  }

  ngOnDestroy(): void {
    if (this.messageListener) window.removeEventListener('message', this.messageListener);
  }
}
