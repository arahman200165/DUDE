import { TestBed } from '@angular/core/testing';
import type { RootCertificatePreview } from '../../../core/hub/hub-admin.port';
import { HubAdminError } from '../../../core/hub/hub-admin.port';
import { EnvironmentSettings } from './environment-settings';
import { ENROLLED_STATUS, STANDALONE_STATUS, buttonWithText, configureHubTest, createTestPort, settle } from './hub/testing/hub-test-port';

/**
 * Settings > Environment & Hub > Hub web (PD-062). "Open Hub web in browser" is desktop + enrolled only. "Install root
 * certificate…" is shown only when main reports an installable local-CA root; viewing the section or clicking it only
 * previews (fingerprint), and only the explicit Confirm calls the installer, once, with that preview's token.
 */
const AVAILABLE: RootCertificatePreview = { available: true, fingerprint: 'AB:CD:EF', subject: 'CN=DUDE Hub Local CA', notAfter: 'Jan 1 2036', confirmToken: 'confirm-token-0000000001' };
const UNAVAILABLE: RootCertificatePreview = { available: false, reason: 'not-local-ca' };

async function mount(overrides: Parameters<typeof createTestPort>[0] = {}, host: 'desktop' | 'hub-web' = 'desktop') {
  const { port } = createTestPort({ status: async () => ENROLLED_STATUS, ...overrides });
  configureHubTest(port, host);
  const fixture = TestBed.createComponent(EnvironmentSettings);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, port };
}
const panel = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);

describe('Environment & Hub: Hub web actions', () => {
  afterEach(() => document.body.replaceChildren());

  describe('visibility', () => {
    it('desktop + enrolled shows Open Hub web, and no root install for a Hub without a local CA', async () => {
      const { el } = await mount({ rootCertificatePreview: async () => UNAVAILABLE });
      expect(buttonWithText(el, 'Open Hub web in browser')).toBeTruthy();
      expect(buttonWithText(el, 'Install root certificate…')).toBeUndefined();
    });

    it('shows the root install only when the host reports an installable local-CA root', async () => {
      const { el } = await mount({ rootCertificatePreview: async () => AVAILABLE });
      expect(buttonWithText(el, 'Install root certificate…')).toBeTruthy();
    });

    it('hides both when standalone', async () => {
      const { el, port } = await mount({ status: async () => STANDALONE_STATUS, rootCertificatePreview: async () => AVAILABLE });
      expect(panel(el, 'hub-web-actions')).toBeNull();
      expect(port.rootCertificatePreview).not.toHaveBeenCalled();
    });

    it('hides both on Hub web', async () => {
      const { el, port } = await mount({ rootCertificatePreview: async () => AVAILABLE }, 'hub-web');
      expect(panel(el, 'hub-web-actions')).toBeNull();
      expect(port.rootCertificatePreview).not.toHaveBeenCalled();
    });

    it('hides the root install when the preview fails (for example not Windows)', async () => {
      const { el } = await mount({ rootCertificatePreview: async () => { throw new HubAdminError('hub-unreachable', 'down'); } });
      expect(buttonWithText(el, 'Install root certificate…')).toBeUndefined();
      expect(buttonWithText(el, 'Open Hub web in browser')).toBeTruthy();
    });
  });

  it('Open Hub web asks the host with no arguments', async () => {
    const { el, fixture, port } = await mount({ rootCertificatePreview: async () => UNAVAILABLE });
    buttonWithText(el, 'Open Hub web in browser').click();
    await settle(fixture);
    expect(port.openWeb).toHaveBeenCalledExactlyOnceWith();
  });

  it('shows why Open Hub web failed', async () => {
    const { el, fixture } = await mount({ rootCertificatePreview: async () => UNAVAILABLE, openWeb: async () => { throw new HubAdminError('invalid-url', 'The Hub address is not an https address.'); } });
    buttonWithText(el, 'Open Hub web in browser').click();
    await settle(fixture);
    expect(panel(el, 'open-web-error')?.textContent).toContain('not an https address');
  });

  describe('install root certificate confirmation boundary', () => {
    it('rendering and the first click only preview: the installer is never called', async () => {
      const { el, fixture, port } = await mount({ rootCertificatePreview: async () => AVAILABLE });
      expect(port.installRootCertificate).not.toHaveBeenCalled();
      buttonWithText(el, 'Install root certificate…').click();
      await settle(fixture);
      expect(port.installRootCertificate).not.toHaveBeenCalled();
      const confirm = panel(el, 'root-cert-confirm')!;
      expect(confirm.getAttribute('role')).toBe('alertdialog');
      expect(panel(el, 'root-fingerprint')?.textContent).toBe('AB:CD:EF');
      expect(confirm.textContent).toContain('current user only');
      expect(confirm.textContent).toContain('Windows will show its own security prompt');
      expect(document.activeElement).toBe(buttonWithText(el, 'Install for this user'));
    });

    it('Cancel and Escape leave without installing', async () => {
      const { el, fixture, port } = await mount({ rootCertificatePreview: async () => AVAILABLE });
      buttonWithText(el, 'Install root certificate…').click();
      await settle(fixture);
      buttonWithText(el, 'Cancel').click();
      await settle(fixture);
      expect(panel(el, 'root-cert-confirm')).toBeNull();
      buttonWithText(el, 'Install root certificate…').click();
      await settle(fixture);
      panel(el, 'root-cert')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(fixture);
      expect(panel(el, 'root-cert-confirm')).toBeNull();
      expect(port.installRootCertificate).not.toHaveBeenCalled();
    });

    it('Confirm calls the installer exactly once with the token from the latest preview', async () => {
      let n = 0;
      const { el, fixture, port } = await mount({ rootCertificatePreview: async () => ({ ...AVAILABLE, confirmToken: `confirm-token-${++n}` }) as RootCertificatePreview });
      buttonWithText(el, 'Install root certificate…').click();
      await settle(fixture);
      buttonWithText(el, 'Install for this user').click();
      await settle(fixture);
      // preview #1 was the passive probe; #2 the user's click. Only the latter's token may be used.
      expect(port.installRootCertificate).toHaveBeenCalledExactlyOnceWith('confirm-token-2');
      expect(panel(el, 'root-cert-done')).not.toBeNull();
    });

    it('a failed install shows the reason and needs a fresh preview', async () => {
      const { el, fixture, port } = await mount({
        rootCertificatePreview: async () => AVAILABLE,
        installRootCertificate: async () => { throw new HubAdminError('install-failed', 'Windows did not add the certificate.'); },
      });
      buttonWithText(el, 'Install root certificate…').click();
      await settle(fixture);
      buttonWithText(el, 'Install for this user').click();
      await settle(fixture);
      expect(panel(el, 'root-cert-error')?.textContent).toContain('Windows did not add the certificate');
      expect(panel(el, 'root-cert-confirm')).toBeNull();
      expect(port.installRootCertificate).toHaveBeenCalledTimes(1);
    });
  });
});
