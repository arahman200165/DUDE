import { TestBed } from '@angular/core/testing';
import { HubAdminError, type HubAdminPort } from '../../../core/hub/hub-admin.port';
import type { FakeLocalHubScenario } from '../../../core/platform/testing/fake-hub';
import { EnvironmentSettings } from './environment-settings';
import { ENROLLED_STATUS, STANDALONE_STATUS, buttonWithText, configureHubTest, createTestPort, settle, typeInto } from './hub/testing/hub-test-port';

const PASSWORD = 'a long enough password';

async function mount(scenario: FakeLocalHubScenario, overrides: Partial<HubAdminPort> = {}) {
  const { port, bridge } = createTestPort(overrides, { localHub: scenario });
  configureHubTest(port);
  const fixture = TestBed.createComponent(EnvironmentSettings);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, port, bridge };
}
const byId = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const text = (el: HTMLElement, id: string) => byId(el, id)?.textContent?.trim() ?? '';
const field = (el: HTMLElement, id: string) => el.querySelector(`#${id}`) as HTMLInputElement;

async function fillSetup(fixture: Parameters<typeof settle>[0], el: HTMLElement, password = PASSWORD, confirm = PASSWORD) {
  buttonWithText(el, 'Set up a Hub on this computer…').click();
  await settle(fixture);
  expect(text(el, 'setup-intro')).toContain('Windows will ask for administrator permission once');
  expect(text(el, 'setup-intro')).toContain('Nothing leaves this computer');
  buttonWithText(el, 'Continue').click();
  await settle(fixture);
  typeInto(field(el, 'setup-environment'), 'Home lab');
  typeInto(field(el, 'setup-owner'), 'Sam');
  typeInto(field(el, 'setup-password'), password);
  typeInto(field(el, 'setup-confirm'), confirm);
  await settle(fixture);
}

async function acknowledgeCodes(fixture: Parameters<typeof settle>[0], el: HTMLElement) {
  const box = byId(el, 'saved-checkbox') as HTMLInputElement;
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  await settle(fixture);
  (byId(el, 'codes-continue') as HTMLButtonElement).click();
  await settle(fixture);
}

