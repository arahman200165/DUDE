const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>(), sent: [] as unknown[][] }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/ud', isPackaged: false },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeviceStoreError } from './agent-host';
import { PROVISION_CONFIRMATION_MS, createProvisionController, parseProvisionRequest, registerProvisionHandlers } from './hub-provision';
import {
  DEVICE_ID, HOST, PHRASE, SECRETS, SECRET_CLIENT, SECRET_PASSPHRASE, SECRET_TOKEN, SessionError, setupProvision,
} from './hub-provision.fixture';

const TUNNEL_APPLY = { step: 'tunnel-apply', hostname: HOST, confirmToken: 'tok-tunnel', acknowledgement: PHRASE, acceptUnverifiedReachability: false, connectorToken: SECRET_TOKEN } as const;
const reject = async (promise: Promise<unknown>): Promise<DeviceStoreError> => {
  try { await promise; } catch (error) { return error as DeviceStoreError; }
  throw new Error('did not reject');
};

describe('provision controller: the one elevated session', () => {
  it('elevates the INSTALLED dude-hub with only a pipe name, the data directory and the install directory on the command line, then reads the status', async () => {
    const t = setupProvision();
    const status = await t.controller.open();
    expect(t.elevated).toHaveLength(1);
    const [file, ...argv] = [t.elevated[0]!.env!['DUDE_ELEVATE_FILE'], ...(JSON.parse(t.elevated[0]!.env!['DUDE_ELEVATE_ARGS']!) as string[])];
    expect(file).toBe('C:\\Program Files\\DUDE Hub\\dude-hub.exe');
    expect(argv.slice(0, 2)).toEqual(['provision', '--session-pipe']);
    expect(argv[2]).toMatch(/^dude-hub-provision-[A-Za-z0-9_-]{32}$/);
    expect(argv.slice(3)).toEqual(['--data-dir', 'C:\\ProgramData\\DUDE\\Hub', '--install-dir', 'C:\\Program Files\\DUDE Hub']);
    expect(status).toMatchObject({ provisioning: { overall: 'ready' }, deviceId: DEVICE_ID, tunnel: { configured: false }, backup: { destinations: 0 } });
    expect(t.progress.map((p) => (p.kind === 'session' ? p.state : p.step))).toEqual(['waiting-for-administrator', 'open']);
    expect(t.controller.isOpen()).toBe(true);
    // Opening again reuses the session: no second administrator prompt.
    await t.controller.open();
    expect(t.elevated).toHaveLength(1);
  });

  it('reports a declined administrator prompt and a command that ended early, and closes the pipe', async () => {
    const declined = setupProvision({ exitWithoutConnecting: 1223 });
    expect((await reject(declined.controller.open())).code).toBe('elevation-cancelled');
    expect(declined.state.channelClosed).toBe(true);
    expect(declined.progress.at(-1)).toEqual({ kind: 'session', state: 'closed', reason: 'cancelled' });
    expect(declined.controller.isOpen()).toBe(false);
    const early = setupProvision({ exitWithoutConnecting: 2 });
    expect((await reject(early.controller.open())).code).toBe('session-failed');
    const silent = setupProvision({ exitWithoutConnecting: 0 });
    expect((await reject(silent.controller.open())).code).toBe('session-failed');
  });

  it('refuses off Windows, without a device agent, and without an installed Hub, before anything is elevated', async () => {
    const linux = setupProvision({ platform: 'linux' });
    expect((await reject(linux.controller.open())).code).toBe('unsupported-platform');
    const noHost = setupProvision({ hasHost: false });
    expect((await reject(noHost.controller.open())).code).toBe('unavailable');
    const none = setupProvision();
    none.deps.exists = () => false;
    expect((await reject(createProvisionController({ isDestroyed: () => false, webContents: { isDestroyed: () => false, send: () => undefined } } as never, () => ({}) as never, none.deps, () => undefined).open())).code).toBe('not-installed');
    for (const t of [linux, noHost, none]) expect(t.elevated).toEqual([]);
  });

  it('needs an open session for every step, and ends it when the Hub or the elevated process goes away', async () => {
    const t = setupProvision();
    expect((await reject(t.controller.step({ step: 'provision' }))).code).toBe('no-session');
    await t.controller.open();
    t.hubEnds();
    expect(t.controller.isOpen()).toBe(false);
    expect(t.progress.at(-1)).toEqual({ kind: 'session', state: 'closed', reason: 'ended' });
    expect((await reject(t.controller.step({ step: 'provision' }))).code).toBe('no-session');
  });

  it('closes on request and when the window closes, dropping any pending confirmation', async () => {
    const t = setupProvision();
    await t.controller.open();
    await t.controller.step({ step: 'power-preview' });
    expect(t.controller.close('window-closed')).toEqual({ closed: true });
    expect(t.state.socketClosed).toBe(true);
    expect(t.controller.close()).toEqual({ closed: false });
  });

  it('runs one step at a time and times out a silent Hub without closing the session', async () => {
    const t = setupProvision({ serve: (op) => (op === 'provision' ? new Promise(() => undefined) : undefined) });
    await t.controller.open();
    vi.useFakeTimers();
    try {
      const first = t.controller.step({ step: 'provision' });
      first.catch(() => undefined);
      expect((await reject(t.controller.step({ step: 'status' }))).code).toBe('busy');
      await vi.advanceTimersByTimeAsync(151_000);
      expect((await reject(first)).code).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
    expect(t.controller.isOpen()).toBe(true);
  });
});

describe('provision controller: secrets', () => {
  it('sends the connector token, the Google secret and the passphrase only as one JSON line each on the pipe', async () => {
    const t = setupProvision();
    await t.controller.open();
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    await t.controller.step(TUNNEL_APPLY);
    await t.controller.step({ step: 'oidc', clientId: '1.apps.googleusercontent.com', clientSecret: SECRET_CLIENT, redirectOrigin: `https://${HOST}` });
    await t.controller.chooseBackupFolder();
    await t.controller.step({ step: 'backup', passphrase: SECRET_PASSPHRASE, intervalHours: 24 });
    const withSecret = (secret: string): string[] => t.raw.filter((line) => line.includes(secret)).map((line) => (JSON.parse(line) as { op: string }).op);
    expect(withSecret(SECRET_TOKEN)).toEqual(['tunnel-apply']);
    expect(withSecret(SECRET_CLIENT)).toEqual(['oidc']);
    expect(withSecret(SECRET_PASSPHRASE)).toEqual(['backup']);
    // Not in the elevation command line or its environment, and not in anything the renderer is told.
    const elevation = JSON.stringify(t.elevated);
    for (const secret of SECRETS) expect(elevation).not.toContain(secret);
    expect(JSON.stringify(t.progress)).not.toContain(SECRET_TOKEN);
  });

  it('redacts a secret from an error even if the Hub side echoed it', async () => {
    const t = setupProvision({ serve: (op) => { if (op === 'backup') throw new SessionError('bad-request', `Cannot use ${SECRET_PASSPHRASE} here.`); return undefined; } });
    await t.controller.open();
    await t.controller.chooseBackupFolder();
    const error = await reject(t.controller.step({ step: 'backup', passphrase: SECRET_PASSPHRASE, intervalHours: 24 }));
    expect(error.code).toBe('bad-request');
    expect(error.message).not.toContain(SECRET_PASSPHRASE);
    expect(error.message).toContain('[removed]');
  });

  it('keeps a secret out of every result and error string of a full run', async () => {
    const t = setupProvision();
    const seen: string[] = [JSON.stringify(await t.controller.open())];
    seen.push(JSON.stringify(await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false })));
    seen.push(JSON.stringify(await t.controller.step(TUNNEL_APPLY)));
    seen.push(JSON.stringify(await t.controller.step({ step: 'power-preview' })));
    seen.push(JSON.stringify(await t.controller.step({ step: 'power-apply', confirmToken: 'tok-power' })));
    for (const secret of SECRETS) expect(seen.join('\n')).not.toContain(secret);
  });

  it('needs a folder the user picked before the backup, and gets it from the native dialog only', async () => {
    const t = setupProvision();
    await t.controller.open();
    expect((await reject(t.controller.step({ step: 'backup', passphrase: SECRET_PASSPHRASE, intervalHours: 24 }))).code).toBe('bad-request');
    expect(t.ops()).toEqual(['status']);
    expect(await t.controller.chooseBackupFolder()).toEqual({ canceled: false, folder: 'D:\\Hub backups' });
    t.state.picked = null;
    expect(await t.controller.chooseBackupFolder()).toEqual({ canceled: true, folder: 'D:\\Hub backups' });
    await t.controller.step({ step: 'backup', passphrase: SECRET_PASSPHRASE, intervalHours: 24 });
    expect(t.sent.at(-1)!.params).toEqual({ folder: 'D:\\Hub backups', passphrase: SECRET_PASSPHRASE, intervalHours: 24 });
  });
});

