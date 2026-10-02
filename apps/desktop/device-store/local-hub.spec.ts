const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/ud', isPackaged: false, getVersion: () => '0.0.0' },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { ELEVATE_SCRIPT, findHubInstall, isNewerVersion, registerLocalHubHandlers, runElevated } from './local-hub';
import type { ExecFn, LocalHubDeps } from './local-hub';

const own = { id: 'own' };
const window = { webContents: own } as any;
const SID = 'S-1-5-21-111-222-333-1001';
const SECRET = 'a long secret password';
const HANDOFF_TOKEN = 'T'.repeat(43);
type Handler = (event: { sender: unknown }, ...args: unknown[]) => Promise<any>;
const call = (channel: string, sender: unknown, ...args: unknown[]) => (mock.handlers.get(channel) as Handler)({ sender }, ...args);

interface Recorded { file: string; args: readonly string[]; env?: Record<string, string> }

function setup(options: { elevatedExit?: number; installed?: boolean; registry?: string; packaged?: boolean; hubVersion?: string; bundled?: string; probes?: string[]; resources?: string } = {}) {
  mock.handlers.clear();
  const execs: Recorded[] = [];
  const agent: Array<{ method: string; params: any }> = [];
  const probes = [...(options.probes ?? [])];
  const exec: ExecFn = async (file, args, opts) => {
    execs.push({ file, args, env: opts?.env });
    if (file === 'whoami') return { stdout: `"PC\\me","${SID}"\r\n`, code: 0 };
    if (file === 'reg.exe') return options.registry ? { stdout: `\r\nHKEY_LOCAL_MACHINE\\Software\\DUDE\\Hub\r\n    InstallDir    REG_SZ    ${options.registry}\r\n`, code: 0 } : { stdout: '', code: 1 };
    return { stdout: '', code: options.elevatedExit ?? 0 };
  };
  const deps: Partial<LocalHubDeps> = {
    platform: 'win32', env: { ProgramFiles: 'C:\\Program Files', ProgramData: 'C:\\ProgramData' }, isPackaged: () => options.packaged ?? true, resourcesPath: () => options.resources ?? 'C:\\Program Files\\DUDE\\resources',
    appVersion: () => options.bundled ?? '0.2.0', exists: (f) => (options.installed ?? true) && /(dude-hub|DUDE-Hub-Setup)\.exe$/.test(f), exec, randomBytes: (n) => Buffer.alloc(n, 1),
    updateWaitMs: 2_000, sleep: async () => undefined,
  };
  const host = {
    call: async (method: string, params: unknown) => {
      agent.push({ method, params });
      if (method === 'hub.probeLocal') return { found: true, bootstrapped: true, hubInstanceId: 'h', spkiSha256: 's', compatibility: 'compatible', hubVersion: probes.length > 1 ? probes.shift() : (probes[0] ?? options.hubVersion ?? '0.1.0') };
      if (method === 'hub.bootstrapLocal') {
        return { recoveryCodes: ['AAAA-BBBB'], token: HANDOFF_TOKEN, status: { state: 'online', lastError: null, lastContactAt: null, ownerSignedIn: true, hubVersion: '0.1.0', recoveryTrusted: false, enrollment: null } };
      }
      return { ok: true };
    },
  } as unknown as DeviceStoreHost;
  registerLocalHubHandlers(window, () => host, deps, { toStatus: (s) => ({ enrollmentState: 'enrolled', hubUrl: null, environmentId: null, hubInstanceId: null, hubVersion: s.hubVersion, reachable: true }), scrub: (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'token' ? undefined : x))) });
  return { execs, agent };
}

describe('isNewerVersion', () => {
  it('compares major.minor.patch and ignores unparsable input', () => {
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false);
    expect(isNewerVersion('x', '0.1.0')).toBe(false);
  });
});