describe('Environment & Hub local Hub setup', () => {
  afterEach(() => document.body.replaceChildren());

  it('not installed shows how to add the Hub and no wizard', async () => {
    const { el } = await mount('not-installed');
    expect(byId(el, 'local-hub-setup')).toBeNull();
    expect(text(el, 'local-hub-not-installed')).toContain('Also install the DUDE Hub');
    expect(text(el, 'local-hub-not-installed')).toContain('DUDE-Hub-Setup.exe');
  });

  it('an already set up Hub offers neither setup nor update', async () => {
    const { el } = await mount('bootstrapped');
    expect(byId(el, 'local-hub-setup')).toBeNull();
    expect(byId(el, 'local-hub-update')).toBeNull();
    expect(byId(el, 'local-hub-not-installed')).toBeNull();
  });

  it('validates the form before enabling Create', async () => {
    const { fixture, el, port } = await mount('installed-unbootstrapped');
    await fillSetup(fixture, el, 'short', 'shorter');
    expect(buttonWithText(el, 'Create the Hub').disabled).toBe(true);
    typeInto(field(el, 'setup-password'), PASSWORD);
    await settle(fixture);
    expect(byId(el, 'setup-mismatch')).not.toBeNull();
    expect(buttonWithText(el, 'Create the Hub').disabled).toBe(true);
    typeInto(field(el, 'setup-confirm'), PASSWORD);
    await settle(fixture);
    expect(buttonWithText(el, 'Create the Hub').disabled).toBe(false);
    expect(port.setupLocalHub).not.toHaveBeenCalled();
  });

  it('sets up, gates the recovery codes behind the checkbox, then shows the owner signed in', async () => {
    const { fixture, el, port } = await mount('installed-unbootstrapped');
    await fillSetup(fixture, el);
    buttonWithText(el, 'Create the Hub').click();
    await settle(fixture);
    expect(port.setupLocalHub).toHaveBeenCalledExactlyOnceWith({ environmentName: 'Home lab', ownerDisplayName: 'Sam', password: PASSWORD });
    expect(el.querySelectorAll('[data-testid="recovery-code"]')).toHaveLength(10);
    expect((byId(el, 'codes-continue') as HTMLButtonElement).disabled).toBe(true);
    expect(byId(el, 'owner-signed-in')).toBeNull();
    await acknowledgeCodes(fixture, el);
    expect(byId(el, 'recovery-codes')).toBeNull();
    expect(text(el, 'setup-done')).toContain('signed in as the owner');
    expect(text(el, 'hub-state')).toBe('Online');
    expect(text(el, 'owner-name')).toBe('Owner');
  });

  it('shows the codes first, then explains a follow-up failure', async () => {
    const { fixture, el } = await mount('installed-unbootstrapped', {
      setupLocalHub: async () => ({
        recoveryCodes: Array.from({ length: 10 }, (_, i) => `CODE-0000${i}`),
        status: STANDALONE_STATUS,
        followUpError: { code: 'tls-pin-mismatch', message: 'The Hub certificate did not match.' },
      }),
    });
    await fillSetup(fixture, el);
    buttonWithText(el, 'Create the Hub').click();
    await settle(fixture);
    expect(el.querySelectorAll('[data-testid="recovery-code"]')).toHaveLength(10);
    expect(byId(el, 'setup-follow-up')).toBeNull();
    await acknowledgeCodes(fixture, el);
    expect(text(el, 'setup-follow-up-message')).toBe('The Hub certificate did not match.');
    expect(text(el, 'setup-follow-up')).toContain('Hub was created');
    buttonWithText(el, 'Connect to a Hub').click();
    expect(document.activeElement).toBe(field(el, 'pairing-string'));
  });

  it.each([
    ['elevation-cancelled', 'The administrator prompt was declined — nothing changed.'],
    ['not-installed', 'DUDE-Hub-Setup.exe'],
    ['already-bootstrapped', 'pairing string'],
    ['handoff-missing', 'Try again'],
    ['handoff-expired', 'expired'],
    ['busy', 'Another Hub operation'],
  ])('maps the %s failure and keeps the form', async (code, copy) => {
    const { fixture, el } = await mount('installed-unbootstrapped', {
      setupLocalHub: async () => {
        throw new HubAdminError(code, 'raw');
      },
    });
    await fillSetup(fixture, el);
    buttonWithText(el, 'Create the Hub').click();
    await settle(fixture);
    expect(text(el, 'setup-error')).toContain(copy);
    expect(byId(el, 'setup-form')).not.toBeNull();
    expect(field(el, 'setup-password').value).toBe('');
  });
});

describe('Environment & Hub local Hub update', () => {
  afterEach(() => document.body.replaceChildren());

  it('explains the interruption, then updates on Confirm', async () => {
    const { fixture, el, port } = await mount('update-available');
    expect(text(el, 'update-notice')).toBe('The Hub on this computer runs 0.0.1; this app includes 0.0.44.');
    buttonWithText(el, 'Update Hub…').click();
    await settle(fixture);
    expect(port.updateLocalHub).not.toHaveBeenCalled();
    expect(text(el, 'update-confirm')).toContain('for about a minute');
    expect(text(el, 'update-confirm')).toContain('administrator permission');
    buttonWithText(el, 'Confirm update').click();
    await settle(fixture);
    expect(port.updateLocalHub).toHaveBeenCalledTimes(1);
    expect(text(el, 'update-done')).toBe('The Hub was updated from 0.0.1 to 0.0.44.');
  });

  it('includes the registered device count when the owner is signed in', async () => {
    const { fixture, el } = await mount('update-available', { listDevices: async () => [{}, {}, {}] as never });
    buttonWithText(el, 'Update Hub…').click();
    await settle(fixture);
    expect(text(el, 'update-device-count')).toContain('3 registered devices');
  });

  it('says so when the Hub has not reported its new version', async () => {
    const { fixture, el } = await mount('update-available', { updateLocalHub: async () => ({ fromVersion: '0.0.1', toVersion: null }) });
    buttonWithText(el, 'Update Hub…').click();
    await settle(fixture);
    buttonWithText(el, 'Confirm update').click();
    await settle(fixture);
    expect(text(el, 'update-done')).toContain('did not report its new version yet');
  });

  it.each([
    ['elevation-cancelled', 'declined'],
    ['update-failed', 'update failed'],
    ['no-update', 'no Hub update'],
    ['unsupported-in-dev', 'development build'],
  ])('maps the %s failure', async (code, copy) => {
    const { fixture, el } = await mount('update-available', {
      updateLocalHub: async () => {
        throw new HubAdminError(code, 'raw');
      },
    });
    buttonWithText(el, 'Update Hub…').click();
    await settle(fixture);
    buttonWithText(el, 'Confirm update').click();
    await settle(fixture);
    expect(text(el, 'update-error')).toContain(copy);
  });
});

