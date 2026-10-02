import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { HubOwnerSession } from './hub-owner-session.service';

/**
 * The owner gate shared by Devices and Security: the sign-in form while there is no owner session, and the
 * signed-in owner with a Sign out button once there is. Content that needs the owner renders next to it under
 * `@if (session.signedIn())` (projected content would be created even while signed out).
 */
@Component({
  selector: 'app-owner-gate',
  template: `
    @if (!session.checked()) {
      <p class="text-ui text-text-muted" role="status" data-testid="owner-checking">Checking the owner session…</p>
    } @else if (session.signedIn()) {
      <div class="flex flex-wrap items-center gap-2 text-ui" data-testid="owner-signed-in">
        <span class="text-text-muted">Signed in as the environment owner</span>
        <strong class="text-text" data-testid="owner-name">{{ session.owner()?.ownerDisplayName ?? 'Owner' }}</strong>
        <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated disabled:opacity-50" [disabled]="session.busy()" (click)="session.signOut()">Sign out</button>
      </div>
    } @else {
      <form class="flex flex-col gap-2" data-testid="owner-gate" (submit)="submit($event)">
        <h3 class="text-ui-sm font-semibold text-text">Sign in as the environment owner</h3>
        <p class="text-ui text-text-muted">Managing devices and sessions needs the owner password you chose when the Hub was set up. It is sent to the Hub only and never stored on this device.</p>
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-ui text-text-muted" for="owner-gate-password">Owner password</label>
          <input
            #password
            id="owner-gate-password"
            type="password"
            autocomplete="current-password"
            class="w-64 rounded-sm border border-border bg-panel px-2 py-0.5 text-text"
            [attr.aria-invalid]="session.error() ? 'true' : null"
            [value]="draft()"
            (input)="draft.set($any($event.target).value)"
          />
          <button type="submit" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" [disabled]="session.busy() || draft() === ''">Sign in</button>
        </div>
      </form>
    }
    <div aria-live="polite">
      @if (session.error(); as message) { <p class="mt-1 text-ui text-error" role="alert" data-testid="owner-error">{{ message }}</p> }
    </div>
  `,
})
export class OwnerGate {
  protected readonly session = inject(HubOwnerSession);
  protected readonly draft = signal('');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('password');

  constructor() {
    if (!this.session.checked()) void this.session.refresh();
    // After an expiry the form appears again: put the cursor back in it.
    effect(() => {
      if (this.session.error() !== null) this.field()?.nativeElement.focus();
    });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.draft() === '') return;
    const ok = await this.session.signIn(this.draft());
    this.draft.set('');
    if (!ok) this.field()?.nativeElement.focus();
  }
}