describe('elevation', () => {
  it('passes the file and arguments through the environment, never through the script or the command line', async () => {
    const seen: Recorded[] = [];
    const exec: ExecFn = async (file, args, options) => { seen.push({ file, args, env: options?.env }); return { stdout: '', code: 0 }; };
    await runElevated(exec, 'C:\\Program Files\\DUDE Hub\\dude-hub.exe', ['setup-token', '--nonce', 'n"; calc; "']);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.file).toBe('powershell.exe');
    expect(seen[0]!.args).toEqual(['-NoProfile', '-NonInteractive', '-Command', ELEVATE_SCRIPT]);
    expect(ELEVATE_SCRIPT).not.toContain('dude-hub');
    expect(seen[0]!.args.join(' ')).not.toContain('calc');
    expect(seen[0]!.env).toEqual({ DUDE_ELEVATE_FILE: 'C:\\Program Files\\DUDE Hub\\dude-hub.exe', DUDE_ELEVATE_ARGS: JSON.stringify(['setup-token', '--nonce', 'n"; calc; "']) });
    expect(ELEVATE_SCRIPT).toContain('-Verb RunAs');
    expect(ELEVATE_SCRIPT).toContain('-Wait');
  });

  it('maps UAC cancel, start failure and a failing command', async () => {
    const run = (code: number) => runElevated(async () => ({ stdout: '', code }), 'x.exe', []);
    await expect(run(1223)).rejects.toMatchObject({ code: 'elevation-cancelled' });
    await expect(run(9009)).rejects.toMatchObject({ code: 'elevation-failed' });
    await expect(run(2)).rejects.toMatchObject({ code: 'command-failed' });
    await expect(runElevated(async () => { throw new Error('spawn'); }, 'x.exe', [])).rejects.toBeInstanceOf(DeviceStoreError);
  });
});

describe('findHubInstall', () => {
  const base = { platform: 'win32', env: { ProgramFiles: 'C:\\Program Files' }, exists: (f: string) => f.endsWith('dude-hub.exe') } as unknown as LocalHubDeps;
  it('uses the registry InstallDir only under a Program Files root, with correctly escaped key segments', async () => {
    const calls: Array<readonly string[]> = [];
    const exec: ExecFn = async (_f, args) => { calls.push(args); return { stdout: '    InstallDir    REG_SZ    D:\\evil\r\n', code: 0 }; };
    expect(await findHubInstall({ ...base, exec })).toBe('C:\\Program Files\\DUDE Hub');
    expect(calls[0]).toEqual(['query', 'HKLM\\Software\\DUDE\\Hub', '/v', 'InstallDir']);
    const good: ExecFn = async () => ({ stdout: '    InstallDir    REG_SZ    C:\\Program Files\\Custom Hub\r\n', code: 0 });
    expect(await findHubInstall({ ...base, exec: good })).toBe('C:\\Program Files\\Custom Hub');
  });
  it('is null when nothing is installed', async () => {
    expect(await findHubInstall({ ...base, exists: () => false, exec: async () => ({ stdout: '', code: 1 }) })).toBeNull();
  });
});