describe('provision controller: two steps and the typed phrase', () => {
  it('accepts an apply only for the confirmation the preview of this session returned, once, within 60 seconds', async () => {
    const t = setupProvision();
    await t.controller.open();
    // No preview yet, a different host, a different confirmation, a changed acceptance: all stale, and nothing is sent.
    expect((await reject(t.controller.step(TUNNEL_APPLY))).code).toBe('stale-preview');
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    for (const wrong of [{ hostname: 'other.example.com' }, { confirmToken: 'tok-other' }, { acceptUnverifiedReachability: true }]) {
      await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
      expect((await reject(t.controller.step({ ...TUNNEL_APPLY, ...wrong }))).code, JSON.stringify(wrong)).toBe('stale-preview');
    }
    expect(t.ops().filter((op) => op === 'tunnel-apply')).toEqual([]);
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    t.clock.t += PROVISION_CONFIRMATION_MS + 1;
    expect((await reject(t.controller.step(TUNNEL_APPLY))).code).toBe('stale-preview');
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    await t.controller.step(TUNNEL_APPLY);
    expect((await reject(t.controller.step(TUNNEL_APPLY))).code).toBe('stale-preview');
    expect(t.ops().filter((op) => op === 'tunnel-apply')).toHaveLength(1);
  });

  it('never fills in the phrase: a missing or wrong one is refused in main, nothing is sent, and the preview survives for a retry', async () => {
    const t = setupProvision();
    await t.controller.open();
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    const before = t.sent.length;
    for (const acknowledgement of ['', 'expose hub through cloudflare', `${PHRASE} `, 'yes']) {
      expect((await reject(t.controller.step({ ...TUNNEL_APPLY, acknowledgement }))).code).toBe('refused');
    }
    expect(t.sent).toHaveLength(before);
    await t.controller.step(TUNNEL_APPLY);
    expect(t.sent.at(-1)).toMatchObject({ op: 'tunnel-apply', params: { acknowledgement: PHRASE, confirmToken: 'tok-tunnel' } });
  });

  it('keeps the preview when the Hub refuses before spending it and drops it when the apply failed after', async () => {
    const t = setupProvision({ serve: (op, params) => {
      if (op === 'tunnel-apply' && params['connectorToken'] === SECRET_TOKEN && t.sent.filter((s) => s.op === 'tunnel-apply').length === 1) throw new SessionError('bad-request', 'The connector token is not in the shape Cloudflare issues.');
      if (op === 'tunnel-apply') throw new SessionError('tunnel-failed', 'The tunnel connector did not connect to Cloudflare in time.');
      return undefined;
    } });
    await t.controller.open();
    await t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false });
    expect((await reject(t.controller.step(TUNNEL_APPLY))).code).toBe('bad-request');
    expect((await reject(t.controller.step(TUNNEL_APPLY))).code).toBe('tunnel-failed');
    expect((await reject(t.controller.step(TUNNEL_APPLY))).code).toBe('stale-preview');
  });

  it('condenses a refused preview into one message of the readiness reasons', async () => {
    const t = setupProvision({ serve: (op) => { if (op === 'tunnel-preview') throw new SessionError('refused', 'The Hub is not ready.', { blockers: [{ id: 'a', reason: 'The firewall allows the LAN.' }, { id: 'b', reason: 'No public CA name.' }] }); return undefined; } });
    await t.controller.open();
    const error = await reject(t.controller.step({ step: 'tunnel-preview', hostname: HOST, acceptUnverifiedReachability: false }));
    expect(error).toMatchObject({ code: 'refused', message: 'The Hub is not ready. The firewall allows the LAN. No public CA name.' });
  });

  it('applies the power policy and the standby grant only for their own previews, and takes the device id from the agent, never from the renderer', async () => {
    const t = setupProvision();
    await t.controller.open();
    expect((await reject(t.controller.step({ step: 'power-apply', confirmToken: 'tok-power' }))).code).toBe('stale-preview');
    const preview = await t.controller.step({ step: 'power-preview' });
    expect(preview.summary).toEqual({ scope: 'AC', before: { sleepAcMinutes: 30, hibernateAcMinutes: 180 }, after: { sleepAcMinutes: 0, hibernateAcMinutes: 0 }, commands: ['powercfg /change standby-timeout-ac 0'], why: 'w', revertWith: 'dude-hub power revert' });
    expect((await reject(t.controller.step({ step: 'power-apply', confirmToken: 'tok-wrong' }))).code).toBe('stale-preview');
    // A wrong token also spends the preview: it must be previewed again.
    expect((await reject(t.controller.step({ step: 'power-apply', confirmToken: 'tok-power' }))).code).toBe('stale-preview');
    await t.controller.step({ step: 'power-preview' });
    expect(await t.controller.step({ step: 'power-apply', confirmToken: 'tok-power' })).toEqual({ verdict: 'ok', commands: ['powercfg ...'] });

    expect(await t.controller.step({ step: 'standby-preview' })).toMatchObject({ confirmToken: 'tok-standby', summary: { deviceId: DEVICE_ID } });
    expect(t.sent.at(-1)).toMatchObject({ op: 'standby-preview', params: { deviceId: DEVICE_ID } });
    expect(await t.controller.step({ step: 'standby-apply', confirmToken: 'tok-standby' })).toEqual({ granted: true, renewed: false });
    expect(t.sent.at(-1)).toMatchObject({ op: 'standby-apply', params: { deviceId: DEVICE_ID, confirmToken: 'tok-standby' } });
    expect((await reject(t.controller.step({ step: 'standby-apply', confirmToken: 'tok-standby' }))).code).toBe('stale-preview');
  });

  it('cannot preview a standby grant without a device id', async () => {
    const t = setupProvision({ deviceId: null });
    await t.controller.open();
    expect((await reject(t.controller.step({ step: 'standby-preview' }))).code).toBe('not-enrolled');
  });

  it('ends the session after the restart, whatever the Hub answered', async () => {
    const t = setupProvision();
    await t.controller.open();
    expect(await t.controller.step({ step: 'restart' })).toEqual({ restarted: true });
    expect(t.controller.isOpen()).toBe(false);
    expect((await reject(t.controller.step({ step: 'status' }))).code).toBe('no-session');
  });

  it('reports every step to the renderer as running, then done or failed', async () => {
    const t = setupProvision({ serve: (op) => { if (op === 'provision') throw new SessionError('provision-failed', 'No.'); return undefined; } });
    await t.controller.open();
    t.progress.length = 0;
    await reject(t.controller.step({ step: 'provision' }));
    await t.controller.step({ step: 'power-preview' });
    expect(t.progress).toEqual([
      { kind: 'step', step: 'provision', state: 'running' }, { kind: 'step', step: 'provision', state: 'failed' },
      { kind: 'step', step: 'power-preview', state: 'running' }, { kind: 'step', step: 'power-preview', state: 'done' },
    ]);
  });
});

