import { Component, input, signal } from '@angular/core';

/**
 * Reusable clipboard-copy button. Replaces every tool's hand-rolled
 * `navigator.clipboard.writeText` button going forward — existing tools
 * that already do this inline are left untouched.
 */
@Component({
  selector: 'app-copy-button',
  templateUrl: './copy-button.html',
})
export class CopyButton {
  readonly text = input.required<string>();
  readonly label = input('Copy');

  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    if (this.text() === '') return;

    await navigator.clipboard.writeText(this.text());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}
