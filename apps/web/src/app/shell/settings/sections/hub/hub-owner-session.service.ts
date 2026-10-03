import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import type { HubOwnerStatus } from '../../../../core/hub/hub-admin.port';
import { HubWebSignOut } from '../../../../core/hub-web/hub-web-sign-out.service';
import { PlatformService } from '../../../../core/platform/platform.service';
import { OWNER_EXPIRED_CODES, hubErrorText } from './hub-format';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';

/**
 * The environment-owner session as the Settings sections see it. On desktop the bearer lives in the main process
 * and this only mirrors `ownerStatus()`; on the Hub-served web build it mirrors the cookie session. Sections report
 * `owner-session-expired` failures through `noteError` so every gate falls back to the sign-in form together.
 */
@Injectable({ providedIn: 'root' })
export class HubOwnerSession {
  private readonly hub = inject(HUB_ADMIN);
  private readonly platform = inject(PlatformService);
  private readonly router = inject(Router);
  private readonly webSignOut = inject(HubWebSignOut);

  readonly owner = signal<HubOwnerStatus | null>(null);
  readonly checked = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly signedIn = computed(() => this.owner()?.signedIn === true);

  async refresh(): Promise<void> {
    try {
      this.owner.set(await this.hub.ownerStatus());
      this.error.set(null);
    } catch (error) {
      this.owner.set({ signedIn: false, ownerDisplayName: null, expiresAt: null });
      // Not being enrolled yet is an ordinary "signed out"; anything else is worth saying.
      this.error.set(error instanceof HubAdminError && error.code === 'not-enrolled' ? null : hubErrorText(error));
    } finally {
      this.checked.set(true);
    }
  }

  async signIn(password: string): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.owner.set(await this.hub.ownerSignIn(password));
      return true;
    } catch (error) {
      this.error.set(hubErrorText(error, 'Sign-in failed.'));
      return false;
    } finally {
      this.busy.set(false);
      this.checked.set(true);
    }
  }

  async signOut(): Promise<void> {
    this.busy.set(true);
    let signedOut = false;
    try {
      if (this.platform.hostKind === 'hub-web') await this.hub.signOut();
      else await this.hub.ownerSignOut();
      signedOut = true;
    } catch (error) {
      this.error.set(hubErrorText(error, 'Sign-out failed.'));
    } finally {
      this.owner.set({ signedIn: false, ownerDisplayName: null, expiresAt: null });
      this.busy.set(false);
    }
    if (this.platform.hostKind !== 'hub-web') return;
    // Only an accepted sign-out wipes this origin (PD-053); a failed one just returns to the sign-in page.
    if (signedOut) await this.webSignOut.completeSignOut();
    else await this.router.navigateByUrl('/hub/sign-in');
  }

  /** For code that signed the owner out itself (e.g. the Security section's "Sign out"): drop every gate back to the form. */
  markSignedOut(): void {
    this.owner.set({ signedIn: false, ownerDisplayName: null, expiresAt: null });
  }

  /** Returns true (and drops back to the sign-in gate) when the failure means the owner session is gone. */
  noteError(error: unknown, options: { unauthorizedMeansExpired?: boolean } = {}): boolean {
    if (!(error instanceof HubAdminError)) return false;
    const gone = OWNER_EXPIRED_CODES.includes(error.code) || (options.unauthorizedMeansExpired === true && error.code === 'unauthorized');
    if (!gone) return false;
    this.owner.set({ signedIn: false, ownerDisplayName: null, expiresAt: null });
    this.error.set('Your owner session expired. Sign in again.');
    return true;
  }
}