describe('provision request grammar (renderer to main)', () => {
  const GOOD_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';
  it('accepts exactly the closed shapes and trims the connector token', () => {
    expect(parseProvisionRequest({ step: 'status' })).toEqual({ step: 'status' });
    expect(parseProvisionRequest({ step: 'tunnel-preview', hostname: 'Notes.Example.com', acceptUnverifiedReachability: true })).toEqual({ step: 'tunnel-preview', hostname: 'notes.example.com', acceptUnverifiedReachability: true });
    expect(parseProvisionRequest({ ...TUNNEL_APPLY, connectorToken: `  ${GOOD_TOKEN}\n` })).toMatchObject({ connectorToken: GOOD_TOKEN });
    expect(parseProvisionRequest({ step: 'backup', passphrase: 'a long enough passphrase', intervalHours: 24 })).toMatchObject({ step: 'backup' });
    expect(parseProvisionRequest({ step: 'power-apply', confirmToken: 'abc_DEF-1' })).toEqual({ step: 'power-apply', confirmToken: 'abc_DEF-1' });
  });

  it('refuses an unknown step, an extra key (a path or a command), a bad shape and an oversized value', () => {
    const bad: unknown[] = [
      null, 'status', [], {}, { step: 'nope' }, { step: 'status', path: 'C:/x' }, { step: 'provision', command: 'dir' }, { step: 'restart', service: 'x' },
      { step: 'tunnel-preview', hostname: 'bad host', acceptUnverifiedReachability: true }, { step: 'tunnel-preview', hostname: '../x', acceptUnverifiedReachability: true }, { step: 'tunnel-preview', hostname: HOST },
      { ...TUNNEL_APPLY, connectorToken: 'short' }, { ...TUNNEL_APPLY, connectorToken: 5 }, { ...TUNNEL_APPLY, confirmToken: 'a b' }, { ...TUNNEL_APPLY, acknowledgement: 'x'.repeat(129) }, { ...TUNNEL_APPLY, folder: 'C:/x' },
      { step: 'oidc', clientId: 'has space', clientSecret: 'longenough', redirectOrigin: 'https://a.example.com' }, { step: 'oidc', clientId: 'x', clientSecret: 'short', redirectOrigin: 'https://a.example.com' },
      { step: 'backup', passphrase: 'p', intervalHours: 0 }, { step: 'backup', passphrase: 'p', intervalHours: 1.5 }, { step: 'backup', passphrase: 'p', intervalHours: 24, folder: 'C:/x' }, { step: 'backup', passphrase: '', intervalHours: 24 },
      { step: 'power-apply' }, { step: 'standby-apply', confirmToken: '' }, { step: 'standby-apply', confirmToken: 'tok', deviceId: DEVICE_ID },
    ];
    for (const value of bad) expect(parseProvisionRequest(value), JSON.stringify(value)).toBeNull();
  });
});

