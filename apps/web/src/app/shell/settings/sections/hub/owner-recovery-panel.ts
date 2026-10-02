import { Component, ElementRef, computed, effect, inject, output, signal, viewChild } from '@angular/core';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { HUB_ADMIN_UNAVAILABLE, HubAdminError } from '../../../../core/hub/hub-admin.port';
import { HubOwnerSession } from './hub-owner-session.service';
import { MIN_PASSWORD_LENGTH, recoverErrorText } from './local-hub-copy';

type RecoverStep = 'idle' | 'explain' | 'password' | 'working';

/**
 * Device-assisted owner recovery, offered only when this computer is recovery-trusted. Step 1 explains,
 * step 2 collects the new password; only its Confirm button calls the host, and the password is dropped
 * the moment the call is made.
 */
@Component({
  selector: 'app-owner-recovery-panel',
  template: `
    <details data-setting data-testid="owner-recovery" (toggle)="onToggle($event)" (keydown.escape)="cancel()">
      <summary class="cursor-pointer text-ui-sm font-semibold text-text">Forgot the owner password?</summary>
      <div class="mt-2 flex flex-col gap-2">
        @switch (step()) {
          @case ('idle') {
            <p class="text-ui text-text-muted">This computer is trusted for owner recovery, so it can set a new owner password after Windows confirms it is you.</p>
            <div><button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text hover:bg-panel-elevated" (click)="step.set('explain')">Reset the owner password…</button></div>
          }
          @case ('explain') {
            <div class="flex flex-col gap-2" role="group" aria-label="What resetting the owner password does" data-testid="recover-explain">
              <p class="text-ui text-text">Resetting the owner password signs out every owner session on every device and browser. Your recovery codes stay valid.</p>
              <p class="text-ui text-text-muted">Windows will confirm it is you before the password is changed.</p>
              <div class="flex gap-2">
                <button #focusTarget type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10" (click)="step.set('password')">Continue</button>
                <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="cancel()">Cancel</button>
              </div>
            </div>
          }
          @case ('password') {
            <form class="flex flex-col gap-2" role="alertdialog" aria-label="Choose a new owner password" data-testid="recover-form" (submit)="$event.preventDefault()">
              <label class="text-ui text-text-muted" for="recover-password">New owner password</label>
              <input id="recover-password" #focusTarget type="password" autocomplete="new-password" aria-describedby="recover-hint" class="w-full max-w-sm rounded-sm border border-border bg-panel px-2 py-0.5 text-text" [value]="password()" (input)="password.set($any($event.target).value)" />
              <p id="recover-hint" class="text-ui text-text-muted">Use at least {{ minLength }} characters.</p>
              <label class="text-ui text-text-muted" for="recover-confirm">Confirm new password</label>
              <input id="recover-confirm" type="password" autocomplete="new-password" [attr.aria-invalid]="mismatch() ? 'true' : null" class="w-full max-w-sm rounded-sm border border-border bg-panel px-2 py-0.5 text-text" [value]="confirm()" (input)="confirm.set($any($event.target).value)" />
              @if (mismatch()) { <p class="text-ui text-error" data-testid="recover-mismatch">The two passwords do not match.</p> }
              <div class="flex gap-2">
                <button type="button" class="rounded-sm border border-error px-2 py-0.5 text-ui text-error hover:bg-error/10 disabled:opacity-50" [disabled]="!valid()" (click)="confirmRecover()">Confirm reset</button>
                <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="cancel()">Cancel</button>
              </div>
            </form>
          }
          @case ('working') {
            <p class="text-ui text-text-muted" role="status" data-testid="recover-working">Waiting for Windows to confirm it is you…</p>
          }
        }
        <div aria-live="polite">
          @if (error(); as message) { <p class="text-ui text-error" role="alert" data-testid="recover-error">{{ message }}</p> }
          @if (done(); as message) { <p class="text-ui text-success" role="status" data-testid="recover-done">{{ message }}</p> }
        </div>
      </div>
    </details>
  `,
})
export class OwnerRecoveryPanel {
  private readonly hub = inject(HUB_ADMIN);
  private readonly session = inject(HubOwnerSession);

  readonly changed = output<void>();

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly step = signal<RecoverStep>('idle');
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);
  protected readonly mismatch = computed(() => this.confirm() !== '' && this.confirm() !== this.password());
  protected readonly valid = computed(() => this.password().length >= MIN_PASSWORD_LENGTH && this.confirm() === this.password());
  private readonly focusTarget = viewChild<ElementRef<HTMLElement>>('focusTarget');

  constructor() {
    effect(() => this.focusTarget()?.nativeElement.focus());
  }

  protected onToggle(event: Event): void {
    if (!(event.target as HTMLDetailsElement).open) this.cancel();
  }

  protected cancel(): void {
    if (this.step() === 'working') return;
    this.password.set('');
    this.confirm.set('');
    this.error.set(null);
    this.step.set('idle');
  }

  protected async confirmRecover(): Promise<void> {
    if (this.step() !== 'password' || !this.valid()) return;
    const next = this.password();
    this.password.set('');
    this.confirm.set('');
    this.error.set(null);
    this.done.set(null);
    this.step.set('working');
    try {
      if (!this.hub.recoverOwner) throw new HubAdminError(HUB_ADMIN_UNAVAILABLE, 'Owner recovery is not available here.');
      await this.hub.recoverOwner(next);
      this.session.markSignedOut();
      this.step.set('idle');
      this.done.set('Owner password reset. Sign in with the new password.');
      this.changed.emit();
    } catch (error) {
      this.error.set(recoverErrorText(error));
      this.step.set('explain');
    }
  }
}
