import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/ud', isPackaged: false },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import type { AgentHubStatus, AgentHubStatusEvent } from '@dude/contracts';
import type { DesktopHubBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import type { LocalHubDeps } from './local-hub';
import { nativeHandleString, registerHubHandlers, scrubCredentials, toDesktopStatus } from './hub-bridge';
import type { ConsentOutcome } from './user-consent';

const own = { id: 'own', send: vi.fn(), isDestroyed: () => false };
const foreign = { id: 'foreign' };
const window = { webContents: own, isDestroyed: () => false, getNativeWindowHandle: () => { const b = Buffer.alloc(8); b.writeBigUInt64LE(0x1234n); return b; } } as any;

const UUID = '0190aaaa-0000-7000-8000-000000000001';
const TOKEN = 'abcDEF_-123';
const PAIRING = 'dude-pair:v1:hub.local:47600:ABCD2345:AAAA';

const ENROLLED: AgentHubStatus = {
  state: 'online', lastError: null, lastContactAt: null, ownerSignedIn: false, hubVersion: '0.1.0', recoveryTrusted: true, pendingOps: 0,
  enrollment: {
    state: 'enrolled', hubInstanceId: 'hub-1', environmentId: 'env-1', hubUrl: 'https://hub.local:47600', protocolVersion: 1,
    spkiActive: 'x', spkiNext: null, enrolledAt: '2026-01-01T00:00:00.000Z', lastContactAt: null, revokedAt: null,
  },
};

type Handler = (event: { sender: unknown }, ...args: unknown[]) => Promise<any>;
const call = (channel: string, sender: unknown, ...args: unknown[]) => (mock.handlers.get(channel) as Handler)({ sender }, ...args);

// Every bridge method with a valid argument list; `satisfies` makes tsc fail when the type gains or loses a method.
const VALID: Record<Exclude<keyof DesktopHubBridge, 'onStatusChanged'>, { channel: string; args: unknown[]; invalid: unknown[][] }> = {
  status: { channel: 'dude:hub:status', args: [], invalid: [[1]] },
  probeLocal: { channel: 'dude:hub:probeLocal', args: [47600], invalid: [['47600'], [0], [70000], [1.5], [1, 2]] },
  reachabilityEcho: { channel: 'dude:hub:reachabilityEcho', args: ['https://hub.example.com'], invalid: [[], [1], ['http://hub.example.com'], ['https://u:p@hub.example.com'], ['https://hub.example.com/path'], ['https://hub.example.com?x=1'], ['https://hub.example.com#f'], ['https://hub.example.com:0'], ['https://hub.example.com', 'x']] },
  enroll: { channel: 'dude:hub:enroll', args: [PAIRING], invalid: [[], ['x'], ['https://evil'], ['dude-pair:v1:' + 'a'.repeat(512)], [PAIRING, 1]] },
  unenroll: { channel: 'dude:hub:unenroll', args: [true], invalid: [['yes'], [1], [true, true]] },
  ownerStatus: { channel: 'dude:hub:owner:status', args: [], invalid: [[1]] },
  ownerSignIn: { channel: 'dude:hub:owner:signIn', args: ['pw'], invalid: [[], [''], ['a'.repeat(1025)], [1], ['a', 'b']] },
  ownerSignOut: { channel: 'dude:hub:owner:signOut', args: [], invalid: [[1]] },
  listDevices: { channel: 'dude:hub:owner:listDevices', args: [], invalid: [[1]] },
  syncSummary: { channel: 'dude:hub:owner:syncSummary', args: [], invalid: [[1]] },
  diagnostics: { channel: 'dude:hub:owner:diagnostics', args: [], invalid: [[1]] },
  agentDiagnostics: { channel: 'dude:hub:agentDiagnostics', args: [], invalid: [[1]] },
  createPairingCode: { channel: 'dude:hub:owner:createPairingCode', args: ['hub.local'], invalid: [[1], ['bad host'], ['a'.repeat(256)]] },
  renameDevice: { channel: 'dude:hub:owner:renameDevice', args: [UUID, 'Desk'], invalid: [[], ['nope', 'Desk'], [UUID, ''], [UUID, 5], [UUID, 'Desk', 'x']] },
  revokeDevicePreview: { channel: 'dude:hub:owner:revokeDevicePreview', args: [UUID], invalid: [[], ['../x'], [1]] },
  revokeDevice: { channel: 'dude:hub:owner:revokeDevice', args: [UUID, TOKEN], invalid: [[UUID], [UUID, 'a b'], [UUID, 'a'.repeat(129)], ['x', TOKEN]] },
  setRecoveryTrust: { channel: 'dude:hub:owner:setRecoveryTrust', args: [UUID, 'pw', true], invalid: [[UUID, 'pw'], [UUID, 'pw', 'true'], [UUID, '', true], ['x', 'pw', true]] },
  listSessions: { channel: 'dude:hub:owner:listSessions', args: [], invalid: [[1]] },
  revokeSession: { channel: 'dude:hub:owner:revokeSession', args: ['0123456789abcdef'], invalid: [[], ['ZZZZZZZZZZZZZZZZ'], ['abc'], [1]] },
  revokeAllPreview: { channel: 'dude:hub:owner:revokeAllPreview', args: [], invalid: [[1]] },
  revokeAll: { channel: 'dude:hub:owner:revokeAll', args: [TOKEN], invalid: [[], ['a b'], [1]] },
  listAudit: { channel: 'dude:hub:owner:listAudit', args: [10], invalid: [['10'], [-1], [1.5], [1, 2]] },
  listSecurityAlerts: { channel: 'dude:hub:owner:listSecurityAlerts', args: [], invalid: [[1]] },
  markSecurityAlertsSeen: { channel: 'dude:hub:owner:markSecurityAlertsSeen', args: [12], invalid: [[], ['12'], [-1], [1.5], [1, 2]] },
  recoveryCodesPreview: { channel: 'dude:hub:owner:recoveryCodesPreview', args: [], invalid: [[1]] },
  regenerateRecoveryCodes: { channel: 'dude:hub:owner:regenerateRecoveryCodes', args: [TOKEN], invalid: [[], ['a b'], [{}]] },
  recoverOwner: { channel: 'dude:hub:recoverOwner', args: ['a recovered long password'], invalid: [[], [''], ['short'], ['a'.repeat(1025)], [1], ['a recovered long password', 'x']] },
  localHubInfo: { channel: 'dude:hub:localHubInfo', args: [], invalid: [[1]] },
  setupLocalHub: {
    channel: 'dude:hub:setupLocalHub', args: [{ environmentName: 'Home', ownerDisplayName: 'Me', password: 'a long password!' }],
    invalid: [[], ['x'], [{}], [{ environmentName: 'Home', ownerDisplayName: 'Me', password: 'short' }], [{ environmentName: '', ownerDisplayName: 'Me', password: 'a long password!' }],
      [{ environmentName: 'Home', ownerDisplayName: 'Me', password: 'a long password!', token: 'x' }], [{ environmentName: 'Home', ownerDisplayName: 'Me', password: 'a long password!' }, 1]],
  },
  updateLocalHub: { channel: 'dude:hub:updateLocalHub', args: [], invalid: [[1]] },
  openWeb: { channel: 'dude:hub:openWeb', args: [], invalid: [['https://evil.example/'], [1]] },
  rootCertificatePreview: { channel: 'dude:hub:rootCertificate:preview', args: [], invalid: [[1]] },
  installRootCertificate: { channel: 'dude:hub:rootCertificate:install', args: ['abcdefghijklmnop'], invalid: [[], [''], ['short'], ['a b c d e f g h i j k l'], [1], ['abcdefghijklmnop', 'x']] },
  changePassword: { channel: 'dude:hub:owner:changePassword', args: ['old', 'new'], invalid: [['old'], ['', 'new'], ['old', ''], [1, 2]] },
};

function fakeHost(handler: (method: string, params: unknown) => unknown = () => ({ ok: true })) {
  const calls: Array<{ method: string; params: unknown }> = [];
  const listeners = new Set<(e: AgentHubStatusEvent) => void>();
  const host = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      const out = handler(method, params);
      if (out instanceof Error) throw out;
      return out;
    },
    onEvent: (l: (e: AgentHubStatusEvent) => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  } as unknown as DeviceStoreHost;
  return { host, calls, push: (status: AgentHubStatus) => listeners.forEach((l) => l({ type: 'event', event: 'hub.status', status })) };
}