describe('provision IPC handlers', () => {
  const own = { id: 'own' };
  const foreign = { id: 'foreign' };
  const window = { webContents: { ...own, isDestroyed: () => false, send: (...args: unknown[]) => { mock.sent.push(args); } }, isDestroyed: () => false } as any;
  type Handler = (event: { sender: unknown }, ...args: unknown[]) => Promise<any>;
  const call = (channel: string, sender: unknown, ...args: unknown[]) => (mock.handlers.get(channel) as Handler)({ sender }, ...args);
  const CHANNELS = ['dude:hub:provisionOpen', 'dude:hub:provisionStep', 'dude:hub:provisionChooseBackupFolder', 'dude:hub:provisionClose'];

  const mount = () => {
    mock.handlers.clear();
    mock.sent.length = 0;
    const t = setupProvision();
    const sender = window.webContents;
    registerProvisionHandlers(window, () => ({ call: async () => ({ deviceId: DEVICE_ID }) }) as never, t.deps, (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'password' || k === 'secret' ? undefined : x))));
    return { t, sender };
  };

  it('registers exactly the four allowlisted channels and pushes progress on the fifth, to this window only', async () => {
    const { sender } = mount();
    expect([...mock.handlers.keys()].sort()).toEqual([...CHANNELS].sort());
    expect((await call('dude:hub:provisionOpen', sender)).ok).toBe(true);
    expect(mock.sent.every(([channel]) => channel === 'dude:hub:provisionProgress')).toBe(true);
    expect(mock.sent.length).toBeGreaterThan(0);
  });

  it('rejects a foreign sender before anything runs, and invalid arguments or requests with bad-request', async () => {
    const { t, sender } = mount();
    for (const channel of CHANNELS) expect(await call(channel, foreign, { step: 'status' })).toEqual({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    for (const [channel, args] of [
      ['dude:hub:provisionOpen', [1]], ['dude:hub:provisionClose', ['x']], ['dude:hub:provisionChooseBackupFolder', ['C:/Backups']],
      ['dude:hub:provisionStep', []], ['dude:hub:provisionStep', [{ step: 'status' }, 1]], ['dude:hub:provisionStep', [{ step: 'nope' }]], ['dude:hub:provisionStep', [{ step: 'status', path: 'C:/x' }]],
    ] as Array<[string, unknown[]]>) expect(await call(channel, sender, ...args), `${channel} ${JSON.stringify(args)}`).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    expect(t.elevated).toEqual([]);
  });

  it('turns a controller error into a code and a message, never a throw, and a session-less step into no-session', async () => {
    const { sender } = mount();
    expect(await call('dude:hub:provisionStep', sender, { step: 'provision' })).toEqual({ ok: false, error: { code: 'no-session', message: 'There is no open elevated session. Start the wizard again.' } });
    expect(await call('dude:hub:provisionClose', sender)).toEqual({ ok: true, result: { closed: false } });
  });

  it('keeps the module free of logging', () => {
    const source = readFileSync(resolve(__dirname, 'hub-provision.ts'), 'utf-8');
    expect(source).not.toMatch(/console\./);
  });
});
