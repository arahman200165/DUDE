import { Component, ElementRef, OnDestroy, computed, inject, input, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SandboxChannel, sandboxLoaderUrl } from '../../../shared/code-sandbox/sandbox-loader';
import { buildPluginSrcdoc } from "@dude/tool-engine/tools/markdown-workspace/plugins/plugin-sandbox-doc";
import { PluginRuntimeClient } from "@dude/tool-engine/tools/markdown-workspace/plugins/plugin-runtime";
import { MarkdownPluginManifest } from "@dude/tool-engine/tools/markdown-workspace/plugins/plugin-manifest.model";

/**
 * Hosts exactly one plugin's sandboxed iframe. One iframe per loaded
 * plugin isolates plugins from each other too, at zero extra cost. The plugin document is handed to the static
 * `sandbox/plugin.html` loader over `postMessage` (a `srcdoc` would inherit the Hub's page CSP); a changed plugin
 * source recreates the iframe, as the old `[srcdoc]` binding re-navigated it.
 */
@Component({
  selector: 'app-plugin-runtime-host',
  template: `
    @for (source of [manifest().source]; track source) {
      <iframe #frame [src]="src" sandbox="allow-scripts" style="display: none"></iframe>
    }
  `,
})
export class PluginRuntimeHost implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly client = new PluginRuntimeClient();
  private readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  readonly manifest = input.required<MarkdownPluginManifest>();

  protected readonly src: SafeResourceUrl = sandboxLoaderUrl(this.sanitizer, 'plugin');

  private readonly channel = computed(
    () => new SandboxChannel(() => this.frameRef()?.nativeElement, () => buildPluginSrcdoc(this.manifest().source)),
  );
  private readonly messageListener = (event: MessageEvent): void => {
    if (this.channel().handle(event)) return;
    if (event.source !== this.frameRef()?.nativeElement.contentWindow) return;
    this.client.handleMessage(event.data);
  };

  constructor() {
    window.addEventListener('message', this.messageListener);
  }

  async run(inputText: string): Promise<string> {
    const frame = this.frameRef()?.nativeElement;
    if (!frame?.contentWindow) throw new Error('Plugin frame is not ready.');

    return this.client.send((request) => this.channel().send(request), inputText);
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageListener);
  }
}
