import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HUB_ADMIN } from '../../core/hub/hub-admin.token';
import { HUB_APP_ENTRY } from '../../core/hub/hub-app-entry';
import { HubCard } from './hub-card';
import { RetryCountdown, describeHubError, safeReturnUrl } from './hub-utils';

/** `/hub/sign-in`: the owner's password sign-in. `returnUrl` is honored only for same-app relative paths. */
@Component({
  selector: 'app-hub-sign-in-page',
  imports: [HubCard, RouterLink],
  template: `
    <app-hub-card heading="Sign in to this Hub" subtitle="Enter the owner password.">
      <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); submit()">
        <label class="flex flex-col gap-1 text-ui text-text">Password
          <input type="password" name="password" class="rounded-sm border border-border bg-bg px-2 py-1 text-text" autocomplete="current-password"
            [value]="password()" (input)="password.set($any($event.target).value)" />
        </label>
        <div aria-live="assertive" role="alert" data-testid="error">
          @if (error()) { <p class="text-ui text-error">{{ error() }}@if (countdown.seconds() > 0) { Try again in {{ countdown.seconds() }} s. }</p> }
        </div>
        <div class="flex items-center gap-4">
          <button type="submit" data-testid="submit" class="rounded-sm bg-accent px-3 py-1 text-ui font-semibold text-on-accent disabled:opacity-50"
            [disabled]="busy() || password() === '' || countdown.seconds() > 0">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
          <a routerLink="/hub/recover" class="text-ui text-accent underline">Forgot your password?</a>
        </div>
      </form>
    </app-hub-card>
  `,
})
export class HubSignInPage {
  private readonly admin = inject(HUB_ADMIN);
  private readonly router = inject(Router);
  private readonly enterApp = inject(HUB_APP_ENTRY);
  private readonly route = inject(ActivatedRoute);

  protected readonly countdown = new RetryCountdown();
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    void this.redirectIfNotBootstrapped();
  }

  private async redirectIfNotBootstrapped(): Promise<void> {
    try {
      const probe = await this.admin.probeLocal();
      if (probe.bootstrapped === false) await this.router.navigateByUrl('/hub/setup');
    } catch {
      // An unreachable Hub is reported when sign-in is attempted.
    }
  }

  protected async submit(): Promise<void> {
    if (this.busy() || this.password() === '') return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.admin.signIn(this.password());
      this.password.set('');
      await this.enterApp(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
    } catch (e) {
      const d = describeHubError(e, { unauthorized: 'That password is not correct.' });
      this.error.set(d.message);
      this.countdown.start(d.retryAfterMs);
      // Only a definitive wrong password clears the field; rate-limit, lock and network errors keep it so nothing is retyped.
      if (d.code === 'unauthorized') this.password.set('');
    } finally {
      this.busy.set(false);
    }
  }
}
