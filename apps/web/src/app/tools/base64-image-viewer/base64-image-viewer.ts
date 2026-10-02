import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { encodeBytesToBase64, parseBase64Image } from "@dude/tool-engine/tools/base64-image-viewer/base64-image-codec";
import { PreviewBackground } from "@dude/tool-engine/shared/components/preview-background/preview-background-style";
import { PreviewBackgroundChips, PreviewBackgroundTarget } from '../../shared/components/preview-background/preview-background';

export type Base64ImageDirection = 'view' | 'encode';

@Component({
  selector: 'app-base64-image-viewer',
  imports: [PreviewBackgroundChips, PreviewBackgroundTarget, ToolShell, ErrorPanel, CopyButton, FileDrop],
  templateUrl: './base64-image-viewer.html',
})
export class Base64ImageViewer {
  private readonly persistence = inject(PersistenceService);

  protected readonly direction = this.persistence.signal<Base64ImageDirection>('base64-image-viewer', 'direction', 'local', 'view');
  protected readonly previewBg = this.persistence.signal<PreviewBackground>('base64-image-viewer', 'preview-background', 'local', 'theme');
  protected readonly base64Input = signal('');

  protected readonly rejection = signal<string | null>(null);
  protected readonly encodedFilename = signal<string | null>(null);
  protected readonly encodedResult = signal<{ readonly dataUri: string; readonly base64: string } | null>(null);

  protected readonly viewResult = computed(() => {
    if (this.direction() !== 'view' || this.base64Input().trim() === '') return null;
    return parseBase64Image(this.base64Input());
  });

  protected setDirection(direction: Base64ImageDirection): void {
    this.direction.set(direction);
    this.rejection.set(null);
    this.encodedResult.set(null);
    this.encodedFilename.set(null);
  }

  protected onBase64InputChange(event: Event): void {
    this.base64Input.set((event.target as HTMLTextAreaElement).value);
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    const buffer = await file.arrayBuffer();
    const mime = file.type || 'application/octet-stream';
    this.encodedResult.set(encodeBytesToBase64(new Uint8Array(buffer), mime));
    this.encodedFilename.set(file.name);
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected clear(): void {
    this.base64Input.set('');
    this.rejection.set(null);
    this.encodedResult.set(null);
    this.encodedFilename.set(null);
  }
}
