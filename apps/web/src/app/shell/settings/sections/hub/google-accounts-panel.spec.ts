import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import type { OidcAccount } from '@dude/contracts/hub';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { HUB_NAVIGATE_EXTERNAL } from '../../../hub/hub-utils';
import { fakeHubAdmin, settle } from '../../../hub/fake-hub-admin.spec-helper';
import { GOOGLE_LINK_RETURN_PATH, GoogleAccountsPanel } from './google-accounts-panel';

const ACCOUNT_A: OidcAccount = { id: 'acc_a', provider: 'google', email: 'a@example.com', linkedAt: '2026-10-27T10:00:00.000Z', lastUsedAt: null };
const ACCOUNT_B: OidcAccount = { id: 'acc_b', provider: 'google', email: 'b@example.com', linkedAt: '2026-10-27T11:00:00.000Z', lastUsedAt: '2026-10-27T12:00:00.000Z' };
const TOKEN = 'T'.repeat(43);

async function setup(options: { accounts?: OidcAccount[]; query?: Record<string, string>; configured?: boolean; prepare?: (admin: ReturnType<typeof fakeHubAdmin>) => void } = {}) {
  const admin = fakeHubAdmin();
  admin.oidcStatus.mockResolvedValue({ configured: options.configured ?? true, enabled: options.configured ?? true });
  admin.listOidcAccounts.mockResolvedValue({ accounts: options.accounts ?? [ACCOUNT_A] });
  options.prepare?.(admin);
  const navigateExternal = vi.fn(() => true);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]), { provide: HUB_ADMIN, useValue: admin }, { provide: HUB_NAVIGATE_EXTERNAL, useValue: navigateExternal },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(options.query ?? {}) } } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(GoogleAccountsPanel);
  const el = fixture.nativeElement as HTMLElement;
  await settle(fixture);
  return { fixture, el, admin, navigateExternal, navigate };
}

const byId = (el: HTMLElement, id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);
const click = (el: HTMLElement, id: string): void => { (byId(el, id) as HTMLButtonElement).click(); };

describe('GoogleAccountsPanel', () => {
  it('renders nothing where the host has no Google methods (desktop, standalone web)', async () => {
    const admin = fakeHubAdmin();
    delete (admin as { listOidcAccounts?: unknown }).listOidcAccounts;
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: HUB_ADMIN, useValue: admin }, { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } }] });
    const fixture = TestBed.createComponent(GoogleAccountsPanel);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-testid="google-accounts"]')).toBeNull();
  });

  it('lists the linked accounts by display address and withholds Unlink from the last one', async () => {
    const { el } = await setup();
    const rows = el.querySelectorAll('[data-testid="google-account-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('a@example.com');
    expect(rows[0]?.textContent).toContain('not used to sign in yet');
    expect(byId(el, 'google-unlink')).toBeNull();
    expect(byId(el, 'google-last-note')?.textContent).toContain('cannot be unlinked');
    expect(byId(el, 'google-link')?.textContent?.trim()).toBe('Link another Google account');
  });

  it('says so when Google sign-in is not configured on this Hub, with no Link button', async () => {
    const { el } = await setup({ configured: false, accounts: [] });
    expect(byId(el, 'google-not-configured')).not.toBeNull();
    expect(byId(el, 'google-link')).toBeNull();
  });

  it('with no account linked, offers to link the first one', async () => {
    const { el } = await setup({ accounts: [] });
    expect(byId(el, 'google-empty')).not.toBeNull();
    expect(byId(el, 'google-link')?.textContent?.trim()).toBe('Link a Google account');
  });

  it('Link leaves for Google with the Settings return path', async () => {
    const { fixture, el, admin, navigateExternal } = await setup();
    admin.oidcLinkStart.mockResolvedValue({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', expiresAt: 'x' });
    click(el, 'google-link');
    await settle(fixture);
    expect(admin.oidcLinkStart).toHaveBeenCalledWith(GOOGLE_LINK_RETURN_PATH);
    expect(navigateExternal).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });

  it('explains an unavailable Google and keeps the page working', async () => {
    const { fixture, el, admin, navigateExternal } = await setup();
    admin.oidcLinkStart.mockRejectedValue(new HubAdminError('oidc-unavailable', 'x'));
    click(el, 'google-link');
    await settle(fixture);
    expect(navigateExternal).not.toHaveBeenCalled();
    expect(byId(el, 'google-error')?.textContent).toContain('password still works');
    expect((byId(el, 'google-link') as HTMLButtonElement).disabled).toBe(false);
  });

  describe('the return from Google', () => {
    it('completes the link with the one-time token, removes it from the address and reloads the list', async () => {
      const { el, admin, navigate } = await setup({
        query: { oidcLink: TOKEN },
        prepare: (a) => {
          a.oidcLinkComplete.mockResolvedValue({ account: ACCOUNT_B });
          a.listOidcAccounts.mockResolvedValue({ accounts: [ACCOUNT_A, ACCOUNT_B] });
        },
      });
      expect(admin.oidcLinkComplete).toHaveBeenCalledExactlyOnceWith(TOKEN);
      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { oidcLink: null }, replaceUrl: true }));
      expect(byId(el, 'google-notice')?.textContent).toContain('Linked b@example.com');
      expect(el.querySelectorAll('[data-testid="google-account-row"]')).toHaveLength(2);
    });

    it.each([['conflict', 'already linked'], ['forbidden', 'expired']] as const)('maps a %s answer to a plain message', async (code, text) => {
      const { el } = await setup({ query: { oidcLink: TOKEN }, prepare: (a) => a.oidcLinkComplete.mockRejectedValue(new HubAdminError(code, 'x')) });
      expect(byId(el, 'google-error')?.textContent).toContain(text);
    });

    it.each(['failed', 'unavailable'])('shows the %s outcome without calling the Hub', async (value) => {
      const { el, admin } = await setup({ query: { oidcLink: value } });
      expect(admin.oidcLinkComplete).not.toHaveBeenCalled();
      expect(byId(el, 'google-error')).not.toBeNull();
    });
  });
});
