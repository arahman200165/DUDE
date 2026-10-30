import { DeviceStoreError } from './agent-host';
import { PROVISION_CONFIRMATION_MS } from './hub-provision';
import { HOST, PHRASE, SECRET_PASSPHRASE, SECRET_TOKEN, setupProvision } from './hub-provision.fixture';

/**
 * The Destructive-Action Contract's boundary for the desktop provisioning wizard (32-SS1, Milestone 853, PD-153): the steps that widen the Hub's
 * exposure (the Cloudflare tunnel) or change a machine setting (power plan, standby grant) are two steps; a preview sends the Hub session only its
 * preview operation; an apply is accepted only for the confirmation that preview returned, once and within 60 seconds, and the tunnel apply also
 * needs the exact phrase, which main never supplies. Nothing in this module can reach an operation outside the Hub session's closed list.
 */
const OPS = ['status', 'provision', 'tunnel-preview', 'tunnel-apply', 'oidc', 'power-preview', 'power-apply', 'backup', 'standby-preview', 'standby-apply', 'restart'];
const reject = async (promise: Promise<unknown>): Promise<DeviceStoreError> => {
  try { await promise; } catch (error) { return error as DeviceStoreError; }
  throw new Error('did not reject');
};
const APPLY = { step: 'tunnel-apply', hostname: HOST, confirmToken: 'tok-tunnel', acknowledgement: PHRASE, acceptUnverifiedReachability: false, connectorToken: SECRET_TOKEN } as const;

describe('provision confirmation boundary', () => {
  it('sends only the preview operation for a preview, and never an apply on its own', async () => {
    const t = setupProvision();
    await t.controller.open();
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    await t.controller.step({ step: 'power-preview' });
    await t.controller.step({ step: 'standby-preview' });
    expect(t.ops()).toEqual(['status', 'tunnel-preview', 'power-preview', 'standby-preview']);
  });

  it('refuses every apply that has no matching preview, and sends nothing for it', async () => {
    const t = setupProvision();
    await t.controller.open();
    for (const step of [APPLY, { step: 'power-apply', confirmToken: 'tok-power' }, { step: 'standby-apply', confirmToken: 'tok-standby' }] as const) {
      expect((await reject(t.controller.step(step))).code).toBe('stale-preview');
    }
    expect(t.ops()).toEqual(['status']);
  });

  it('refuses a stale confirmation: after 60 seconds the apply is not sent', async () => {
    const t = setupProvision();
    await t.controller.open();
    await t.controller.step({ step: 'power-preview' });
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    t.clock.t += PROVISION_CONFIRMATION_MS + 1;
    expect((await reject(t.controller.step({ step: 'power-apply', confirmToken: 'tok-power' }))).code).toBe('stale-preview');
    expect((await reject(t.controller.step(APPLY))).code).toBe('stale-preview');
    expect(t.ops()).toEqual(['status', 'power-preview', 'tunnel-preview']);
  });

  it('never supplies the typed phrase: the tunnel is turned on only with the exact phrase from the user', async () => {
    const t = setupProvision();
    await t.controller.open();
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    for (const acknowledgement of ['', 'expose hub through cloudflare', 'EXPOSE HUB THROUGH CLOUDFLARE.', ' ']) {
      expect((await reject(t.controller.step({ ...APPLY, acknowledgement }))).code).toBe('refused');
    }
    expect(t.ops()).toEqual(['status', 'tunnel-preview']);
    await t.controller.step(APPLY);
    expect(t.ops()).toEqual(['status', 'tunnel-preview', 'tunnel-apply']);
  });

  it('reaches only the closed list of Hub session operations across a whole run, with a secret only in its own operation', async () => {
    const t = setupProvision();
    await t.controller.open();
    await t.controller.step({ step: 'provision' });
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    await t.controller.step(APPLY);
    await t.controller.step({ step: 'oidc', clientId: '1.apps.googleusercontent.com', clientSecret: 'GOCSPX-abcdefghijklmnop', redirectOrigin: `https://${HOST}` });
    await t.controller.chooseBackupFolder();
    await t.controller.step({ step: 'backup', passphrase: SECRET_PASSPHRASE, intervalHours: 24 });
    await t.controller.step({ step: 'power-preview' });
    await t.controller.step({ step: 'power-apply', confirmToken: 'tok-power' });
    await t.controller.step({ step: 'standby-preview' });
    await t.controller.step({ step: 'standby-apply', confirmToken: 'tok-standby' });
    await t.controller.step({ step: 'restart' });
    expect(t.ops().every((op) => OPS.includes(op))).toBe(true);
    expect(t.ops()).toEqual(['status', 'provision', 'tunnel-preview', 'tunnel-apply', 'oidc', 'backup', 'power-preview', 'power-apply', 'standby-preview', 'standby-apply', 'restart']);
    expect(t.raw.filter((line) => line.includes(SECRET_TOKEN))).toHaveLength(1);
    expect(t.raw.filter((line) => line.includes(SECRET_PASSPHRASE))).toHaveLength(1);
  });
});
