import { TestBed } from '@angular/core/testing';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import { buttonWithText } from './testing/hub-test-port';
import { PHRASE, byId, click, field, goTo, legend, mountWizard, previewTunnel, start, stepCalls, stepNames, textOf, type, type Mounted } from './testing/provisioning-test-harness';

const PASSPHRASE = 'a long enough passphrase';

const storageDump = (): string => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]);

describe('Hub provisioning wizard', () => {
  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders nothing unless this PC has a Hub with an owner', async () => {
    for (const scenario of ['not-installed', 'installed-unbootstrapped'] as const) {
      const m = await mountWizard({ localHub: scenario });
      expect(byId(m.el, 'hub-provisioning')).toBeNull();
      document.body.replaceChildren();
      TestBed.resetTestingModule();
    }
    const m = await mountWizard();
    expect(textOf(m.el, 'hub-provisioning')).toContain("Set up this Hub's platform");
    expect(textOf(m.el, 'provision-start')).toBe('Start (Windows will ask for administrator permission once)');
    expect(m.port.provisionOpen).not.toHaveBeenCalled();
  });

  it('Start opens one session and shows what is already ready', async () => {
    const m = await mountWizard();
    await start(m);
    expect(m.port.provisionOpen).toHaveBeenCalledTimes(1);
    expect(legend(m)).toBe('Step 1 of 6: Check and create storage');
    expect(m.el.querySelector('[aria-current="step"]')?.textContent).toContain('Check and create storage');
    expect(textOf(m.el, 'component-content-store')).toContain('The content store works.');
    expect(textOf(m.el, 'component-tunnel')).toContain('Not set up');
    expect(stepNames(m)).toEqual([]);
    await click(m, 'run-provision');
    expect(stepNames(m)).toEqual(['provision']);
    expect(textOf(m.el, 'provision-created')).toContain('Created: Content store');
  });

  it('shows the message when the administrator prompt is declined or fails', async () => {
    for (const [code, message] of [['elevation-cancelled', /declined/], ['elevation-failed', /could not start/]] as const) {
      const m = await mountWizard({ overrides: { provisionOpen: () => Promise.reject(new HubAdminError(code, 'raw')) } });
      await start(m);
      expect(textOf(m.el, 'provision-error')).toMatch(message);
      expect(byId(m.el, 'provision-start')).not.toBeNull();
      document.body.replaceChildren();
      TestBed.resetTestingModule();
    }
  });

  it('says it is waiting for the administrator prompt while the session opens', async () => {
    let release!: () => void;
    const m = await mountWizard({
      overrides: { provisionOpen: () => new Promise((resolve) => { release = () => resolve({ provisioning: { overall: 'ready', checkedAt: '', lastRun: null, components: [], secrets: [], commands: [] }, tunnel: null, power: null, backup: null, deviceId: null }); }) },
    });
    await click(m, 'provision-start');
    expect(byId(m.el, 'provision-waiting')?.getAttribute('role')).toBe('status');
    expect(textOf(m.el, 'provision-waiting')).toBe('Waiting for the Windows administrator prompt…');
    release();
    await new Promise<void>((r) => setTimeout(r));
    m.fixture.detectChanges();
    expect(byId(m.el, 'provision-waiting')).toBeNull();
  });

  it('returns to the start screen with a plain message when the session ends by itself', async () => {
    const m = await mountWizard();
    await start(m);
    m.emitProvision({ kind: 'session', state: 'closed', reason: 'idle' });
    await new Promise<void>((r) => setTimeout(r));
    m.fixture.detectChanges();
    expect(byId(m.el, 'provision-start')).not.toBeNull();
    expect(textOf(m.el, 'provision-notice')).toMatch(/inactivity/);
  });

  it('closes the session when the user cancels or the component is destroyed', async () => {
    const m = await mountWizard();
    await start(m);
    await click(m, 'cancel-wizard');
    expect(m.port.provisionClose).toHaveBeenCalledTimes(1);
    expect(byId(m.el, 'provision-start')).not.toBeNull();
    await start(m);
    m.fixture.destroy();
    expect(m.port.provisionClose).toHaveBeenCalledTimes(2);
  });

  describe('tunnel', () => {
    it('shows the dashboard lines and the phrase, and applies only with the exact phrase and the previewed token', async () => {
      const m = await mountWizard();
      await start(m);
      await previewTunnel(m);
      expect(stepCalls(m).at(-1)).toEqual({ step: 'tunnel-preview', hostname: 'hub.example.com', acceptUnverifiedReachability: false });
      expect(textOf(m.el, 'dashboard-lines')).toContain('Public hostname: hub.example.com');
      expect(textOf(m.el, 'tunnel-disclosure')).toContain('Cloudflare');
      expect(textOf(m.el, 'required-phrase')).toBe(PHRASE);
      const apply = byId(m.el, 'tunnel-apply') as HTMLButtonElement;
      expect(apply.disabled).toBe(true);
      expect(field(m.el, 'tunnel-phrase').value).toBe('');

      await type(m, 'tunnel-token', 'cf-connector-token');
      await type(m, 'tunnel-phrase', PHRASE.toLowerCase());
      expect(apply.disabled).toBe(true);
      await type(m, 'tunnel-phrase', `${PHRASE} `);
      expect(apply.disabled).toBe(true);
      await type(m, 'tunnel-phrase', PHRASE);
      expect(apply.disabled).toBe(false);

      const previewed = stepCalls(m).length;
      await click(m, apply);
      const sent = stepCalls(m)[previewed]!;
      expect(sent).toMatchObject({ step: 'tunnel-apply', hostname: 'hub.example.com', confirmToken: 'fake-confirm-1', acknowledgement: PHRASE, connectorToken: 'cf-connector-token' });
      expect(textOf(m.el, 'tunnel-done')).toContain('hub.example.com');
    });

    it('passes the reachability acknowledgement through', async () => {
      const m = await mountWizard();
      await start(m);
      await goTo(m, 'Cloudflare Tunnel');
      await type(m, 'tunnel-hostname', 'hub.example.com');
      (field(m.el, 'tunnel-accept')).click();
      await click(m, 'tunnel-preview-button');
      expect(stepCalls(m).at(-1)).toMatchObject({ step: 'tunnel-preview', acceptUnverifiedReachability: true });
    });

    it('clears the token and the phrase on submit even when the apply fails, and keeps the preview for a plain failure', async () => {
      const m = await mountWizard({ failures: { 'tunnel-apply': new HubAdminError('busy', 'raw') } });
      await start(m);
      await previewTunnel(m);
      await type(m, 'tunnel-token', 'cf-connector-token');
      await type(m, 'tunnel-phrase', PHRASE);
      await click(m, 'tunnel-apply');
      expect(textOf(m.el, 'provision-error')).toMatch(/Another Hub operation/);
      expect(byId(m.el, 'tunnel-preview')).not.toBeNull();
      expect(field(m.el, 'tunnel-token').value).toBe('');
      expect(field(m.el, 'tunnel-phrase').value).toBe('');
      expect((byId(m.el, 'tunnel-apply') as HTMLButtonElement).disabled).toBe(true);
      expect(m.el.textContent).not.toContain('cf-connector-token');
    });

    it('returns to the preview form with the message when the preview has expired', async () => {
      const m = await mountWizard({ failures: { 'tunnel-apply': new HubAdminError('stale-preview', 'raw') } });
      await start(m);
      await previewTunnel(m);
      await type(m, 'tunnel-token', 'cf-connector-token');
      await type(m, 'tunnel-phrase', PHRASE);
      await click(m, 'tunnel-apply');
      expect(byId(m.el, 'tunnel-form')).not.toBeNull();
      expect(textOf(m.el, 'provision-error')).toMatch(/Preview again/);
    });
  });

  describe('backups', () => {
    const toBackups = async (m: Mounted) => {
      await start(m);
      await goTo(m, 'Backups');
    };

    it('blocks the submit until a folder is chosen and the passphrases are long enough and match', async () => {
      const m = await mountWizard();
      await toBackups(m);
      const save = byId(m.el, 'backup-save') as HTMLButtonElement;
      await type(m, 'backup-passphrase', PASSPHRASE);
      await type(m, 'backup-confirm', `${PASSPHRASE}x`);
      expect(textOf(m.el, 'backup-mismatch')).toContain('do not match');
      expect(save.disabled).toBe(true);
      await type(m, 'backup-confirm', PASSPHRASE);
      expect(byId(m.el, 'backup-mismatch')).toBeNull();
      expect(save.disabled).toBe(true);
      await click(m, 'backup-choose');
      expect(textOf(m.el, 'backup-folder')).toBe('D:/DUDE backups');
      expect(save.disabled).toBe(false);
      await type(m, 'backup-passphrase', 'short');
      await type(m, 'backup-confirm', 'short');
      expect(save.disabled).toBe(true);
      expect(textOf(m.el, 'backup-warning')).toContain('NOT stored');
      expect(stepNames(m)).toEqual([]);
    });

    it('sends the passphrase and interval once, and the fields are empty afterwards', async () => {
      const m = await mountWizard({ failures: { backup: new HubAdminError('bad-request', 'raw') } });
      await toBackups(m);
      await click(m, 'backup-choose');
      await type(m, 'backup-passphrase', PASSPHRASE);
      await type(m, 'backup-confirm', PASSPHRASE);
      (field(m.el, 'backup-interval') as unknown as HTMLSelectElement).value = '168';
      field(m.el, 'backup-interval').dispatchEvent(new Event('change'));
      await click(m, 'backup-save');
      expect(stepCalls(m).at(-1)).toEqual({ step: 'backup', passphrase: PASSPHRASE, intervalHours: 168 });
      expect(field(m.el, 'backup-passphrase').value).toBe('');
      expect(field(m.el, 'backup-confirm').value).toBe('');
      expect(m.el.textContent).not.toContain(PASSPHRASE);
    });
  });

  describe('secret inputs', () => {
    it('are password fields that never autocomplete and never reach browser storage', async () => {
      const m = await mountWizard();
      await start(m);
      await previewTunnel(m);
      await type(m, 'tunnel-token', 'cf-secret-token');
      const token = field(m.el, 'tunnel-token');
      expect([token.type, token.autocomplete]).toEqual(['password', 'off']);
      await type(m, 'tunnel-phrase', PHRASE);
      await click(m, 'tunnel-apply');
      await click(m, 'step-next');
      await type(m, 'google-client-id', 'client-id');
      await type(m, 'google-client-secret', 'google-secret-value');
      const secret = field(m.el, 'google-client-secret');
      expect([secret.type, secret.autocomplete]).toEqual(['password', 'off']);
      expect(field(m.el, 'google-origin').value).toBe('https://hub.example.com');
      await click(m, 'google-save');
      expect(stepCalls(m).at(-1)).toEqual({ step: 'oidc', clientId: 'client-id', clientSecret: 'google-secret-value', redirectOrigin: 'https://hub.example.com' });
      await click(m, 'step-next');
      await type(m, 'backup-passphrase', PASSPHRASE);
      const pass = field(m.el, 'backup-passphrase');
      expect([pass.type, pass.autocomplete]).toEqual(['password', 'new-password']);
      expect(field(m.el, 'backup-confirm').type).toBe('password');
      for (const value of ['cf-secret-token', 'google-secret-value', PASSPHRASE]) {
        expect(storageDump()).not.toContain(value);
        expect(m.el.innerHTML).not.toContain(`value="${value}"`);
      }
    });
  });

  describe('power, standby and finish', () => {
    it('treats a Hub conflict on the power preview as already done', async () => {
      const m = await mountWizard({ failures: { 'power-preview': new HubAdminError('conflict', 'raw') } });
      await start(m);
      await goTo(m, 'Power');
      await click(m, 'power-preview-button');
      expect(textOf(m.el, 'power-done')).toMatch(/already/);
      expect(byId(m.el, 'provision-error')).toBeNull();
    });

    it('offers the standby step only with a standby bridge, and shows this PC and its folder', async () => {
      const without = await mountWizard();
      await start(without);
      expect(legend(without)).toContain('Step 1 of 6');
      document.body.replaceChildren();
      TestBed.resetTestingModule();

      const m = await mountWizard({ standby: true });
      await start(m);
      expect(legend(m)).toContain('Step 1 of 7');
      await goTo(m, 'Standby copy');
      expect(textOf(m.el, 'standby-device')).toContain('0190aaaa-0000-7000-8000-000000000001');
      expect((byId(m.el, 'standby-preview-button') as HTMLButtonElement).disabled).toBe(true);
      await click(m, 'standby-choose');
      expect(textOf(m.el, 'standby-folder')).toBe('D:/standby');
      expect(textOf(m.el, 'standby-status')).toContain('idle');
      await click(m, 'standby-preview-button');
      expect(textOf(m.el, 'standby-preview')).toContain('encrypted backups');
    });

    it('summarizes each step and restarts the Hub when a step asked for it', async () => {
      const m = await mountWizard();
      await start(m);
      await click(m, 'run-provision');
      await click(m, 'step-next');
      await previewTunnel(m);
      await type(m, 'tunnel-token', 'cf-token');
      await type(m, 'tunnel-phrase', PHRASE);
      await click(m, 'tunnel-apply');
      await goTo(m, 'Finish');
      expect(textOf(m.el, 'finish-status')).toContain('Done');
      expect(textOf(m.el, 'finish-tunnel')).toContain('Done');
      expect(textOf(m.el, 'finish-google')).toContain('Skipped');
      expect(textOf(m.el, 'finish-backups')).toContain('Skipped');
      await click(m, 'restart-hub');
      expect(stepNames(m).at(-1)).toBe('restart');
      expect(textOf(m.el, 'provision-notice')).toMatch(/restarting/);
      expect(byId(m.el, 'provision-start')).not.toBeNull();
    });

    it('offers Close, which ends the session, when nothing needs a restart', async () => {
      const m = await mountWizard();
      await start(m);
      await goTo(m, 'Finish');
      expect(byId(m.el, 'restart-hub')).toBeNull();
      expect(buttonWithText(m.el, 'Close')).toBeDefined();
      await click(m, 'close-wizard');
      expect(m.port.provisionClose).toHaveBeenCalledTimes(1);
      expect(byId(m.el, 'provision-start')).not.toBeNull();
    });
  });
});
