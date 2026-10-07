const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
  shell: { openExternal: vi.fn() },
}));

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { X509Certificate } from 'node:crypto';
import type { AgentHubStatus } from '@dude/contracts';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { ROOT_CERT_TOKEN_TTL_MS, registerHubWebHandlers, sha256Fingerprint } from './hub-web-bridge';
import type { HubWebDeps } from './hub-web-bridge';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../__fixtures__/tls', name), 'utf8');
const ROOT_PEM = fixture('root.pem');
const LEAF_PEM = fixture('leaf.pem');

const own = { id: 'own' };
const foreign = { id: 'foreign' };
const window = { webContents: own, isDestroyed: () => false } as any;
type Handler = (event: { sender: unknown }, ...args: unknown[]) => Promise<any>;
const call = (channel: string, sender: unknown, ...args: unknown[]) => (mock.handlers.get(channel) as Handler)({ sender }, ...args);

const enrolled = (hubUrl: string, state: 'enrolled' | 'revoked' = 'enrolled'): AgentHubStatus => ({
  state: 'online', lastError: null, lastContactAt: null, ownerSignedIn: false, hubVersion: '0.1.0', recoveryTrusted: false, pendingOps: 0,
  enrollment: {
    state, hubInstanceId: 'hub-1', environmentId: 'env-1', hubUrl, protocolVersion: 1, spkiActive: 'x', spkiNext: null,
    enrolledAt: '2026-01-01T00:00:00.000Z', lastContactAt: null, revokedAt: null,
  },
});
const certs = (source: 'local-ca' | 'self-signed', caCertPem: string | null) => ({
  active: { spkiSha256: 'a'.repeat(43), certPem: LEAF_PEM }, next: null, source, caCertPem, leafNotAfter: '2027-01-01T00:00:00.000Z',
});

interface Ctx {
  agent: { calls: string[]; status: AgentHubStatus | Error; certs: ReturnType<typeof certs> | Error };
  deps: HubWebDeps & { opened: string[]; execs: Array<{ file: string; args: readonly string[] }>; written: Buffer[]; removed: string[]; clock: { t: number }; execCode: number };
}

function setup(platform: NodeJS.Platform = 'win32', hostPresent = true): Ctx {
  mock.handlers.clear();
  const agent: Ctx['agent'] = { calls: [], status: enrolled('https://hub.local:47600'), certs: certs('local-ca', ROOT_PEM) };
  const clock = { t: 1_000_000 };
  let n = 0;
  const deps = {
    platform, now: () => clock.t, randomToken: () => `token-${String(++n).padStart(20, '0')}`,
    opened: [] as string[], execs: [] as Ctx['deps']['execs'], written: [] as Buffer[], removed: [] as string[], clock, execCode: 0,
    openExternal: async (url: string) => { deps.opened.push(url); },
    exec: async (file: string, args: readonly string[]) => { deps.execs.push({ file, args }); return { code: deps.execCode }; },
    makeTempDir: async () => 'C:\\Temp\\dude-root-x',
    writeFile: async (_path: string, data: Buffer) => { deps.written.push(data); },
    removeDir: async (path: string) => { deps.removed.push(path); },
  } satisfies Partial<HubWebDeps> as Ctx['deps'];
  const host = {
    call: async (method: string) => {
      agent.calls.push(method);
      const out = method === 'hub.status' ? agent.status : method === 'hub.tlsCertificates' ? agent.certs : null;
      if (out instanceof Error) throw out;
      return out;
    },
  } as unknown as DeviceStoreHost;
  registerHubWebHandlers(window, () => (hostPresent ? host : null), deps);
  return { agent, deps };
}

describe('dude:hub:openWeb', () => {
  it('opens only the https Hub URL main resolves itself, and ignores renderer arguments', async () => {
    const { deps, agent } = setup();
    expect(await call('dude:hub:openWeb', own, 'https://evil.example/')).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    expect(deps.opened).toEqual([]);
    expect(agent.calls).toEqual([]);
    expect(await call('dude:hub:openWeb', own)).toEqual({ ok: true, result: { ok: true } });
    expect(deps.opened).toEqual(['https://hub.local:47600/']);
  });

  it('refuses a foreign sender, a non-https Hub URL, a revoked or missing enrollment and a missing agent', async () => {
    const ctx = setup();
    expect(await call('dude:hub:openWeb', foreign)).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    ctx.agent.status = enrolled('http://hub.local:47600');
    expect(await call('dude:hub:openWeb', own)).toMatchObject({ ok: false, error: { code: 'invalid-url' } });
    ctx.agent.status = enrolled('file:///C:/Windows/System32/calc.exe');
    expect(await call('dude:hub:openWeb', own)).toMatchObject({ ok: false, error: { code: 'invalid-url' } });
    ctx.agent.status = enrolled('https://hub.local:47600', 'revoked');
    expect(await call('dude:hub:openWeb', own)).toMatchObject({ ok: false, error: { code: 'not-enrolled' } });
    ctx.agent.status = { ...enrolled('x'), enrollment: null };
    expect(await call('dude:hub:openWeb', own)).toMatchObject({ ok: false, error: { code: 'not-enrolled' } });
    ctx.agent.status = new DeviceStoreError('hub-unreachable', 'down');
    expect(await call('dude:hub:openWeb', own)).toMatchObject({ ok: false, error: { code: 'hub-unreachable' } });
    expect(ctx.deps.opened).toEqual([]);
    expect(await (async () => { setup('win32', false); return call('dude:hub:openWeb', own); })()).toMatchObject({ ok: false, error: { code: 'unavailable' } });
  });
});

