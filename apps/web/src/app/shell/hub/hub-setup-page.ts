import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { Router, RouterLink } from '@angular/router';
import { HUB_ADMIN } from '../../core/hub/hub-admin.token';
import { HubCard } from './hub-card';
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, RetryCountdown, describeHubError } from './hub-utils';
import { RecoveryCodesDisplay } from './recovery-codes-display';

const SETUP_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Reads `#token=...` once and removes the whole fragment from the address bar so it cannot be copied or bookmarked. */
function takeFragmentToken(): string {
  const hash = globalThis.location?.hash ?? '';
  if (hash === '') return '';
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? '';
  globalThis.history?.replaceState(globalThis.history.state, '', `${globalThis.location.pathname}${globalThis.location.search}`);
  return token.trim();
}

/** `/hub/setup`: first-run bootstrap of the Hub's owner. The setup token is single-use and never stored. */
@Component({
  selector: 'app-hub-setup-page',
  imports: [HubCard, RecoveryCodesDisplay, RouterLink],
  template: `
    <app-hub-card heading="Set up this Hub" [subtitle]="step() === 'form' ? 'Create the owner account for this environment. This only happens once.' : ''">
      @if (step() === 'form') {
        <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); submit()" autocomplete="off">
          <label class="flex flex-col gap-1 text-ui text-text">Setup token
            <input type="text" name="setup-token" class="rounded-sm border border-border bg-bg px-2 py-1 font-mono text-text" autocomplete="off" spellcheck="false"
              aria-describedby="token-hint" [value]="token()" (input)="token.set($any($event.target).value)" />
          </label>
          <p id="token-hint" class="text-ui-sm text-text-muted">
            Printed by the Hub on first start and kept in its <code>config/setup-token</code> file. Opening the setup link fills this in.
          </p>
          <label class="flex flex-col gap-1 text-ui text-text">Environment name
            <input type="text" name="environment-name" maxlength="64" class="rounded-sm border border-border bg-bg px-2 py-1 text-text" autocomplete="organization"
              [value]="environmentName()" (input)="environmentName.set($any($event.target).value)" />
          </label>
          <label class="flex flex-col gap-1 text-ui text-text">Owner display name
            <input type="text" name="owner-name" maxlength="64" class="rounded-sm border border-border bg-bg px-2 py-1 text-text" autocomplete="name"
              [value]="ownerName()" (input)="ownerName.set($any($event.target).value)" />
          </label>
          <label class="flex flex-col gap-1 text-ui text-text">Password
            <input type="password" name="new-password" class="rounded-sm border border-border bg-bg px-2 py-1 text-text" autocomplete="new-password" aria-describedby="pw-hint"
              [value]="password()" (input)="password.set($any($event.target).value)" />
          </label>
          <p id="pw-hint" class="text-ui-sm" [class.text-text-muted]="passwordLongEnough()" [class.text-warning]="!passwordLongEnough()">{{ passwordHint }}</p>
          <label class="flex flex-col gap-1 text-ui text-text">Confirm password
            <input type="password" name="confirm-password" class="rounded-sm border border-border bg-bg px-2 py-1 text-text" autocomplete="new-password"
              [value]="confirm()" (input)="confirm.set($any($event.target).value)" />
          </label>
          @if (confirm() !== '' && !passwordsMatch()) { <p class="text-ui-sm text-warning">The passwords do not match.</p> }
          <div aria-live="assertive" role="alert" data-testid="error">
            @if (error()) {
              <p class="text-ui text-error">{{ error() }}@if (countdown.seconds() > 0) { Try again in {{ countdown.seconds() }} s. }</p>
              @if (alreadySetUp()) { <a routerLink="/hub/sign-in" class="text-ui text-accent underline">Go to sign in</a> }
            }
          </div>
          <div>
            <button type="submit" data-testid="submit" class="rounded-sm bg-accent px-3 py-1 text-ui font-semibold text-on-accent disabled:opacity-50" [disabled]="!canSubmit()">
              {{ busy() ? 'Setting up…' : 'Create owner' }}
            </button>
          </div>
        </form>
      } @else {
        <app-recovery-codes-display [codes]="codes()" continueLabel="Continue to the Hub" [busy]="busy()" (done)="finish()" />
        <div aria-live="assertive" role="alert" data-testid="error">
          @if (error()) {
            <p class="text-ui text-error">{{ error() }}</p>
            @if (alreadySetUp()) { <a routerLink="/hub/sign-in" class="text-ui text-accent underline">Go to sign in</a> }
          }
        </div>
      }
    </app-hub-card>
  `,
})
export class HubSetupPage {
  private readonly admin = inject(HUB_ADMIN);
  private readonly router = inject(Router);

  protected readonly passwordHint = PASSWORD_HINT;
  protected readonly countdown = new RetryCountdown();
  protected readonly step = signal<'form' | 'codes'>('form');
  protected readonly token = signal(takeFragmentToken());
  protected readonly environmentName = signal('');
  protected readonly ownerName = signal('');
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly codes = signal<readonly string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly alreadySetUp = signal(false);

  constructor() {
    // A hash-only navigation (`/hub/setup#token=...` while already on /hub/setup) does not recreate the page.
    if (typeof globalThis.addEventListener === 'function') {
      fromEvent(globalThis, 'hashchange').pipe(takeUntilDestroyed()).subscribe(() => {
        const token = takeFragmentToken();
        if (token !== '') this.token.set(token);
      });
    }
    // Codes and the password are dropped with the component; nothing is written to storage or the console.
    inject(DestroyRef).onDestroy(() => {
      this.codes.set([]);
      this.password.set('');
      this.confirm.set('');
    });
  }

  protected passwordLongEnough(): boolean {
    return this.password().length >= MIN_PASSWORD_LENGTH;
  }

  protected passwordsMatch(): boolean {
    return this.password() === this.confirm();
  }

  protected canSubmit(): boolean {
    return !this.busy() && this.countdown.seconds() === 0 && SETUP_TOKEN.test(this.token().trim()) && this.environmentName().trim() !== '' &&
      this.ownerName().trim() !== '' && this.passwordLongEnough() && this.passwordsMatch();
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set('');
    this.alreadySetUp.set(false);
    try {
      const result = await this.admin.bootstrap({
        setupToken: this.token().trim(),
        environmentName: this.environmentName().trim(),
        ownerDisplayName: this.ownerName().trim(),
        password: this.password(),
      });
      this.token.set('');
      this.codes.set(result.recoveryCodes);
      this.step.set('codes');
    } catch (e) {
      const d = describeHubError(e, {
        unauthorized: 'That setup token is not valid. Check it and try again.',
        conflict: 'This Hub is already set up.',
      });
      this.error.set(d.message);
      this.alreadySetUp.set(d.code === 'conflict');
      this.countdown.start(d.retryAfterMs);
    } finally {
      this.busy.set(false);
    }
  }

  protected async finish(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.admin.signIn(this.password());
      this.codes.set([]);
      this.password.set('');
      this.confirm.set('');
      await this.router.navigate(['/settings/devices'], { queryParams: { hint: 'pair-desktop' } });
    } catch (e) {
      this.error.set(`${describeHubError(e).message} Your owner account exists; sign in to continue.`);
      this.alreadySetUp.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
