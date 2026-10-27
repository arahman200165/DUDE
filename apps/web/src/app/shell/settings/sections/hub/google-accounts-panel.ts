import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HUB_OIDC_LINK_QUERY } from '@dude/contracts/hub';
import type { OidcAccount, OidcUnlinkPreview } from '@dude/contracts/hub';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { HUB_NAVIGATE_EXTERNAL, describeHubError } from '../../../hub/hub-utils';

/** Where Google's redirect lands after a link attempt (this Settings section). */
export const GOOGLE_LINK_RETURN_PATH = '/settings/security';

type UnlinkState =
  | { readonly type: 'idle' }
  | { readonly type: 'preview'; readonly account: OidcAccount; readonly preview: OidcUnlinkPreview }
  | { readonly type: 'working' };

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/**
 * Settings > Security & Sessions > Google accounts (32-SS1, Milestone 842, PD-121, PD-145). Hub-served web only: the port's Google methods are absent
 * elsewhere, so the panel renders nothing there. Lists the Google accounts that can sign in as the owner (display address only; identity is the
 * provider's stable subject, which the Hub never returns), links another one and unlinks one.
 *
 * - Linking is two legs. "Link a Google account" asks the Hub for the Google URL (the Hub asks for the password first: step-up) and leaves for
 *   Google; Google's redirect returns here with `?oidcLink=<one-time token>`, and this panel completes the link with the signed-in owner session.
 *   The token is removed from the address at once. Nothing is linked by an address match.
 * - Unlinking follows the Destructive-Action Contract: Unlink previews first (nothing changes), and only Confirm applies, with the single-use
 *   token the preview returned. The last linked account has no Unlink (the Hub refuses it too). Password and recovery sign-in are never affected.
 */
@Component({
  selector: 'app-google-accounts-panel',
  template: `
    @if (supported) {
      <section data-setting class="flex flex-col gap-2" data-testid="google-accounts" aria-labelledby="google-accounts-h">
        <h3 id="google-accounts-h" class="text-ui-sm font-semibold text-text">Google accounts</h3>
        @if (!configured()) {
          <p class="text-ui text-text-muted" data-testid="google-not-configured">
            Google sign-in is not set up on this Hub. The password is the way in; the Hub set-up wizard adds Google.
          </p>
        } @else {
          <p class="text-ui text-text-muted">
            These Google accounts can sign in as you. Your password and recovery codes keep working whatever happens here.
          </p>
        }
        @if (notice()) { <p class="text-ui text-success" role="status" data-testid="google-notice">{{ notice() }}</p> }
        @if (error()) { <p class="text-ui text-error" role="alert" data-testid="google-error">{{ error() }}</p> }
        @if (loaded() && accounts().length === 0 && configured()) {
          <p class="text-ui text-text-muted" data-testid="google-empty">No Google account is linked yet, so only the password signs you in.</p>
        }
        <ul class="flex flex-col gap-1">
          @for (a of accounts(); track a.id) {
            <li class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-border bg-panel px-2 py-1 text-ui" data-testid="google-account-row">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="text-text">{{ a.email ?? 'Google account' }}</span>
                <span class="text-ui-sm text-text-muted">
                  Linked {{ formatTime(a.linkedAt) }} · {{ a.lastUsedAt ? 'last used ' + formatTime(a.lastUsedAt) : 'not used to sign in yet' }}
                </span>
              </div>
              @if (accounts().length > 1) {
                <button type="button" class="rounded-sm border border-error px-2 py-0.5 text-ui text-error hover:bg-error/10 disabled:opacity-50" data-testid="google-unlink"
                  [attr.aria-label]="'Unlink ' + (a.email ?? 'Google account')" [disabled]="unlink().type !== 'idle'" (click)="startUnlink(a)">Unlink…</button>
              } @else {
                <span class="text-ui-sm text-text-muted" data-testid="google-last-note">The last linked account cannot be unlinked.</span>
              }
            </li>
          }
        </ul>
        @if (unlinkPreview(); as state) {
          <div role="alertdialog" aria-label="Confirm unlinking a Google account" class="flex flex-col gap-2 rounded-sm border border-error bg-panel p-2" data-testid="google-unlink-confirm">
            <p class="text-ui text-text">
              Unlink {{ state.account.email ?? 'this Google account' }}? It will no longer be able to sign in as you.
              {{ state.preview.summary.remainingAccounts }} linked {{ state.preview.summary.remainingAccounts === 1 ? 'account stays' : 'accounts stay' }}, and your password still works.
            </p>
            <div class="flex gap-2">
              <button type="button" class="rounded-sm border border-error px-3 py-1 text-ui font-semibold text-error disabled:opacity-50" data-testid="google-unlink-apply"
                [disabled]="unlink().type === 'working'" (click)="confirmUnlink()">Unlink account</button>
              <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text" data-testid="google-unlink-cancel" (click)="cancelUnlink()">Cancel</button>
            </div>
          </div>
        }
        @if (configured()) {
          <div>
            <button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" data-testid="google-link"
              [disabled]="linking() || unlink().type !== 'idle'" (click)="startLink()">{{ accounts().length === 0 ? 'Link a Google account' : 'Link another Google account' }}</button>
          </div>
        }
      </section>
    }
  `,
})
export class GoogleAccountsPanel {
  private readonly admin = inject(HUB_ADMIN);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navigateExternal = inject(HUB_NAVIGATE_EXTERNAL);

