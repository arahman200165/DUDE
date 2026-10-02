import { TestBed } from '@angular/core/testing';
import type { FakeLocalHubScenario } from '../../../core/platform/testing/fake-hub';
import type { HubAdminPort } from '../../../core/hub/hub-admin.port';
import { EnvironmentSettings } from './environment-settings';
import { ENROLLED_STATUS, STANDALONE_STATUS, buttonWithText, configureHubTest, createTestPort, settle, typeInto } from './hub/testing/hub-test-port';

/**
 * Destructive-Action Contract for the local Hub actions in Settings > Environment & Hub: Update Hub and the
 * owner-password reset are two-step (explain, then an explicit Confirm); previews alone never call the host,
 * Cancel and Escape reset, Confirm calls exactly once, and setup only runs from an explicit submit.
 */
const PASSWORD = 'a long enough password';

async function setup(scenario: FakeLocalHubScenario, overrides: Partial<HubAdminPort>) {
  const { port } = createTestPort(overrides, { localHub: scenario });
  configureHubTest(port);
  const fixture = TestBed.createComponent(EnvironmentSettings);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, port };
}
const panel = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const escape = (el: HTMLElement, id: string) => panel(el, id)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const click = async (fixture: Parameters<typeof settle>[0], el: HTMLElement, label: string) => {
  buttonWithText(el, label).click();
  await settle(fixture);
};
const input = (el: HTMLElement, id: string) => el.querySelector(`#${id}`) as HTMLInputElement;

describe('Environment & Hub local Hub confirmation boundary', () => {
  afterEach(() => document.body.replaceChildren());

  describe('Update Hub', () => {
    const open = () => setup('update-available', { status: async () => STANDALONE_STATUS });

    it('rendering and the preview never update', async () => {
      const { fixture, el, port } = await open();
      expect(port.updateLocalHub).not.toHaveBeenCalled();
      await click(fixture, el, 'Update Hub…');
      expect(panel(el, 'update-confirm')).not.toBeNull();
      expect(port.updateLocalHub).not.toHaveBeenCalled();
    });

    it('Cancel and Escape reset without updating', async () => {
      const { fixture, el, port } = await open();
      await click(fixture, el, 'Update Hub…');
      await click(fixture, el, 'Cancel');
      expect(panel(el, 'update-confirm')).toBeNull();
      await click(fixture, el, 'Update Hub…');
      escape(el, 'local-hub-update');
      await settle(fixture);
      expect(panel(el, 'update-confirm')).toBeNull();
      expect(port.updateLocalHub).not.toHaveBeenCalled();
    });

    it('Confirm calls updateLocalHub exactly once', async () => {
      const { fixture, el, port } = await open();
      await click(fixture, el, 'Update Hub…');
      await click(fixture, el, 'Confirm update');
      expect(port.updateLocalHub).toHaveBeenCalledTimes(1);
      expect(buttonWithText(el, 'Confirm update')).toBeUndefined();
    });
  });

  describe('Owner password reset', () => {
    const open = async () => {
      const ctx = await setup('bootstrapped', { status: async () => ({ ...ENROLLED_STATUS, recoveryTrusted: true }) });
      await click(ctx.fixture, ctx.el, 'Reset the owner password…');
      return ctx;
    };
    const fillPasswords = async (fixture: Parameters<typeof settle>[0], el: HTMLElement) => {
      await click(fixture, el, 'Continue');
      typeInto(input(el, 'recover-password'), PASSWORD);
      typeInto(input(el, 'recover-confirm'), PASSWORD);
      await settle(fixture);
    };

    it('the explanation and the password step never call recoverOwner', async () => {
      const { fixture, el, port } = await open();
      expect(panel(el, 'recover-explain')).not.toBeNull();
      expect(port.recoverOwner).not.toHaveBeenCalled();
      await fillPasswords(fixture, el);
      expect(panel(el, 'recover-form')).not.toBeNull();
      expect(port.recoverOwner).not.toHaveBeenCalled();
    });

    it('Cancel and Escape reset and drop the typed password', async () => {
      const { fixture, el, port } = await open();
      await fillPasswords(fixture, el);
      await click(fixture, el, 'Cancel');
      expect(panel(el, 'recover-form')).toBeNull();
      await click(fixture, el, 'Reset the owner password…');
      await fillPasswords(fixture, el);
      expect(input(el, 'recover-password').value).toBe(PASSWORD);
      escape(el, 'owner-recovery');
      await settle(fixture);
      expect(panel(el, 'recover-form')).toBeNull();
      await click(fixture, el, 'Reset the owner password…');
      await click(fixture, el, 'Continue');
      expect(input(el, 'recover-password').value).toBe('');
      expect(port.recoverOwner).not.toHaveBeenCalled();
    });

    it('Confirm calls recoverOwner exactly once', async () => {
      const { fixture, el, port } = await open();
      await fillPasswords(fixture, el);
      await click(fixture, el, 'Confirm reset');
      expect(port.recoverOwner).toHaveBeenCalledExactlyOnceWith(PASSWORD);
    });
  });

  describe('Hub setup', () => {
    it('never runs without an explicit submit', async () => {
      const { fixture, el, port } = await setup('installed-unbootstrapped', { status: async () => STANDALONE_STATUS });
      expect(port.setupLocalHub).not.toHaveBeenCalled();
      await click(fixture, el, 'Set up a Hub on this computer…');
      await click(fixture, el, 'Continue');
      typeInto(input(el, 'setup-environment'), 'Home');
      typeInto(input(el, 'setup-owner'), 'Sam');
      typeInto(input(el, 'setup-password'), PASSWORD);
      typeInto(input(el, 'setup-confirm'), PASSWORD);
      await settle(fixture);
      expect(port.setupLocalHub).not.toHaveBeenCalled();
      await click(fixture, el, 'Cancel');
      expect(panel(el, 'setup-form')).toBeNull();
      expect(port.setupLocalHub).not.toHaveBeenCalled();
    });
  });
});