describe('Hub root certificate install: confirmation boundary', () => {
  it('previewing returns the fingerprint and a token but never installs anything', async () => {
    const { deps, agent } = setup();
    const preview = await call('dude:hub:rootCertificate:preview', own);
    expect(preview).toMatchObject({ ok: true, result: { available: true, fingerprint: sha256Fingerprint(new X509Certificate(ROOT_PEM).raw), subject: expect.stringContaining('DUDE Test Root') } });
    expect(preview.result.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(agent.calls).toEqual(['hub.tlsCertificates']);
    expect(deps.execs).toEqual([]);
    expect(deps.written).toEqual([]);
  });

  it('installs only after install is called with the token from the latest preview, via certutil without a shell', async () => {
    const { deps } = setup();
    const { result } = await call('dude:hub:rootCertificate:preview', own);
    expect(deps.execs).toEqual([]);
    expect(await call('dude:hub:rootCertificate:install', own, result.confirmToken)).toEqual({ ok: true, result: { installed: true } });
    expect(deps.execs).toEqual([{ file: 'certutil', args: ['-user', '-addstore', 'Root', join('C:\\Temp\\dude-root-x', 'dude-hub-root.cer')] }]);
    expect(deps.written).toHaveLength(1);
    expect(deps.written[0]!.equals(Buffer.from(new X509Certificate(ROOT_PEM).raw))).toBe(true);
    expect(deps.removed).toEqual(['C:\\Temp\\dude-root-x']);
  });

  it('refuses install without a preview, with a wrong, replayed, stale or malformed token, or from another window', async () => {
    const { deps } = setup();
    expect(await call('dude:hub:rootCertificate:install', own, 'token-00000000000000000001')).toMatchObject({ ok: false, error: { code: 'stale-preview' } });
    const first = (await call('dude:hub:rootCertificate:preview', own)).result.confirmToken as string;
    expect(await call('dude:hub:rootCertificate:install', own, 'not-the-token-0000000000')).toMatchObject({ ok: false, error: { code: 'stale-preview' } });
    // A failed attempt spends the preview: even the right token needs a fresh one now.
    expect(await call('dude:hub:rootCertificate:install', own, first)).toMatchObject({ ok: false, error: { code: 'stale-preview' } });
    const second = (await call('dude:hub:rootCertificate:preview', own)).result.confirmToken as string;
    expect(second).not.toBe(first);
    expect(await call('dude:hub:rootCertificate:install', foreign, second)).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    expect(await call('dude:hub:rootCertificate:install', own, 'short')).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    expect(await call('dude:hub:rootCertificate:install', own)).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    expect(await call('dude:hub:rootCertificate:install', own, second, 'extra')).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    expect(deps.execs).toEqual([]);
    expect(await call('dude:hub:rootCertificate:install', own, second)).toMatchObject({ ok: true });
    // Replay of a used token never runs certutil again.
    expect(await call('dude:hub:rootCertificate:install', own, second)).toMatchObject({ ok: false, error: { code: 'stale-preview' } });
    expect(deps.execs).toHaveLength(1);
  });

  it('refuses an expired token', async () => {
    const { deps } = setup();
    const { result } = await call('dude:hub:rootCertificate:preview', own);
    deps.clock.t += ROOT_CERT_TOKEN_TTL_MS + 1;
    expect(await call('dude:hub:rootCertificate:install', own, result.confirmToken)).toMatchObject({ ok: false, error: { code: 'expired' } });
    expect(deps.execs).toEqual([]);
  });

  it('reports a declined or failed certutil run and still removes the temp file', async () => {
    const { deps } = setup();
    deps.execCode = 1;
    const { result } = await call('dude:hub:rootCertificate:preview', own);
    expect(await call('dude:hub:rootCertificate:install', own, result.confirmToken)).toMatchObject({ ok: false, error: { code: 'install-failed' } });
    expect(deps.removed).toEqual(['C:\\Temp\\dude-root-x']);
  });

  it('offers nothing off Windows or for a Hub without a local CA, and rejects a non-CA certificate', async () => {
    const linux = setup('linux');
    expect(await call('dude:hub:rootCertificate:preview', own)).toEqual({ ok: true, result: { available: false, reason: 'unsupported-platform' } });
    expect(linux.agent.calls).toEqual([]);
    expect(await call('dude:hub:rootCertificate:install', own, 'token-00000000000000000001')).toMatchObject({ ok: false, error: { code: 'unsupported-platform' } });

    const win = setup();
    win.agent.certs = certs('self-signed', null);
    expect(await call('dude:hub:rootCertificate:preview', own)).toEqual({ ok: true, result: { available: false, reason: 'not-local-ca' } });
    win.agent.certs = certs('local-ca', null);
    expect(await call('dude:hub:rootCertificate:preview', own)).toEqual({ ok: true, result: { available: false, reason: 'not-local-ca' } });
    win.agent.certs = certs('local-ca', LEAF_PEM);
    expect(await call('dude:hub:rootCertificate:preview', own)).toMatchObject({ ok: false, error: { code: 'invalid-certificate' } });
    win.agent.certs = certs('local-ca', 'not a certificate');
    expect(await call('dude:hub:rootCertificate:preview', own)).toMatchObject({ ok: false, error: { code: 'invalid-certificate' } });
    expect(win.deps.execs).toEqual([]);
  });

  it('a new preview voids the previous token', async () => {
    const { deps } = setup();
    const a = (await call('dude:hub:rootCertificate:preview', own)).result.confirmToken;
    const b = (await call('dude:hub:rootCertificate:preview', own)).result.confirmToken;
    expect(await call('dude:hub:rootCertificate:install', own, a)).toMatchObject({ ok: false, error: { code: 'stale-preview' } });
    expect(deps.execs).toEqual([]);
    void b;
  });
});
