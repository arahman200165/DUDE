import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HubAdminError } from '../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../core/hub/hub-admin.token';
import { PlatformService } from '../../../core/platform/platform.service';
import { buttonWithText, fakeHubAdmin, settle } from '../../hub/fake-hub-admin.spec-helper';
import { SecuritySettings } from './security-settings';

/**
 * Destructive-Action Contract for Settings > Security & Sessions: "Sign out all other sessions" and
 * "Generate new recovery codes" only PREVIEW until the explicit Confirm, which applies once with the
 * token its preview returned. Cancel discards the preview.
 */

async function setup() {
  const admin = fakeHubAdmin();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: HUB_ADMIN, useValue: admin }, { provide: PlatformService, useValue: { hostKind: 'desktop' } }],
  });
  const fixture = TestBed.createComponent(SecuritySettings);
  const el = fixture.nativeElement as HTMLElement;
  await settle(fixture);
  return { fixture, el, admin };
}

const byId = (el: HTMLElement, id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);

describe('Security & Sessions confirmation boundary', () => {
  it('rendering the section previews and applies nothing', async () => {
    const { admin } = await setup();
    expect(admin.revokeAllPreview).not.toHaveBeenCalled();
    expect(admin.revokeAll).not.toHaveBeenCalled();
    expect(admin.recoveryCodesPreview).not.toHaveBeenCalled();
    expect(admin.regenerateRecoveryCodes).not.toHaveBeenCalled();
  });

  describe('sign out all other sessions', () => {
    it('only previews, shows the count, and applies nothing until Confirm', async () => {
      const { fixture, el, admin } = await setup();
      (byId(el, 'revoke-all') as HTMLButtonElement).click();
      await settle(fixture);
      expect(admin.revokeAllPreview).toHaveBeenCalledTimes(1);
      expect(admin.revokeAll).not.toHaveBeenCalled();
      expect(byId(el, 'revoke-all-confirm')?.textContent).toContain('signs out 2 other sessions');
    });

    it('Confirm applies exactly once with the preview token', async () => {
      const { fixture, el, admin } = await setup();
      (byId(el, 'revoke-all') as HTMLButtonElement).click();
      await settle(fixture);
      (byId(el, 'revoke-all-apply') as HTMLButtonElement).click();
      (byId(el, 'revoke-all-apply') as HTMLButtonElement | null)?.click();
      await settle(fixture);
      expect(admin.revokeAll).toHaveBeenCalledTimes(1);
      expect(admin.revokeAll).toHaveBeenCalledWith('tok');
      expect(byId(el, 'revoke-all-confirm')).toBeNull();
    });

    it('Cancel discards the preview without applying', async () => {
      const { fixture, el, admin } = await setup();
      (byId(el, 'revoke-all') as HTMLButtonElement).click();
      await settle(fixture);
      (byId(el, 'revoke-all-cancel') as HTMLButtonElement).click();
      await settle(fixture);
      expect(admin.revokeAll).not.toHaveBeenCalled();
      expect(byId(el, 'revoke-all-confirm')).toBeNull();
      expect(byId(el, 'revoke-all')).not.toBeNull();
    });

    it('a 409 on Confirm resets to review with a clear message', async () => {
      const { fixture, el, admin } = await setup();
      admin.revokeAll.mockRejectedValueOnce(new HubAdminError('conflict', 'changed'));
      (byId(el, 'revoke-all') as HTMLButtonElement).click();
      await settle(fixture);
      (byId(el, 'revoke-all-apply') as HTMLButtonElement).click();
      await settle(fixture);
      expect(byId(el, 'revoke-all-error')?.textContent).toContain('Sessions changed; review again.');
      expect(byId(el, 'revoke-all-confirm')).toBeNull();
    });
  });

  describe('recovery code regeneration', () => {
    it('only previews and explains that old codes stop working', async () => {
      const { fixture, el, admin } = await setup();
      (byId(el, 'codes-generate') as HTMLButtonElement).click();
      await settle(fixture);
      expect(admin.recoveryCodesPreview).toHaveBeenCalledTimes(1);
      expect(admin.regenerateRecoveryCodes).not.toHaveBeenCalled();
      expect(byId(el, 'codes-confirm')?.textContent).toContain('stop working');
      expect(el.querySelector('[data-testid="recovery-code"]')).toBeNull();
    });

    it('Confirm applies once with the token, then shows the codes behind the saved checkbox', async () => {
      const { fixture, el, admin } = await setup();
      (byId(el, 'codes-generate') as HTMLButtonElement).click();
      await settle(fixture);
      (byId(el, 'codes-apply') as HTMLButtonElement).click();
      await settle(fixture);
      expect(admin.regenerateRecoveryCodes).toHaveBeenCalledTimes(1);
      expect(admin.regenerateRecoveryCodes).toHaveBeenCalledWith('tok');
      expect(el.querySelectorAll('[data-testid="recovery-code"]').length).toBe(10);
      const done = buttonWithText(el, 'Done');
      expect(done.disabled).toBe(true);
      const box = byId(el, 'saved-checkbox') as HTMLInputElement;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(done.disabled).toBe(false);
      done.click();
      await settle(fixture);
      expect(el.querySelector('[data-testid="recovery-code"]')).toBeNull();
      expect(byId(el, 'codes-generate')).not.toBeNull();
    });

    it('Cancel discards the preview without applying', async () => {
      const { fixture, el, admin } = await setup();
      (byId(el, 'codes-generate') as HTMLButtonElement).click();
      await settle(fixture);
      (byId(el, 'codes-cancel') as HTMLButtonElement).click();
      await settle(fixture);
      expect(admin.regenerateRecoveryCodes).not.toHaveBeenCalled();
      expect(byId(el, 'codes-confirm')).toBeNull();
    });
  });
});
