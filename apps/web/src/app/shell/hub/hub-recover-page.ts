import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HUB_ADMIN } from '../../core/hub/hub-admin.token';
import { HubCard } from './hub-card';
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, RetryCountdown, describeHubError } from './hub-utils';
import { RecoveryCodesDisplay } from './recovery-codes-display';

type Mode = 'code' | 'reset';

/** `/hub/recover`: regain access with a recovery code, or with a reset token printed by `dude-hub owner reset`. */
@Component({
  selector: 'app-hub-recover-page',
  imports: [HubCard, RecoveryCodesDisplay, RouterLink],
  template: `
    <app-hub-card heading="Recover owner access">
      @if (newCodes().length > 0) {
        <app-recovery-codes-display [codes]="newCodes()" continueLabel="Continue to sign in" [busy]="busy()" (done)="finishReset()" />
        <div aria-live="assertive" role="alert" data-testid="error">@if (error()) { <p class="text-ui text-error">{{ error() }}</p> }</div>
      } @else if (warning()) {
        <p class="text-ui text-warning" role="status" data-testid="remaining-warning">{{ warning() }}</p>
        <div><button type="button" data-testid="continue" class="rounded-sm bg-accent px-3 py-1 text-ui font-semibold text-on-accent" (click)="goHome()">Continue</button></div>
      } @else {
        <div role="tablist" aria-label="Recovery method" class="flex gap-2 border-b border-border">
          <button type="button" role="tab" id="tab-code" aria-controls="panel-recover" class="px-2 py-1 text-ui" [attr.aria-selected]="mode() === 'code'"
            [class.border-b-2]="mode() === 'code'" [class.border-accent]="mode() === 'code'" [class.text-text]="mode() === 'code'" [class.text-text-muted]="mode() !== 'code'"
            (click)="setMode('code')">Recovery code</button>
          <button type="button" role="tab" id="tab-reset" aria-controls="panel-recover" class="px-2 py-1 text-ui" [attr.aria-selected]="mode() === 'reset'"
            [class.border-b-2]="mode() === 'reset'" [class.border-accent]="mode() === 'reset'" [class.text-text]="mode() === 'reset'" [class.text-text-muted]="mode() !== 'reset'"
            (click)="setMode('reset')">Reset token</button>
        </div>
        <form id="panel-recover" role="tabpanel" class="flex flex-col gap-2" (submit)="$event.preventDefault(); submit()" autocomplete="off">
          @if (mode() === 'code') {
            <p class="text-ui text-text-muted">Use one of the recovery codes you saved when the Hub was set up. Each code works once.</p>
            <label class="flex flex-col gap-1 text-ui text-text">Recovery code
              <input type="text" name="recovery-code" class="rounded-sm border border-border bg-bg px-2 py-1 font-mono text-text" autocomplete="one-time-code" spellcheck="false" placeholder="XXXXX-XXXXX"
                [value]="secret()" (input)="secret.set($any($event.target).value)" />
            </label>
          } @else {
            <p class="text-ui text-text-muted">Run <code>dude-hub owner reset</code> on the Hub machine and paste the token it prints. This issues new recovery codes.</p>
            <label class="flex flex-col gap-1 text-ui text-text">Reset token
              <input type="text" name="reset-token" class="rounded-sm border border-border bg-bg px-2 py-1 font-mono text-text" autocomplete="off" spellcheck="false"
                [value]="secret()" (input)="secret.set($any($event.target).value)" />
            </label>
          }
          <label class="flex flex-col gap-1 text-ui text-text">New password
            <input type="password" name="new-password" class="rounded-sm border border-border bg-bg px-2 py-1 text-text" autocomplete="new-password" aria-describedby="pw-hint"
              [value]="password()" (input)="password.set($any($event.target).value)" />
          </label>
          <p id="pw-hint" class="text-ui-sm" [class.text-text-muted]="longEnough()" [class.text-warning]="!longEnough()">{{ passwordHint }}</p>
          <div aria-live="assertive" role="alert" data-testid="error">
            @if (error()) { <p class="text-ui text-error">{{ error() }}@if (countdown.seconds() > 0) { Try again in {{ countdown.seconds() }} s. }</p> }
          </div>
          <div class="flex items-center gap-4">
            <button type="submit" data-testid="submit" class="rounded-sm bg-accent px-3 py-1 text-ui font-semibold text-on-accent disabled:opacity-50" [disabled]="!canSubmit()">
              {{ busy() ? 'Working…' : 'Set new password' }}
            </button>
            <a routerLink="/hub/sign-in" class="text-ui text-accent underline">Back to sign in</a>
          </div>
        </form>
      }
    </app-hub-card>
  `,
})
export class HubRecoverPage {
  private readonly admin = inject(HUB_ADMIN);
  private readonly router = inject(Router);

  protected readonly passwordHint = PASSWORD_HINT;
  protected readonly countdown = new RetryCountdown();
  protected readonly mode = signal<Mode>('code');
  protected readonly secret = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly warning = signal('');
  protected readonly newCodes = signal<readonly string[]>([]);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.newCodes.set([]);
      this.password.set('');
      this.secret.set('');
    });
  }

  protected setMode(mode: Mode): void {
    if (mode === this.mode()) return;
    this.mode.set(mode);
    this.secret.set('');
    this.error.set('');
  }

  protected longEnough(): boolean {
    return this.password().length >= MIN_PASSWORD_LENGTH;
  }

  protected canSubmit(): boolean {
    return !this.busy() && this.countdown.seconds() === 0 && this.secret().trim() !== '' && this.longEnough();
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.mode() === 'code') {
        const session = await this.admin.recover(this.secret().trim().toUpperCase(), this.password());
        this.password.set('');
        this.secret.set('');
        const left = session.owner.remainingRecoveryCodes;
        if (left <= 2) {
          this.warning.set(left === 0
            ? 'You are signed in, but you have no recovery codes left. Generate new ones in Settings > Security & Sessions.'
            : `You are signed in. Only ${left} recovery ${left === 1 ? 'code is' : 'codes are'} left; generate new ones in Settings > Security & Sessions.`);
        } else {
          await this.router.navigateByUrl('/');
        }
      } else {
        const result = await this.admin.ownerReset(this.secret().trim(), this.password());
        this.secret.set('');
        this.newCodes.set(result.recoveryCodes);
      }
    } catch (e) {
      const d = describeHubError(e, {
        unauthorized: this.mode() === 'code' ? 'That recovery code is not valid or was already used.' : 'That reset token is not valid or has expired.',
      });
      this.error.set(d.message);
      this.countdown.start(d.retryAfterMs);
    } finally {
      this.busy.set(false);
    }
  }

  protected async finishReset(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.admin.signIn(this.password());
      this.newCodes.set([]);
      this.password.set('');
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(describeHubError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected goHome(): void {
    void this.router.navigateByUrl('/');
  }
}
