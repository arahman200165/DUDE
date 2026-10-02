import { Component, ElementRef, OnDestroy, computed, inject, input, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { buildPluginSrcdoc } from "@dude/tool-engine/tools/markdown-workspace/plugins/plugin-sandbox-doc";
import { PluginRuntimeClient } from "@dude/tool-engine/tools/markdown-workspace/plugins/plugin-runtime";
import { MarkdownPluginManifest } from "@dude/tool-engine/tools/markdown-workspace/plugins/plugin-manifest.model";

/**
 * Hosts exactly one plugin's sandboxed iframe. One iframe per loaded
 * plugin isolates plugins from each other too, at zero extra cost.
 */
@Component({
  selector: 'app-plugin-runtime-host',
  template: `<iframe #frame [srcdoc]="srcdoc()" sandbox="allow-scripts" style="display: none" (load)="onLoad()"></iframe>`,
})
export class PluginRuntimeHost implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly client = new PluginRuntimeClient();
  private readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private messageListener: ((event: MessageEvent) => void) | null = null;

  readonly manifest = input.required<MarkdownPluginManifest>();

  protected readonly srcdoc = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(buildPluginSrcdoc(this.manifest().source)));

  protected onLoad(): void {
    const frame = this.frameRef()?.nativeElement;
    if (!frame || this.messageListener) return;

    this.messageListener = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      this.client.handleMessage(event.data);
    };
    window.addEventListener('message', this.messageListener);
  }

  async run(inputText: string): Promise<string> {
    const frame = this.frameRef()?.nativeElement;
    if (!frame?.contentWindow) throw new Error('Plugin frame is not ready.');

    return this.client.send((request) => frame.contentWindow!.postMessage(request, '*'), inputText);
  }

  ngOnDestroy(): void {
    if (this.messageListener) window.removeEventListener('message', this.messageListener);
  }
}
