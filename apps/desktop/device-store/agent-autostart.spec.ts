import { autostartCommand, autostartTaskName, configureAgentAutostart, createAgentAutostart, getAgentAutostart, RUN_KEY, RUN_VALUE, setAgentAutostart } from './agent-autostart';
import type { ExecFn, ExecResult } from './agent-autostart';

const EXE = 'C:\\Program Files\\DUDE\\resources\\dude-agent.exe';
const DIR = 'C:\\Users\\me\\AppData\\Roaming\\DUDE\\device-store';

/** A tiny fake of schtasks.exe and reg.exe over an in-memory task/run-key state. */
function fakeSystem(options: { taskDenied?: boolean; runKeyDenied?: boolean } = {}) {
  const state = { task: null as string | null, runKey: null as string | null };
  const calls: Array<{ file: string; args: readonly string[]; options: unknown }> = [];
  const exec: ExecFn = async (file, args, execOptions): Promise<ExecResult> => {
    calls.push({ file, args, options: execOptions });
    const ok = { code: 0, stdout: '' };
    const fail = { code: 1, stdout: '' };
    if (file === 'schtasks.exe') {
      if (args[0] === '/Create') { if (options.taskDenied) return fail; state.task = args[args.indexOf('/TR') + 1]; return ok; }
      if (args[0] === '/Query') return state.task ? ok : fail;
      if (args[0] === '/Delete') { const had = state.task !== null; state.task = null; return had ? ok : fail; }
    }
    if (file === 'reg.exe') {
      if (args[0] === 'add') { if (options.runKeyDenied) return fail; state.runKey = args[args.indexOf('/d') + 1]; return ok; }
      if (args[0] === 'query') return state.runKey ? ok : fail;
      if (args[0] === 'delete') { const had = state.runKey !== null; state.runKey = null; return had ? ok : fail; }
    }
    return fail;
  };
  return { exec, state, calls };
}

describe('agent autostart', () => {
  it('builds the quoted command and a stable per-store task name', () => {
    expect(autostartCommand(EXE, DIR)).toBe(`"${EXE}" --store-dir "${DIR}"`);
    const name = autostartTaskName(DIR);
    expect(name).toMatch(/^DUDE\\Device Agent [0-9a-f]{12}$/);
    expect(autostartTaskName(DIR.toUpperCase())).toBe(name);
    expect(autostartTaskName('C:\\other')).not.toBe(name);
  });

  it('prefers a per-user ONLOGON task with limited rights', async () => {
    const system = fakeSystem();
    const autostart = createAgentAutostart({ storeDir: DIR, agentExe: EXE, exec: system.exec, platform: 'win32' });
    expect(await autostart.set(true)).toEqual({ ok: true, state: { status: 'enabled', mechanism: 'task' } });
    const create = system.calls.find((c) => c.args[0] === '/Create')!;
    expect(create.file).toBe('schtasks.exe');
    expect(create.args).toEqual(['/Create', '/SC', 'ONLOGON', '/TN', autostartTaskName(DIR), '/TR', autostartCommand(EXE, DIR), '/RL', 'LIMITED', '/F']);
    expect(system.state.task).toBe(autostartCommand(EXE, DIR));
    expect(await autostart.get()).toEqual({ status: 'enabled', mechanism: 'task' });
  });

  it('runs everything without a shell, hidden, with a timeout', async () => {
    const system = fakeSystem();
    await createAgentAutostart({ storeDir: DIR, agentExe: EXE, exec: system.exec, platform: 'win32' }).set(true);
    expect(system.calls.length).toBeGreaterThan(0);
    for (const call of system.calls) expect(call.options).toEqual({ shell: false, windowsHide: true, timeout: 10_000 });
  });

  it('falls back to the HKCU Run key when the task is denied (standard user)', async () => {
    const system = fakeSystem({ taskDenied: true });
    const autostart = createAgentAutostart({ storeDir: DIR, agentExe: EXE, exec: system.exec, platform: 'win32' });
    expect(await autostart.set(true)).toEqual({ ok: true, state: { status: 'enabled', mechanism: 'run-key' } });
    const add = system.calls.find((c) => c.file === 'reg.exe' && c.args[0] === 'add')!;
    expect(add.args).toEqual(['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'DUDEDeviceAgent', '/t', 'REG_SZ', '/d', autostartCommand(EXE, DIR), '/f']);
    expect((add.args[1] as string).split('\\')).toEqual(['HKCU', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'Run']);
    expect(RUN_KEY).toBe(add.args[1]);
    expect(RUN_VALUE).toBe('DUDEDeviceAgent');
    expect(await autostart.get()).toEqual({ status: 'enabled', mechanism: 'run-key' });
  });

  it('reports an error when neither mechanism works', async () => {
    const system = fakeSystem({ taskDenied: true, runKeyDenied: true });
    const result = await createAgentAutostart({ storeDir: DIR, agentExe: EXE, exec: system.exec, platform: 'win32' }).set(true);
    expect(result.ok).toBe(false);
  });

  it('disabling removes both the task and the Run value', async () => {
    const system = fakeSystem();
    system.state.task = 'x';
    system.state.runKey = 'y';
    const autostart = createAgentAutostart({ storeDir: DIR, agentExe: EXE, exec: system.exec, platform: 'win32' });
    expect(await autostart.set(false)).toEqual({ ok: true, state: { status: 'disabled' } });
    expect(system.state).toEqual({ task: null, runKey: null });
  });

  it('enabling a task removes a Run value left from an earlier fallback', async () => {
    const system = fakeSystem();
    system.state.runKey = 'old';
    await createAgentAutostart({ storeDir: DIR, agentExe: EXE, exec: system.exec, platform: 'win32' }).set(true);
    expect(system.state.runKey).toBeNull();
  });

  it('an unpackaged build never installs anything', async () => {
    const system = fakeSystem();
    const autostart = createAgentAutostart({ storeDir: DIR, agentExe: null, exec: system.exec, platform: 'win32' });
    expect(await autostart.get()).toEqual({ status: 'unsupported-in-dev' });
    expect(await autostart.set(true)).toEqual({ ok: true, state: { status: 'unsupported-in-dev' } });
    expect(system.calls).toEqual([]);
  });

  it('other platforms are unsupported and run nothing', async () => {
    const system = fakeSystem();
    const autostart = createAgentAutostart({ storeDir: DIR, agentExe: EXE, exec: system.exec, platform: 'linux' });
    expect(await autostart.get()).toEqual({ status: 'unsupported-platform' });
    expect(system.calls).toEqual([]);
  });

  it('the module functions are unsupported-in-dev until configured', async () => {
    configureAgentAutostart(null);
    expect(await getAgentAutostart()).toEqual({ status: 'unsupported-in-dev' });
    expect(await setAgentAutostart(true)).toEqual({ ok: true, state: { status: 'unsupported-in-dev' } });
  });
});
