import { TestBed } from '@angular/core/testing';
import { DevicesSettings } from './devices-settings';
import { buttonWithText, configureHubTest, createTestPort, device, settle, typeInto } from './hub/testing/hub-test-port';

/**
 * Destructive-Action Contract for Settings > Devices > Revoke: opening the page and clicking Revoke only
 * previews. Only the explicit Confirm calls revokeDevice, once, with exactly the token its preview returned.
 */
const OTHER = device('0190aaaa-0000-7000-8000-000000000009', 'Work PC');
const SELF = device('0190aaaa-0000-7000-8000-000000000001', 'This PC', { current: true });

async function setup() {
  const test = createTestPort({ listDevices: async () => [SELF, OTHER] });
  configureHubTest(test.port, 'hub-web');
  test.port.ownerStatus.mockResolvedValue({ signedIn: true, ownerDisplayName: 'Owner', expiresAt: null });
  // The fake Hub only knows its own device, so give the preview/apply pair a token flow that accepts any id.
  const tokens = new Set<string>();
  test.port.revokeDevicePreview.mockImplementation(async (id: string) => {
    const confirmToken = `token-for-${id}`;
    tokens.add(confirmToken);
    return { confirmToken, expiresAt: '2099-01-01T00:00:00.000Z', summary: { action: 'revoke-device' } };
  });
  test.port.revokeDevice.mockImplementation(async (_id: string, token: string) => {
    if (!tokens.delete(token)) throw new Error('bad token');
    return { ok: true as const };
  });
  const fixture = TestBed.createComponent(DevicesSettings);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await settle(fixture);
  return { ...test, fixture, el: fixture.nativeElement as HTMLElement };
}
const revokeButton = (el: HTMLElement, name: string): HTMLButtonElement => el.querySelector(`button[aria-label="Revoke ${name}…"]`) as HTMLButtonElement;
const panel = (el: HTMLElement) => el.querySelector('[data-testid="revoke-confirm"]');
const escape = (el: HTMLElement) => el.querySelector('[data-testid="revoke-confirm"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('Devices revoke confirmation boundary', () => {
  afterEach(() => document.body.replaceChildren());

  it('rendering the section previews and revokes nothing', async () => {
    const { port } = await setup();
    expect(port.revokeDevicePreview).not.toHaveBeenCalled();
    expect(port.revokeDevice).not.toHaveBeenCalled();
  });

  it('Revoke only previews: it names the device and what ends, and focus moves to Confirm', async () => {
    const { fixture, el, port } = await setup();
    revokeButton(el, 'Work PC').click();
    await settle(fixture);
    expect(port.revokeDevicePreview).toHaveBeenCalledExactlyOnceWith(OTHER.deviceId);
    expect(port.revokeDevice).not.toHaveBeenCalled();
    expect(panel(el)!.getAttribute('role')).toBe('alertdialog');
    expect(panel(el)!.textContent).toContain('Work PC');
    expect(panel(el)!.textContent).toContain('cannot reconnect until it is paired again');
    expect(el.querySelector('[data-testid="revoke-current-warning"]')).toBeNull();
    expect(document.activeElement).toBe(buttonWithText(el, 'Confirm revoke Work PC'));
  });

  it('Confirm applies once with exactly the preview token', async () => {
    const { fixture, el, port } = await setup();
    revokeButton(el, 'Work PC').click();
    await settle(fixture);
    buttonWithText(el, 'Confirm revoke Work PC').click();
    await settle(fixture);
    expect(port.revokeDevice).toHaveBeenCalledExactlyOnceWith(OTHER.deviceId, `token-for-${OTHER.deviceId}`);
    expect(panel(el)).toBeNull();
    expect(el.querySelector('[data-testid="message"]')!.textContent).toContain('Work PC was revoked');
  });

  it('revoking this device shows the extra warning', async () => {
    const { fixture, el, port } = await setup();
    revokeButton(el, 'This PC').click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="revoke-current-warning"]')!.textContent).toContain('This is the device you are using');
    expect(port.revokeDevice).not.toHaveBeenCalled();
  });

  it('Cancel and Escape discard the preview without revoking', async () => {
    const { fixture, el, port } = await setup();
    revokeButton(el, 'Work PC').click();
    await settle(fixture);
    buttonWithText(el, 'Cancel').click();
    await settle(fixture);
    expect(panel(el)).toBeNull();

    revokeButton(el, 'Work PC').click();
    await settle(fixture);
    escape(el);
    await settle(fixture);
    expect(panel(el)).toBeNull();
    expect(port.revokeDevice).not.toHaveBeenCalled();
  });

  it('a failed apply drops the spent preview, so a retry must preview again', async () => {
    const { fixture, el, port } = await setup();
    revokeButton(el, 'Work PC').click();
    await settle(fixture);
    port.revokeDevice.mockRejectedValueOnce(new Error('The confirmation is missing, expired or already used.'));
    buttonWithText(el, 'Confirm revoke Work PC').click();
    await settle(fixture);
    expect(panel(el)).toBeNull();
    expect(el.querySelector('[data-testid="action-error"]')!.textContent).toContain('expired');
    expect(port.revokeDevice).toHaveBeenCalledTimes(1);
  });

  it('starting recovery trust never touches revoke', async () => {
    const { fixture, el, port } = await setup();
    buttonWithText(el, 'Trust for recovery').click();
    await settle(fixture);
    typeInto(el.querySelector('#trust-password') as HTMLInputElement, 'x');
    expect(port.revokeDevicePreview).not.toHaveBeenCalled();
    expect(port.revokeDevice).not.toHaveBeenCalled();
  });
});
