import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { OidcAccount } from '@dude/contracts/hub';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { fakeHubAdmin, settle } from '../../../hub/fake-hub-admin.spec-helper';
import { GoogleAccountsPanel } from './google-accounts-panel';

/**
 * Destructive-Action Contract for unlinking a Google account (Milestone 842): "Unlink" only PREVIEWS until the explicit Confirm, which applies
 * once with the single-use token the preview returned. Cancel discards the preview. The last linked account has no Unlink at all (the Hub
 * refuses it as well), and neither step is taken by rendering the panel.
 */
const A: OidcAccount = { id: 'acc_a', provider: 'google', email: 'a@example.com', linkedAt: '2026-10-27T10:00:00.000Z', lastUsedAt: null };
const B: OidcAccount = { id: 'acc_b', provider: 'google', email: 'b@example.com', linkedAt: '2026-10-27T11:00:00.000Z', lastUsedAt: null };

async function setup(accounts: OidcAccount[] = [A, B]) {
  const admin = fakeHubAdmin();
  admin.oidcStatus.mockResolvedValue({ configured: true, enabled: true });
  admin.listOidcAccounts.mockResolvedValue({ accounts });
  admin.unlinkOidcPreview.mockResolvedValue({
    confirmToken: 'unlink-token', expiresAt: '2099-01-01T00:00:00Z', consequenceClass: ['secret-management'],
    summary: { action: 'oidc.unlink', accountId: 'acc_b', email: 'b@example.com', remainingAccounts: 1 },
  });
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: HUB_ADMIN, useValue: admin }, { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } }] });
  const fixture = TestBed.createComponent(GoogleAccountsPanel);
  const el = fixture.nativeElement as HTMLElement;
  await settle(fixture);
  return { fixture, el, admin };
}

const byId = (el: HTMLElement, id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);
const unlinkButtons = (el: HTMLElement): HTMLButtonElement[] => Array.from(el.querySelectorAll('[data-testid="google-unlink"]'));

describe('Google accounts unlink confirmation boundary', () => {
  it('rendering the panel previews and applies nothing', async () => {
    const { admin } = await setup();
    expect(admin.unlinkOidcPreview).not.toHaveBeenCalled();
    expect(admin.unlinkOidc).not.toHaveBeenCalled();
    expect(admin.oidcLinkStart).not.toHaveBeenCalled();
  });

  it('Unlink only previews and applies nothing until Confirm', async () => {
    const { fixture, el, admin } = await setup();
    unlinkButtons(el)[1]!.click();
    await settle(fixture);
    expect(admin.unlinkOidcPreview).toHaveBeenCalledExactlyOnceWith('acc_b');
    expect(admin.unlinkOidc).not.toHaveBeenCalled();
    expect(byId(el, 'google-unlink-confirm')?.textContent).toContain('b@example.com');
    expect(byId(el, 'google-unlink-confirm')?.textContent).toContain('password still works');
  });

  it('Confirm applies exactly once with the preview token, then the list reloads', async () => {
    const { fixture, el, admin } = await setup();
    unlinkButtons(el)[1]!.click();
    await settle(fixture);
    const apply = byId(el, 'google-unlink-apply') as HTMLButtonElement;
    apply.click();
    byId(el, 'google-unlink-apply')?.dispatchEvent(new MouseEvent('click'));
    await settle(fixture);
    expect(admin.unlinkOidc).toHaveBeenCalledExactlyOnceWith('acc_b', 'unlink-token');
    expect(byId(el, 'google-unlink-confirm')).toBeNull();
    expect(admin.listOidcAccounts).toHaveBeenCalledTimes(2);
  });

  it('Cancel discards the preview without applying', async () => {
    const { fixture, el, admin } = await setup();
    unlinkButtons(el)[0]!.click();
    await settle(fixture);
    (byId(el, 'google-unlink-cancel') as HTMLButtonElement).click();
    await settle(fixture);
    expect(admin.unlinkOidc).not.toHaveBeenCalled();
    expect(byId(el, 'google-unlink-confirm')).toBeNull();
  });

  it('the last linked account offers no Unlink, so neither step can be reached for it', async () => {
    const { el, admin } = await setup([A]);
    expect(unlinkButtons(el)).toHaveLength(0);
    expect(admin.unlinkOidcPreview).not.toHaveBeenCalled();
  });

  it('an expired confirmation is reported and nothing is retried automatically', async () => {
    const { fixture, el, admin } = await setup();
    admin.unlinkOidc.mockRejectedValueOnce(new HubAdminError('forbidden', 'x'));
    unlinkButtons(el)[1]!.click();
    await settle(fixture);
    (byId(el, 'google-unlink-apply') as HTMLButtonElement).click();
    await settle(fixture);
    expect(byId(el, 'google-error')?.textContent).toContain('confirmation expired');
    expect(admin.unlinkOidc).toHaveBeenCalledTimes(1);
  });

  it('a last-account refusal from the Hub at the preview is explained', async () => {
    const { fixture, el, admin } = await setup();
    admin.unlinkOidcPreview.mockRejectedValueOnce(new HubAdminError('conflict', 'x'));
    unlinkButtons(el)[0]!.click();
    await settle(fixture);
    expect(byId(el, 'google-error')?.textContent).toContain('last linked');
    expect(byId(el, 'google-unlink-confirm')).toBeNull();
  });
});
