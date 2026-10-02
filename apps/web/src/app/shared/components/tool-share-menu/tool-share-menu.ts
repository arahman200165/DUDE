import { Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { ShareLinkService } from '../../../core/share/share-link.service';
import { ToolDefinition } from '../../models/tool-definition.model';
import { DudeDeepLink } from "@dude/domain/core/deep-link/deep-link.model";
import { OpenInDesktop } from '../open-in-desktop/open-in-desktop';

/**
 * ToolShell's "Share" menu (DUDE_PRD.md §21 Phase 26 Item 12). "Copy link" always copies the bare,
 * data-free route. "Copy link with input" is a separate, explicitly labelled action, shown only for
 * tools with a declared text input, and warns that the input rides along in the URL.
 */
@Component({
  selector: 'app-tool-share-menu',
  imports: [OpenInDesktop],
  templateUrl: './tool-share-menu.html',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
})
export class ToolShareMenu {
  private readonly share = inject(ShareLinkService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly definition = input<ToolDefinition | undefined>(undefined);

  protected readonly open = signal(false);
  protected readonly status = signal<string | null>(null);
  protected readonly desktopLink = computed<DudeDeepLink | null>(() => {
    const definition = this.definition();
    return definition ? { action: 'open', target: 'tool', id: definition.id } : null;
  });
  protected readonly canShareInput = computed(() => {
    const definition = this.definition();
    return !!definition && this.share.canShareInput(definition.id);
  });

  protected toggle(): void {
    this.status.set(null);
    this.open.update((open) => !open);
  }

  protected async copyLink(): Promise<void> {
    const definition = this.definition();
    const url = definition && this.share.linkFor(definition.id);
    if (url) await this.copy(url, 'Link copied.');
  }

  protected async copyLinkWithInput(): Promise<void> {
    const definition = this.definition();
    if (!definition) return;
    const result = await this.share.linkWithInputFor(definition.id);
    if (result.ok) {
      await this.copy(result.url, 'Link with input copied.');
      return;
    }
    this.status.set(
      result.reason === 'empty'
        ? 'The input is empty, so there’s nothing to include.'
        : result.reason === 'too-large'
          ? 'Too large to share by link. Use Save to share it as a file instead.'
          : 'This tool has no shareable input.',
    );
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  private async copy(text: string, done: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.status.set(done);
    } catch {
      this.status.set('Clipboard access was blocked by the browser.');
    }
  }
}