const SID = 'S-1-5-21-111-222-333-1001';
const localDeps = (): Partial<LocalHubDeps> => ({
  platform: 'win32', env: { ProgramFiles: 'C:\\Program Files', ProgramData: 'C:\\ProgramData' }, isPackaged: () => true, resourcesPath: () => 'C:\\Program Files\\DUDE\\resources', appVersion: () => '0.2.0',
  exists: () => true, randomBytes: (n) => Buffer.alloc(n, 7), updateWaitMs: 0, sleep: async () => undefined,
  exec: async (file) => (file === 'whoami' ? { stdout: `"PC\\me","${SID}"
`, code: 0 } : file === 'reg.exe' ? { stdout: '', code: 1 } : { stdout: '', code: 0 }),
});

describe('hub bridge', () => {
  let ctx: ReturnType<typeof fakeHost>;
  let consentCalls: Array<{ hwnd: string; message: string }> = [];
  let consentOutcome: ConsentOutcome | Error = { status: 'verified', method: 'hello' };
  const setup = (handler?: (method: string, params: unknown) => unknown) => {
    mock.handlers.clear();
    own.send.mockClear();
    ctx = fakeHost(handler);
    consentCalls = [];
    consentOutcome = { status: 'verified', method: 'hello' };
    registerHubHandlers(window, () => ctx.host, async (hwnd, message) => {
      consentCalls.push({ hwnd, message });
      if (consentOutcome instanceof Error) throw consentOutcome;
      return consentOutcome;
    }, localDeps(), { platform: 'win32', openExternal: async () => undefined });
  };
  beforeEach(() => setup());

  it('registers exactly one channel per bridge method', () => {
    expect([...mock.handlers.keys()].sort()).toEqual(Object.values(VALID).map((v) => v.channel).sort());
  });

  it.each(Object.entries(VALID))('%s rejects a foreign sender before the agent', async (_name, v) => {
    const result = await call(v.channel, foreign, ...v.args);
    expect(result).toEqual({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    expect(ctx.calls).toEqual([]);
  });

  it.each(Object.entries(VALID))('%s rejects invalid payloads before the agent', async (_name, v) => {
    for (const args of v.invalid) {
      const result = await call(v.channel, own, ...args);
      expect(result, JSON.stringify(args)).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    }
    expect(ctx.calls).toEqual([]);
  });

  // The install step needs a token from a preview; its boundary is covered in hub-web-bridge.confirmation-boundary.spec.ts.
  it.each(Object.entries(VALID).filter(([name]) => name !== 'installRootCertificate'))('%s forwards valid payloads from this window', async (_name, v) => {
    setup((method) => (method === 'hub.status' || method === 'hub.enroll' ? ENROLLED : method === 'hub.probeLocal' ? { found: true, bootstrapped: true, hubInstanceId: 'h', spkiSha256: 's', compatibility: 'compatible', hubVersion: '0.1.0' }
      : method === 'hub.bootstrapLocal' ? { recoveryCodes: ['A'], status: ENROLLED }
      : method === 'hub.unenroll' ? { ok: true, hubStillListsDevice: false } : method === 'hub.owner.status' || method === 'hub.owner.signIn' ? { signedIn: true, displayName: 'O', expiresAt: null }
      : method === 'store.hydrate' ? { device: { deviceId: UUID } } : { ok: true }));
    const result = await call(v.channel, own, ...v.args);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(ctx.calls.length).toBeGreaterThan(0);
  });

  describe('recoverOwner (PD-029)', () => {
    const PW = 'a recovered long password';
    it('never reaches the agent when the presence check does not verify', async () => {
      consentOutcome = { status: 'unavailable' };
      expect(await call('dude:hub:recoverOwner', own, PW)).toMatchObject({ ok: false, error: { code: 'unavailable' } });
      consentOutcome = new Error('boom');
      expect(await call('dude:hub:recoverOwner', own, PW)).toMatchObject({ ok: false, error: { code: 'not-verified' } });
      consentOutcome = { status: 'denied', reason: 'canceled' };
      expect(await call('dude:hub:recoverOwner', own, PW)).toMatchObject({ ok: false, error: { code: 'not-verified' } });
      expect(ctx.calls).toEqual([]);
    });

    it('calls the agent exactly once after a verified presence check, with the window handle and the fixed message', async () => {
      const result = await call('dude:hub:recoverOwner', own, PW);
      expect(result).toEqual({ ok: true, result: { ok: true } });
      expect(consentCalls).toEqual([{ hwnd: '4660', message: "Confirm it's you to reset the DUDE Hub owner password" }]);
      expect(ctx.calls).toEqual([{ method: 'hub.recoverOwner', params: { newPassword: PW } }]);
    });

    it('maps agent errors and never asks consent for a foreign sender or an invalid payload', async () => {
      setup((method) => (method === 'hub.recoverOwner' ? new DeviceStoreError('not-trusted', 'The Hub does not trust this device for owner recovery.') : { ok: true }));
      expect(await call('dude:hub:recoverOwner', own, PW)).toEqual({ ok: false, error: { code: 'not-trusted', message: 'The Hub does not trust this device for owner recovery.' } });
      await call('dude:hub:recoverOwner', foreign, PW);
      await call('dude:hub:recoverOwner', own, 'short');
      expect(consentCalls).toHaveLength(1);
    });

    it('allows one confirmation at a time', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      mock.handlers.clear();
      ctx = fakeHost();
      registerHubHandlers(window, () => ctx.host, async () => { await gate; return { status: 'verified', method: 'hello' }; });
      const first = call('dude:hub:recoverOwner', own, PW);
      expect(await call('dude:hub:recoverOwner', own, PW)).toMatchObject({ ok: false, error: { code: 'busy' } });
      release();
      expect(await first).toMatchObject({ ok: true });
      expect(ctx.calls).toHaveLength(1);
    });

    it('reads the native handle as a little-endian pointer-size integer', () => {
      const wide = Buffer.alloc(8); wide.writeBigUInt64LE(0x0000_0002_0000_00ffn);
      expect(nativeHandleString(wide)).toBe('8589934847');
      const narrow = Buffer.alloc(4); narrow.writeUInt32LE(0x1234);
      expect(nativeHandleString(narrow)).toBe('4660');
    });
  });

  it('forwards the normalized public origin to the agent and rejects bad addresses with a clear message', async () => {
    setup(() => ({ observed: { scope: 'public', viaProxy: false }, host: 'hub.example.com', hostMatchesConfiguredName: true, verified: true, reason: 'ok', at: 'now', rttMs: 12 }));
    expect(await call('dude:hub:reachabilityEcho', own, 'https://Hub.Example.com:443/')).toMatchObject({ ok: true, result: { verified: true, rttMs: 12 } });
    expect(ctx.calls[0]).toEqual({ method: 'hub.reachabilityEcho', params: { publicUrl: 'https://hub.example.com' } });
    const bad = await call('dude:hub:reachabilityEcho', own, 'http://hub.example.com');
    expect(bad).toEqual({ ok: false, error: { code: 'bad-request', message: expect.stringContaining('https://') } });
    expect(ctx.calls).toHaveLength(1);
  });

  it('accepts omitted optionals (undefined trailing argument)', async () => {
    setup(() => ({ found: false, bootstrapped: null, hubInstanceId: null, spkiSha256: null, compatibility: null }));
    expect(await call('dude:hub:probeLocal', own, undefined)).toMatchObject({ ok: true, result: { found: false, port: null } });
    expect(ctx.calls[0]).toEqual({ method: 'hub.probeLocal', params: {} });
  });

  it('maps agent results to the renderer shapes', async () => {
    setup((m) => (m === 'hub.status' ? ENROLLED : { signedIn: true, displayName: 'Owner', expiresAt: 'e' }));
    expect(await call('dude:hub:status', own)).toEqual({ ok: true, result: { enrollmentState: 'enrolled', hubUrl: 'https://hub.local:47600', environmentId: 'env-1', hubInstanceId: 'hub-1', hubVersion: '0.1.0', recoveryTrusted: true, reachable: true, connection: 'online', lastError: null, lastContactAt: null } });
    expect(await call('dude:hub:owner:status', own)).toEqual({ ok: true, result: { signedIn: true, ownerDisplayName: 'Owner', expiresAt: 'e' } });
    expect(toDesktopStatus({ ...ENROLLED, enrollment: null, state: 'standalone' })).toMatchObject({ enrollmentState: 'standalone', reachable: null });
    expect(toDesktopStatus({ ...ENROLLED, state: 'offline' }).reachable).toBe(false);
  });

  it('maps agent errors without stack traces and hides unknown failures', async () => {
    setup(() => new DeviceStoreError('tls-pin-mismatch', 'The Hub certificate changed.'));
    expect(await call('dude:hub:enroll', own, PAIRING)).toEqual({ ok: false, error: { code: 'tls-pin-mismatch', message: 'The Hub certificate changed.' } });
    setup(() => new TypeError('boom at C:\\secret\\file.ts:12'));
    const result = await call('dude:hub:status', own);
    expect(result).toEqual({ ok: false, error: { code: 'internal', message: 'The Hub request failed.' } });
    expect(JSON.stringify(result)).not.toMatch(/secret|boom|\.ts/);
  });

  it('reports unavailable when no agent host exists', async () => {
    mock.handlers.clear();
    registerHubHandlers(window, () => null);
    expect(await call('dude:hub:status', own)).toMatchObject({ ok: false, error: { code: 'unavailable' } });
  });

  it('never returns credential-like keys, whatever the agent sends', async () => {
    setup(() => ({ items: [{ deviceId: UUID, accessToken: 'a', nested: { privateKey: 'k', wrapped: 'w', token: 't', keep: 1 } }], token: 'x', confirmToken: 'c' }));
    const result = await call('dude:hub:owner:listDevices', own);
    expect(JSON.stringify(result)).not.toMatch(/accessToken|privateKey|wrapped|"token"/);
    expect(result.result).toEqual({ items: [{ deviceId: UUID, nested: { keep: 1 } }], confirmToken: 'c' });
  });

  it('scrubCredentials is case-insensitive and tolerates deep or primitive input', () => {
    expect(scrubCredentials({ AccessToken: 1, a: [{ PrivateKey: 2, ok: 3 }] })).toEqual({ a: [{ ok: 3 }] });
    expect(scrubCredentials('x')).toBe('x');
    expect(scrubCredentials(null)).toBeNull();
  });

  it('pushes status changes to this window only, scrubbed and mapped', () => {
    ctx.push(ENROLLED);
    expect(own.send).toHaveBeenCalledWith('dude:hub:statusChanged', expect.objectContaining({ enrollmentState: 'enrolled', reachable: true }));
    expect(JSON.stringify(own.send.mock.calls)).not.toMatch(/spkiActive|enrollment"/);
  });

  it('never logs payloads', () => {
    const source = readFileSync(resolve(__dirname, 'hub-bridge.ts'), 'utf-8');
    expect(source).not.toMatch(/console\./);
  });
});

describe('preload hub surface', () => {
  const preload = readFileSync(resolve(__dirname, '..', 'preload.ts'), 'utf-8');
  const block = preload.slice(preload.indexOf('  hub: {'), preload.indexOf('  sync: {'));

  it('exposes exactly the DesktopHubBridge methods, each on its own channel, with no generic invoke', () => {
    const keys = [...block.matchAll(/^    (\w+): /gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...Object.keys(VALID), 'onStatusChanged'].sort());
    const channels = [...block.matchAll(/ipcRenderer\.invoke\('(dude:hub:[\w:]+)'/g)].map((m) => m[1]);
    expect(channels.sort()).toEqual(Object.values(VALID).map((v) => v.channel).sort());
    expect(block).toMatch(/ipcRenderer\.on\('dude:hub:statusChanged'/);
    expect(block).not.toMatch(/invoke:\s|ipcRenderer\.invoke\([a-z]/);
  });
});
