import { Component, input, output, signal } from '@angular/core';
import { CopyButton } from '../../shared/components/copy-button/copy-button';

/**
 * Shows freshly issued recovery codes exactly once. The codes live only in the parent's state and this input;
 * they are never persisted or logged. The Hub cannot show them again, so dismissal requires an explicit
 * "I have saved these codes" acknowledgement.
 */
@Component({
  selector: 'app-recovery-codes-display',
  imports: [CopyButton],
  template: `
    <div class="flex flex-col gap-2" data-testid="recovery-codes">
      <p class="text-ui text-text">
        Save these recovery codes now. Each one can reset your password once, and they will not be shown again.
      </p>
      <ul class="grid grid-cols-2 gap-x-4 gap-y-1 rounded-sm border border-border bg-bg p-2 font-mono text-ui text-text" aria-label="Recovery codes">
        @for (code of codes(); track code) { <li data-testid="recovery-code">{{ code }}</li> }
      </ul>
      <div><app-copy-button [text]="allCodes()" label="Copy all" /></div>
      <label class="flex items-center gap-2 text-ui text-text">
        <input type="checkbox" data-testid="saved-checkbox" [checked]="saved()" (change)="saved.set($any($event.target).checked)" />
        I have saved these codes
      </label>
      <div>
        <button
          type="button"
          data-testid="codes-continue"
          class="rounded-sm bg-accent px-3 py-1 text-ui font-semibold text-on-accent disabled:opacity-50"
          [disabled]="!saved() || busy()"
          (click)="done.emit()"
        >{{ continueLabel() }}</button>
      </div>
    </div>
  `,
})
export class RecoveryCodesDisplay {
  readonly codes = input.required<readonly string[]>();
  readonly continueLabel = input('Continue');
  readonly busy = input(false);
  readonly done = output<void>();

  protected readonly saved = signal(false);
  protected allCodes(): string {
    return this.codes().join('\n');
  }
}
