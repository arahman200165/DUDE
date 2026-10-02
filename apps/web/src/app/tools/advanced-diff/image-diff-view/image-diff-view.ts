import { Component, effect, input, signal } from '@angular/core';
import { AdvancedDiffImageResult } from "@dude/tool-engine/tools/advanced-diff/advanced-diff-image-result";

/**
 * Presentational: renders the two source images side by side plus the diff PNG. Manages its own
 * Object URL lifecycle (create on input change, revoke on cleanup) -- the same pattern File Base64
 * Conversion already established for an image preview.
 */
@Component({
  selector: 'app-image-diff-view',
  templateUrl: './image-diff-view.html',
})
export class ImageDiffView {
  readonly leftFile = input<File | null>(null);
  readonly rightFile = input<File | null>(null);
  readonly result = input<AdvancedDiffImageResult | null>(null);

  protected readonly leftUrl = signal<string | null>(null);
  protected readonly rightUrl = signal<string | null>(null);
  protected readonly diffUrl = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const file = this.leftFile();
      if (!file) {
        this.leftUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(file);
      this.leftUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });

    effect((onCleanup) => {
      const file = this.rightFile();
      if (!file) {
        this.rightUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(file);
      this.rightUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });

    effect((onCleanup) => {
      const result = this.result();
      if (!result || !result.ok) {
        this.diffUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(new Blob([result.diffPng], { type: 'image/png' }));
      this.diffUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }
}