  /** Absent port methods (desktop, the standalone web build) hide the whole panel. */
  protected readonly supported = this.admin.listOidcAccounts !== undefined;
  protected readonly configured = signal(true);
  protected readonly accounts = signal<readonly OidcAccount[]>([]);
  protected readonly loaded = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly linking = signal(false);
  protected readonly unlink = signal<UnlinkState>({ type: 'idle' });
  protected readonly formatTime = formatTime;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.unlink.set({ type: 'idle' }); });
    if (this.supported) void this.init();
  }

  protected unlinkPreview(): Extract<UnlinkState, { type: 'preview' }> | null {
    const state = this.unlink();
    return state.type === 'preview' ? state : null;
  }

  private async init(): Promise<void> {
    try {
      this.configured.set((await this.admin.oidcStatus?.())?.configured ?? true);
    } catch {
      // The list below still says what is linked.
    }
    const returned = this.route.snapshot.queryParamMap.get(HUB_OIDC_LINK_QUERY);
    if (returned !== null) await this.finishLink(returned);
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      this.accounts.set((await this.admin.listOidcAccounts?.())?.accounts ?? []);
    } catch (e) {
      this.error.set(describeHubError(e).message);
    } finally {
      this.loaded.set(true);
    }
  }

  /** Leg two. The token leaves the address bar first (a reload must not replay it), then the owner session binds the verified account. */
  private async finishLink(value: string): Promise<void> {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [HUB_OIDC_LINK_QUERY]: null }, queryParamsHandling: 'merge', replaceUrl: true });
    if (value === 'failed' || value === 'unavailable') {
      this.error.set(value === 'unavailable' ? 'Google could not be reached, so nothing was linked. Try again later; your password still works.' : 'Google did not confirm that account, so nothing was linked. Try again.');
      return;
    }
    try {
      const linked = await this.admin.oidcLinkComplete?.(value);
      if (linked !== undefined) this.notice.set(`Linked ${linked.account.email ?? 'the Google account'}.`);
    } catch (e) {
      const code = e instanceof HubAdminError ? e.code : '';
      this.error.set(code === 'conflict' ? 'That Google account is already linked.'
        : code === 'forbidden' ? 'That link request expired or belongs to another session. Start again.'
          : describeHubError(e).message);
    }
  }

  protected async startLink(): Promise<void> {
    if (this.linking() || this.admin.oidcLinkStart === undefined) return;
    this.linking.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      // The Hub asks for the password (step-up) before it answers; the adapter prompts and retries.
      const started = await this.admin.oidcLinkStart(GOOGLE_LINK_RETURN_PATH);
      if (this.navigateExternal(started.authorizationUrl)) return;
      this.error.set('Google did not give a valid address. Try again.');
    } catch (e) {
      const code = e instanceof HubAdminError ? e.code : '';
      this.error.set(code === 'oidc-unavailable' ? 'Google sign-in is not available right now, so an account cannot be linked. Your password still works.'
        : code === 'step-up-required' ? 'Linking needs your password.' : describeHubError(e).message);
    }
    this.linking.set(false);
  }

  protected async startUnlink(account: OidcAccount): Promise<void> {
    this.error.set('');
    this.notice.set('');
    try {
      const preview = await this.admin.unlinkOidcPreview?.(account.id);
      if (preview !== undefined) this.unlink.set({ type: 'preview', account, preview });
    } catch (e) {
      const code = e instanceof HubAdminError ? e.code : '';
      this.error.set(code === 'conflict' ? 'The last linked Google account cannot be unlinked.' : describeHubError(e).message);
    }
  }

  protected cancelUnlink(): void {
    this.unlink.set({ type: 'idle' });
  }

  protected async confirmUnlink(): Promise<void> {
    const state = this.unlink();
    if (state.type !== 'preview') return;
    this.unlink.set({ type: 'working' });
    try {
      await this.admin.unlinkOidc?.(state.account.id, state.preview.confirmToken);
      this.notice.set(`Unlinked ${state.account.email ?? 'the Google account'}.`);
    } catch (e) {
      const code = e instanceof HubAdminError ? e.code : '';
      this.error.set(code === 'conflict' ? 'The linked accounts changed; review them and try again.'
        : code === 'forbidden' ? 'The confirmation expired. Review and try again.' : describeHubError(e).message);
    }
    this.unlink.set({ type: 'idle' });
    await this.load();
  }
}