describe('local hub handlers', () => {
  it('reports info including bundled version and update availability', async () => {
    setup({ hubVersion: '0.1.0', bundled: '0.2.0' });
    expect(await call('dude:hub:localHubInfo', own)).toEqual({
      ok: true, result: { installed: true, installDir: 'C:\\Program Files\\DUDE Hub', found: true, bootstrapped: true, hubVersion: '0.1.0', bundledHubVersion: '0.2.0', updateAvailable: true },
    });
    setup({ hubVersion: '0.2.0', bundled: '0.2.0', packaged: false });
    expect(await call('dude:hub:localHubInfo', own)).toMatchObject({ ok: true, result: { bundledHubVersion: null, updateAvailable: false } });
    setup({ installed: false });
    expect(await call('dude:hub:localHubInfo', own)).toMatchObject({ ok: true, result: { installed: false, installDir: null, updateAvailable: false } });
  });

  it('rejects foreign senders before anything runs', async () => {
    const { execs, agent } = setup();
    for (const channel of ['dude:hub:localHubInfo', 'dude:hub:setupLocalHub', 'dude:hub:updateLocalHub']) {
      expect(await call(channel, { id: 'foreign' }, { environmentName: 'a', ownerDisplayName: 'b', password: SECRET })).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    }
    expect(execs).toEqual([]);
    expect(agent).toEqual([]);
  });

  it('sets up: elevates the installed exe with the SID and nonce, then hands only the nonce to the agent; no token reaches the renderer', async () => {
    const { execs, agent } = setup();
    const result = await call('dude:hub:setupLocalHub', own, { environmentName: 'Home', ownerDisplayName: 'Me', password: SECRET });
    expect(result).toMatchObject({ ok: true, result: { recoveryCodes: ['AAAA-BBBB'], status: { hubVersion: '0.1.0' } } });
    expect(JSON.stringify(result)).not.toContain(HANDOFF_TOKEN);
    const elevated = execs.find((e) => e.file === 'powershell.exe')!;
    const nonce = Buffer.alloc(24, 1).toString('base64url');
    expect(elevated.env).toEqual({
      DUDE_ELEVATE_FILE: 'C:\\Program Files\\DUDE Hub\\dude-hub.exe',
      DUDE_ELEVATE_ARGS: JSON.stringify(['setup-token', '--data-dir', 'C:\\ProgramData\\DUDE\\Hub', '--deliver-to', SID, '--nonce', nonce]),
    });
    expect(elevated.args.join(' ')).not.toContain(SID);
    expect(JSON.stringify(execs)).not.toContain(SECRET);
    expect(agent.find((a) => a.method === 'hub.bootstrapLocal')!.params).toEqual({ nonce, environmentName: 'Home', ownerDisplayName: 'Me', password: SECRET });
  });

  it('maps UAC cancel and not-installed without reaching the agent', async () => {
    const cancelled = setup({ elevatedExit: 1223 });
    expect(await call('dude:hub:setupLocalHub', own, { environmentName: 'Home', ownerDisplayName: 'Me', password: SECRET })).toMatchObject({ ok: false, error: { code: 'elevation-cancelled' } });
    expect(cancelled.agent.some((a) => a.method === 'hub.bootstrapLocal')).toBe(false);
    const failed = setup({ elevatedExit: 2 });
    expect(await call('dude:hub:setupLocalHub', own, { environmentName: 'Home', ownerDisplayName: 'Me', password: SECRET })).toMatchObject({ ok: false, error: { code: 'setup-token-failed' } });
    expect(failed.agent).toEqual([]);
    setup({ installed: false });
    expect(await call('dude:hub:setupLocalHub', own, { environmentName: 'Home', ownerDisplayName: 'Me', password: SECRET })).toMatchObject({ ok: false, error: { code: 'not-installed' } });
  });

  it('updates by elevating the bundled Hub installer in /UPDATE mode, then re-probes', async () => {
    const { execs } = setup({ probes: ['0.1.0', '0.2.0'], bundled: '0.2.0' });
    const result = await call('dude:hub:updateLocalHub', own);
    expect(result).toEqual({ ok: true, result: { fromVersion: '0.1.0', toVersion: '0.2.0' } });
    const elevated = execs.find((e) => e.file === 'powershell.exe')!;
    expect(elevated.env).toEqual({
      DUDE_ELEVATE_FILE: 'C:\\Program Files\\DUDE\\resources\\DUDE-Hub-Setup.exe',
      DUDE_ELEVATE_ARGS: JSON.stringify(['/S', '/UPDATE']),
    });
  });

  it('maps an installer failure (exit 3) to update-failed', async () => {
    setup({ probes: ['0.1.0'], bundled: '0.2.0', elevatedExit: 3 });
    expect(await call('dude:hub:updateLocalHub', own)).toMatchObject({ ok: false, error: { code: 'update-failed' } });
  });

  it('refuses to update in dev builds or when nothing newer is bundled', async () => {
    const dev = setup({ packaged: false });
    expect(await call('dude:hub:updateLocalHub', own)).toMatchObject({ ok: false, error: { code: 'unsupported-in-dev' } });
    expect(dev.execs.some((e) => e.file === 'powershell.exe')).toBe(false);
    setup({ hubVersion: '0.2.0', bundled: '0.2.0' });
    expect(await call('dude:hub:updateLocalHub', own)).toMatchObject({ ok: false, error: { code: 'no-update' } });
  });

  it('never elevates a bundled Hub installer from a user-writable per-user install', async () => {
    const perUser = setup({ hubVersion: '0.1.0', bundled: '0.2.0', resources: 'C:\\Users\\me\\AppData\\Local\\Programs\\DUDE\\resources' });
    expect(await call('dude:hub:localHubInfo', own)).toMatchObject({ ok: true, result: { bundledHubVersion: null, updateAvailable: false } });
    expect(await call('dude:hub:updateLocalHub', own)).toMatchObject({ ok: false });
    expect(perUser.execs.some((e) => e.file === 'powershell.exe')).toBe(false);
  });

  it('allows one operation at a time', async () => {
    mock.handlers.clear();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const exec: ExecFn = async (file) => { if (file === 'powershell.exe') await gate; return file === 'whoami' ? { stdout: `"a","${SID}"`, code: 0 } : { stdout: '', code: 0 }; };
    const host = { call: async () => ({ recoveryCodes: [], status: { hubVersion: null } }) } as unknown as DeviceStoreHost;
    registerLocalHubHandlers(window, () => host, { platform: 'win32', env: {}, exists: () => true, exec, randomBytes: (n) => Buffer.alloc(n) }, { toStatus: () => ({}) as never, scrub: (v) => v });
    const request = { environmentName: 'Home', ownerDisplayName: 'Me', password: SECRET };
    const first = call('dude:hub:setupLocalHub', own, request);
    await new Promise((r) => setTimeout(r, 10));
    expect(await call('dude:hub:setupLocalHub', own, request)).toMatchObject({ ok: false, error: { code: 'busy' } });
    release();
    expect(await first).toMatchObject({ ok: true });
  });
});
