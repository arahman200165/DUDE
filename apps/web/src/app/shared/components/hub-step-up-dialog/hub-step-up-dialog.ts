import { Component, input, output, signal } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';

/**
 * Password re-confirmation prompt for guarded Hub actions (owner step-up). Presentational: the host supplies an optional
 * message (for example why the last password was refused) and reacts to `submitted` / `cancelled`.
 */
@Component({
  selector: 'app-hub-step-up-dialog',
  imports: [CdkTrapFocus],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-bg/70" (keydown.escape)="cancelled.emit()">
      <form cdkTrapFocus cdkTrapFocusAutoCapture role="alertdialog" aria-modal="true" aria-labelledby="hub-step-up-title" aria-describedby="hub-step-up-body"
        class="w-96 max-w-[90vw] rounded-sm border border-border bg-panel p-4 text-text shadow-lg" (submit)="submit($event)">
        <h2 id="hub-step-up-title" class="text-sm font-semibold">Confirm your password</h2>
        <p id="hub-step-up-body" class="mt-1 text-ui-sm text-text-muted">This action needs the owner password again, even though you are signed in.</p>
        <label class="mt-3 block text-ui-sm text-text-muted" for="hub-step-up-password">Owner password</label>
        <input id="hub-step-up-password" data-testid="step-up-password" type="password" autocomplete="current-password" cdkFocusInitial
          class="mt-1 w-full rounded-sm border border-border bg-bg px-2 py-1 text-ui text-text" [value]="password()" (input)="password.set($any($event.target).value)" />
        @if (message()) {
          <p class="mt-2 text-ui-sm text-error" role="alert" data-testid="step-up-error">{{ message() }}</p>
        }
        <div class="mt-4 flex justify-end gap-2 border-t border-border pt-3">
          <button type="button" data-testid="step-up-cancel" class="rounded-sm border border-border px-3 py-1 text-ui-sm hover:bg-panel-elevated" (click)="cancelled.emit()">Cancel</button>
          <button type="submit" data-testid="step-up-confirm" class="rounded-sm bg-accent px-3 py-1 text-ui-sm text-on-accent disabled:opacity-50" [disabled]="password().length === 0">Confirm</button>
        </div>
      </form>
    </div>
  `,
})
export class HubStepUpDialog {
  readonly message = input<string | null>(null);
  readonly submitted = output<string>();
  readonly cancelled = output<void>();

  protected readonly password = signal('');

  protected submit(event: Event): void {
    event.preventDefault();
    const value = this.password();
    if (value.length > 0) this.submitted.emit(value);
  }
}