describe('Environment & Hub device-assisted owner recovery', () => {
  afterEach(() => document.body.replaceChildren());

  const trusted = { status: async () => ({ ...ENROLLED_STATUS, recoveryTrusted: true }) };

  async function openRecovery(overrides: Partial<HubAdminPort> = {}) {
    const ctx = await mount('bootstrapped', { ...trusted, ...overrides });
    buttonWithText(ctx.el, 'Reset the owner password…').click();
    await settle(ctx.fixture);
    buttonWithText(ctx.el, 'Continue').click();
    await settle(ctx.fixture);
    typeInto(field(ctx.el, 'recover-password'), PASSWORD);
    typeInto(field(ctx.el, 'recover-confirm'), PASSWORD);
    await settle(ctx.fixture);
    return ctx;
  }

  it('is hidden unless this computer is recovery-trusted', async () => {
    const untrusted = await mount('bootstrapped', { status: async () => ({ ...ENROLLED_STATUS, recoveryTrusted: false }) });
    expect(byId(untrusted.el, 'owner-recovery')).toBeNull();
    document.body.replaceChildren();
    TestBed.resetTestingModule();
    const standalone = await mount('bootstrapped');
    expect(byId(standalone.el, 'owner-recovery')).toBeNull();
  });

  it('explains first, then resets and returns to sign-in', async () => {
    const { fixture, el, port } = await mount('bootstrapped', trusted);
    expect(text(el, 'owner-recovery')).toContain('Forgot the owner password?');
    buttonWithText(el, 'Reset the owner password…').click();
    await settle(fixture);
    expect(text(el, 'recover-explain')).toContain('signs out every owner session on every device and browser');
    expect(text(el, 'recover-explain')).toContain('recovery codes stay valid');
    expect(text(el, 'recover-explain')).toContain('Windows will confirm it is you');
    buttonWithText(el, 'Continue').click();
    await settle(fixture);
    typeInto(field(el, 'recover-password'), PASSWORD);
    typeInto(field(el, 'recover-confirm'), PASSWORD);
    await settle(fixture);
    buttonWithText(el, 'Confirm reset').click();
    await settle(fixture);
    expect(port.recoverOwner).toHaveBeenCalledExactlyOnceWith(PASSWORD);
    expect(text(el, 'recover-done')).toBe('Owner password reset. Sign in with the new password.');
    expect(byId(el, 'owner-gate')).not.toBeNull();
    expect(byId(el, 'recover-form')).toBeNull();
  });

  it('blocks a mismatched or short password', async () => {
    const { fixture, el, port } = await mount('bootstrapped', trusted);
    buttonWithText(el, 'Reset the owner password…').click();
    await settle(fixture);
    buttonWithText(el, 'Continue').click();
    await settle(fixture);
    typeInto(field(el, 'recover-password'), PASSWORD);
    typeInto(field(el, 'recover-confirm'), 'different');
    await settle(fixture);
    expect(byId(el, 'recover-mismatch')).not.toBeNull();
    expect(buttonWithText(el, 'Confirm reset').disabled).toBe(true);
    expect(port.recoverOwner).not.toHaveBeenCalled();
  });

  it.each([
    [new HubAdminError('not-verified', 'raw'), 'Windows did not confirm'],
    [new HubAdminError('not-trusted', 'raw'), 'not trusted for owner recovery'],
    [new HubAdminError('unavailable', 'raw'), 'not available'],
    [new HubAdminError('throttled', 'Too many attempts.', 30_000), 'Try again in 30 seconds'],
  ])('maps %o', async (failure, copy) => {
    const { fixture, el } = await openRecovery({
      recoverOwner: async () => {
        throw failure;
      },
    });
    buttonWithText(el, 'Confirm reset').click();
    await settle(fixture);
    expect(text(el, 'recover-error')).toContain(copy);
  });
});
