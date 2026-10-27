import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HUB_OIDC_SIGN_IN_QUERY } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../../core/hub/hub-admin.token';
import { HUB_APP_ENTRY } from '../../core/hub/hub-app-entry';
import { Disclosure } from '../../shared/components/disclosure/disclosure';
import { HubCard } from './hub-card';
import { HUB_NAVIGATE_EXTERNAL, RetryCountdown, describeHubError, safeReturnUrl } from './hub-utils';

/** What the Hub's callback may put in `?oidc=`; every refusal is the same generic text so nothing says whether an account exists. */
const GOOGLE_NOTICES: Readonly<Record<string, string>> = {
  failed: 'Google sign-in did not complete. Use your password instead.',
  unavailable: 'Google sign-in is not available right now. Use your password instead.',
  locked: 'Too many failed attempts from this address. Try again later, or use your password.',
};

/**
 * `/hub/sign-in`: Google sign-in (when the Hub offers it) and the owner's password. `returnUrl` is honored only for same-app relative paths.
 * Google is the primary action; the password and recovery sit under "Other ways to sign in" and are the only form when Google is off
 * or unreachable (PD-121: the password can never be disabled, so nothing here depends on Google).
 */
@Component({
  selector: 'app-hub-sign-in-page',
  imports: [HubCard, RouterLink, NgTemplateOutlet, Disclosure],
  template: `
    <app-hub-card heading="Sign in to this Hub" [subtitle]="google() ? 'Continue with Google, or use your password.' : 'Enter the owner password.'">
      @if (googleNotice()) {
        <p class="text-ui text-warning" role="status" data-testid="google-notice">{{ googleNotice() }}</p>
      }
      @if (google()) {
        <button type="button" data-testid="google-continue" class="rounded-sm bg-accent px-3 py-2 text-ui font-semibold text-on-accent disabled:opacity-50"
          [disabled]="googleBusy()" (click)="continueWithGoogle()">{{ googleBusy() ? 'Opening Google…' : 'Continue with Google' }}</button>
        <app-disclosure label="Other ways to sign in" [(open)]="otherOpen">
          <ng-container *ngTemplateOutlet="passwordForm" />
        </app-disclosure>
      } @else {
        <ng-container *ngTemplateOutlet="passwordForm" />
      }
    </app-hub-card>

    <ng-template #passwordForm>
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
    </ng-template>
  `,
})
export class HubSignInPage {
  private readonly admin = inject(HUB_ADMIN);
  private readonly router = inject(Router);
  private readonly enterApp = inject(HUB_APP_ENTRY);
  private readonly route = inject(ActivatedRoute);
  private readonly navigateExternal = inject(HUB_NAVIGATE_EXTERNAL);

  protected readonly countdown = new RetryCountdown();
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** Whether the Hub offers Google sign-in (`GET /auth/oidc/status`); false on any failure, so the password form is always there. */
  protected readonly google = signal(false);
  protected readonly googleBusy = signal(false);
  protected readonly googleNotice = signal('');
  /** The "Other ways to sign in" disclosure; it opens by itself when Google just failed so the password is in view. */
  protected readonly otherOpen = signal(false);

  constructor() {
    const result = this.route.snapshot.queryParamMap.get(HUB_OIDC_SIGN_IN_QUERY);
    if (result !== null && Object.hasOwn(GOOGLE_NOTICES, result)) {
      this.googleNotice.set(GOOGLE_NOTICES[result] ?? '');
      this.otherOpen.set(true);
    }
    void this.redirectIfNotBootstrapped();
    void this.loadGoogle();
  }

  private async redirectIfNotBootstrapped(): Promise<void> {
    try {
      const probe = await this.admin.probeLocal();
      if (probe.bootstrapped === false) await this.router.navigateByUrl('/hub/setup');
    } catch {
      // An unreachable Hub is reported when sign-in is attempted.
    }
  }

  private async loadGoogle(): Promise<void> {
    if (this.admin.oidcStatus === undefined) return;
    try {
      this.google.set((await this.admin.oidcStatus()).enabled);
    } catch {
      // Google is only ever an addition: the password form stays.
    }
  }

  protected async continueWithGoogle(): Promise<void> {
    if (this.googleBusy() || this.admin.oidcSignInStart === undefined) return;
    this.googleBusy.set(true);
    this.googleNotice.set('');
    try {
      const started = await this.admin.oidcSignInStart(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
      if (this.navigateExternal(started.authorizationUrl)) return; // the page is leaving; leave the button busy
      this.googleNotice.set(GOOGLE_NOTICES['unavailable'] ?? '');
      this.otherOpen.set(true);
    } catch (e) {
      const d = describeHubError(e, { 'oidc-unavailable': GOOGLE_NOTICES['unavailable'] ?? '' });
      this.googleNotice.set(d.message);
      this.otherOpen.set(true);
    }
    this.googleBusy.set(false);
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
