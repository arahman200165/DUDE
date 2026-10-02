import { TestBed } from '@angular/core/testing';
import { HubAdminError, type HubAdminPort } from '../../../core/hub/hub-admin.port';
import { EnvironmentSettings } from './environment-settings';
import { ENROLLED_STATUS, buttonWithText, configureHubTest, createTestPort, settle } from './hub/testing/hub-test-port';

/**
 * Destructive-Action Contract for Settings > Environment & Hub > Disconnect: viewing the page or clicking
 * Disconnect only explains; only the explicit Confirm calls unenroll, once, and a local-only disconnect
 * (which leaves the Hub listing the device) needs its own separate confirmation.
 */
async function setup(unenroll?: HubAdminPort['unenroll']) {
  const { port } = createTestPort({ status: async () => ENROLLED_STATUS, ...(unenroll ? { unenroll } : {}) });
  configureHubTest(port);
  const fixture = TestBed.createComponent(EnvironmentSettings);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, port };
}
const panel = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const escape = (el: HTMLElement) => el.querySelector('[data-testid="disconnect"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('Environment & Hub disconnect confirmation boundary', () => {
  afterEach(() => document.body.replaceChildren());

  it('rendering the section never unenrolls', async () => {
    const { port } = await setup();
    expect(port.unenroll).not.toHaveBeenCalled();
  });

  it('the first click only shows what happens', async () => {
    const { fixture, el, port } = await setup();
    buttonWithText(el, 'Disconnect from this Hub…').click();
    await settle(fixture);
    expect(port.unenroll).not.toHaveBeenCalled();
    const confirm = panel(el, 'disconnect-confirm')!;
    expect(confirm.getAttribute('role')).toBe('alertdialog');
    expect(confirm.textContent).toContain('The Hub will be told');
    expect(confirm.textContent).toContain('Local data stays');
    expect(confirm.textContent).toContain('pair this device again');
    expect(document.activeElement).toBe(buttonWithText(el, 'Confirm disconnect'));
  });

  it('Confirm calls unenroll exactly once, not forced', async () => {
    const { fixture, el, port } = await setup();
    buttonWithText(el, 'Disconnect from this Hub…').click();
    await settle(fixture);
    buttonWithText(el, 'Confirm disconnect').click();
    await settle(fixture);
    expect(port.unenroll).toHaveBeenCalledExactlyOnceWith(false);
    expect(panel(el, 'disconnect-confirm')).toBeNull();
    expect(panel(el, 'disconnect-done')!.textContent).toContain('The Hub was told');
  });

  it('Cancel and Escape reset without unenrolling', async () => {
    const { fixture, el, port } = await setup();
    buttonWithText(el, 'Disconnect from this Hub…').click();
    await settle(fixture);
    buttonWithText(el, 'Cancel').click();
    await settle(fixture);
    expect(panel(el, 'disconnect-confirm')).toBeNull();

    buttonWithText(el, 'Disconnect from this Hub…').click();
    await settle(fixture);
    escape(el);
    await settle(fixture);
    expect(panel(el, 'disconnect-confirm')).toBeNull();
    expect(buttonWithText(el, 'Disconnect from this Hub…')).toBeDefined();
    expect(port.unenroll).not.toHaveBeenCalled();
  });

  it('an unreachable Hub offers local-only, which needs its own confirm', async () => {
    const unenroll = vi.fn(async (force?: boolean) => {
      if (force !== true) throw new HubAdminError('hub-unreachable', 'down');
      return { unenrolled: true, hubNotified: false };
    });
    const { fixture, el, port } = await setup(unenroll);
    buttonWithText(el, 'Disconnect from this Hub…').click();
    await settle(fixture);
    buttonWithText(el, 'Confirm disconnect').click();
    await settle(fixture);
    expect(port.unenroll).toHaveBeenCalledTimes(1);
    expect(port.unenroll).toHaveBeenLastCalledWith(false);
    expect(panel(el, 'disconnect-unreachable')).not.toBeNull();

    buttonWithText(el, 'Disconnect locally only…').click();
    await settle(fixture);
    expect(port.unenroll).toHaveBeenCalledTimes(1); // the offer alone does not force
    expect(panel(el, 'disconnect-force-confirm')!.textContent).toContain('keeps listing this device until the owner revokes it');

    buttonWithText(el, 'Confirm disconnect locally only').click();
    await settle(fixture);
    expect(port.unenroll).toHaveBeenCalledTimes(2);
    expect(port.unenroll).toHaveBeenLastCalledWith(true);
    expect(panel(el, 'disconnect-done')!.textContent).toContain('on this device only');
  });

  it('Escape from the forced step also resets', async () => {
    const unenroll = vi.fn(async () => {
      throw new HubAdminError('hub-unreachable', 'down');
    });
    const { fixture, el, port } = await setup(unenroll);
    buttonWithText(el, 'Disconnect from this Hub…').click();
    await settle(fixture);
    buttonWithText(el, 'Confirm disconnect').click();
    await settle(fixture);
    buttonWithText(el, 'Disconnect locally only…').click();
    await settle(fixture);
    escape(el);
    await settle(fixture);
    expect(panel(el, 'disconnect-force-confirm')).toBeNull();
    expect(port.unenroll).toHaveBeenCalledTimes(1);
  });
});
