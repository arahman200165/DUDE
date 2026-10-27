import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogBuffer } from './log-buffer.js';
import { pidAlive } from './kill-tree.js';
import { defaultProcessImagePath, sameImagePath } from './process-image.js';
import { REDACTED, createRedactor } from './redact.js';
import { SUPERVISOR_BACKOFF_MS, SUPERVISOR_CRASH_WINDOW_MS, SUPERVISOR_MAX_CRASHES_IN_WINDOW, createSupervisor } from './supervisor.js';
import type { PreparedCommand, Supervisor, SupervisorOptions } from './supervisor.js';

const supervisors: Supervisor[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const supervisor of supervisors.splice(0)) await supervisor.stop().catch(() => undefined);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const tmp = (): string => { const dir = mkdtempSync(path.join(os.tmpdir(), 'ss-sup-')); dirs.push(dir); return dir; };
const baseEnv = (): Record<string, string> => ({ ...(process.env['SystemRoot'] ? { SystemRoot: process.env['SystemRoot'] } : {}) });
/** A child that runs `script` under node. */
const node = (script: string, extra: Partial<PreparedCommand> = {}): PreparedCommand => ({ command: process.execPath, args: ['-e', script], env: baseEnv(), ...extra });
const SLEEP = 'setInterval(() => {}, 1000)';
const CRASH = 'setTimeout(() => process.exit(1), 5)';

function make(prepare: SupervisorOptions['prepare'], extra: Partial<SupervisorOptions> = {}): Supervisor {
  const supervisor = createSupervisor({ id: 'test', prepare, backoffMs: [20, 40, 80], stopGraceMs: 1500, ...extra });
  supervisors.push(supervisor);
  return supervisor;
}
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check: () => boolean, ms = 8000): Promise<void> => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(10);
  if (!check()) throw new Error('condition not reached');
};

describe('the policy mirrors the desktop agent host', () => {
  it('uses 500, 2000 and 8000 ms, three crashes in two minutes', () => {
    expect([...SUPERVISOR_BACKOFF_MS]).toEqual([500, 2000, 8000]);
    expect(SUPERVISOR_CRASH_WINDOW_MS).toBe(120_000);
    expect(SUPERVISOR_MAX_CRASHES_IN_WINDOW).toBe(3);
  });
});

describe('crash back-off and the failed state', () => {
  it('restarts with the back-off delays and gives up after more than three crashes', async () => {
    const launches: number[] = [];
    const supervisor = make(() => { launches.push(Date.now()); return node(CRASH); });
    await supervisor.start();
    await supervisor.waitFor(['failed'], 10_000);
    expect(launches).toHaveLength(4); // the first start and three restarts; the fourth crash is not restarted
    for (const [index, delay] of [20, 40, 80].entries()) expect((launches[index + 1] ?? 0) - (launches[index] ?? 0)).toBeGreaterThanOrEqual(delay - 2);
    expect(supervisor.status()).toMatchObject({ state: 'failed', ready: false, pid: null, restarts: 3, crashesInWindow: 4, lastError: 'crashed-repeatedly' });
    expect(supervisor.status().lastExit?.code).toBe(1);
    await sleep(250);
    expect(launches).toHaveLength(4);
  });

  it('start() after failed clears the history and runs again', async () => {
    let mode: 'crash' | 'sleep' = 'crash';
    const supervisor = make(() => node(mode === 'crash' ? CRASH : SLEEP));
    await supervisor.start();
    await supervisor.waitFor(['failed'], 10_000);
    mode = 'sleep';
    await supervisor.start();
    await supervisor.waitFor(['running'], 5000);
    expect(supervisor.status()).toMatchObject({ state: 'running', ready: true, restarts: 0, crashesInWindow: 0 });
    expect(pidAlive(supervisor.status().pid ?? 0)).toBe(true);
  });

  it('crashes older than the window do not count', async () => {
    let launches = 0;
    const supervisor = make(() => { launches += 1; return node('setTimeout(() => process.exit(1), 150)'); }, { backoffMs: [10], crashWindowMs: 100 });
    await supervisor.start();
    await until(() => launches >= 6, 15_000);
    expect(supervisor.status().state).not.toBe('failed');
  });

  it('a launch that prepare refuses is failed, not retried, and rejects start()', async () => {
    let prepared = 0;
    const refusal = Object.assign(new Error('nope'), { code: 'binary-hash-mismatch' });
    const supervisor = make(() => { prepared += 1; throw refusal; });
    await expect(supervisor.start()).rejects.toBe(refusal);
    expect(supervisor.status()).toMatchObject({ state: 'failed', pid: null, lastError: 'binary-hash-mismatch' });
    await sleep(150);
    expect(prepared).toBe(1);
  });

  it('reports a missing executable as a crash loop that ends failed', async () => {
    const supervisor = make(() => ({ command: path.join(tmp(), 'does-not-exist.exe'), args: [], env: baseEnv() }), { backoffMs: [10] });
    await supervisor.start();
    await supervisor.waitFor(['failed'], 10_000);
    expect(supervisor.status().state).toBe('failed');
  });
});

describe('stopping leaves no child behind', () => {
  it('stop() ends the process, removes the pid file and does not restart it', async () => {
    const pidFile = path.join(tmp(), 'run', 'child.pid');
    const supervisor = make(() => node(SLEEP), { pidFile, expectedImagePath: process.execPath });
    await supervisor.start();
    await supervisor.waitFor(['running'], 5000);
    const pid = supervisor.status().pid ?? 0;
    expect(pidAlive(pid)).toBe(true);
    expect(JSON.parse(readFileSync(pidFile, 'utf8')).pid).toBe(pid);
    await supervisor.stop();
    expect(pidAlive(pid)).toBe(false);
    expect(existsSync(pidFile)).toBe(false);
    expect(supervisor.status()).toMatchObject({ state: 'stopped', pid: null });
    await sleep(120);
    expect(supervisor.status().state).toBe('stopped');
  });

  it('stopping while a restart is pending cancels it', async () => {
    let launches = 0;
    const supervisor = make(() => { launches += 1; return node(CRASH); }, { backoffMs: [300] });
    await supervisor.start();
    await supervisor.waitFor(['restarting'], 5000);
    await supervisor.stop();
    await sleep(450);
    expect(launches).toBe(1);
    expect(supervisor.status().state).toBe('stopped');
  });

  it('restart() replaces the process', async () => {
    const supervisor = make(() => node(SLEEP));
    await supervisor.start();
    await supervisor.waitFor(['running'], 5000);
    const first = supervisor.status().pid ?? 0;
    await supervisor.restart();
    await supervisor.waitFor(['running'], 5000);
    const second = supervisor.status().pid ?? 0;
    expect(second).not.toBe(first);
    expect(pidAlive(first)).toBe(false);
    expect(pidAlive(second)).toBe(true);
  });

  it('killNow() kills synchronously and clears the pid file', async () => {
    const pidFile = path.join(tmp(), 'child.pid');
    const supervisor = make(() => node(SLEEP), { pidFile, expectedImagePath: process.execPath });
    await supervisor.start();
    await supervisor.waitFor(['running'], 5000);
    const pid = supervisor.status().pid ?? 0;
    supervisor.killNow();
    await until(() => !pidAlive(pid), 5000);
    expect(existsSync(pidFile)).toBe(false);
  });
});

describe('orphans of a Hub that died without stopping them', () => {
  const sleeper = (): number => {
    const child = spawn(process.execPath, ['-e', SLEEP], { stdio: 'ignore', windowsHide: true, detached: true });
    child.unref();
    return child.pid ?? 0;
  };
  const record = (pidFile: string, pid: number): void => writeFileSync(pidFile, JSON.stringify({ pid, startedAt: Date.now() }));

  it('start() kills a recorded process whose image is the expected one', async () => {
    const pidFile = path.join(tmp(), 'child.pid');
    const orphan = sleeper();
    await until(() => pidAlive(orphan), 3000);
    record(pidFile, orphan);
    const supervisor = make(() => node(SLEEP), { pidFile, expectedImagePath: process.execPath, processImagePath: async () => process.execPath });
    await supervisor.start();
    await supervisor.waitFor(['running'], 5000);
    expect(pidAlive(orphan)).toBe(false);
    expect(supervisor.status().pid).not.toBe(orphan);
    expect(supervisor.logs().some((line) => line.text.includes('previous process'))).toBe(true);
  });

  it('never kills a process whose image is not the expected one (a reused pid)', async () => {
    const pidFile = path.join(tmp(), 'child.pid');
    const bystander = sleeper();
    await until(() => pidAlive(bystander), 3000);
    try {
      record(pidFile, bystander);
      const supervisor = make(() => node(SLEEP), { pidFile, expectedImagePath: process.execPath, processImagePath: async () => 'C:\\Windows\\other-program.exe' });
      expect(await supervisor.sweepOrphans()).toBe(false);
      expect(pidAlive(bystander)).toBe(true);
      expect(existsSync(pidFile)).toBe(false);
    } finally {
      try { process.kill(bystander, 'SIGKILL'); } catch { /* gone */ }
    }
  });

  it('ignores a stale pid file and one naming a dead process', async () => {
    const dir = tmp();
    const pidFile = path.join(dir, 'child.pid');
    const supervisor = make(() => node(SLEEP), { pidFile, expectedImagePath: process.execPath });
    writeFileSync(pidFile, 'not json');
    expect(await supervisor.sweepOrphans()).toBe(false);
    record(pidFile, 2_147_483_000);
    expect(await supervisor.sweepOrphans()).toBe(false);
    expect(existsSync(pidFile)).toBe(false);
  });

  it('the real image lookup agrees with this process', async () => {
    const image = await defaultProcessImagePath(process.pid);
    expect(image).not.toBeNull();
    expect(sameImagePath(image ?? '', process.execPath)).toBe(true);
    expect(await defaultProcessImagePath(0)).toBeNull();
  }, 30_000);

  it('requires an expected image whenever a pid file is used', () => {
    expect(() => createSupervisor({ id: 'x', prepare: () => node(SLEEP), pidFile: 'x.pid' })).toThrow(/expectedImagePath/);
  });
});

describe('readiness', () => {
  it('stays starting until the probe answers, then runs', async () => {
    let probes = 0;
    const supervisor = make(() => node(SLEEP, { ready: async () => { probes += 1; return probes > 3; } }), { readiness: { intervalMs: 10, startTimeoutMs: 5000 } });
    await supervisor.start();
    expect(supervisor.status()).toMatchObject({ state: 'starting', ready: false });
    await supervisor.waitFor(['running'], 5000);
    expect(supervisor.status().ready).toBe(true);
    expect(probes).toBeGreaterThan(3);
  });

  it('a probe that throws counts as not ready', async () => {
    const supervisor = make(() => node(SLEEP, { ready: () => Promise.reject(new Error('x')) }), { readiness: { intervalMs: 10, startTimeoutMs: 100 }, backoffMs: [500] });
    await supervisor.start();
    await supervisor.waitFor(['restarting'], 5000);
    expect(supervisor.status().lastError).toBe('not-ready');
  });

  it('a child that never becomes ready is stopped and counted as a crash, ending failed', async () => {
    const pids = new Set<number>();
    const supervisor = make(() => node(SLEEP, { ready: async () => false }), { readiness: { intervalMs: 10, startTimeoutMs: 120 }, backoffMs: [10] });
    supervisor.onChange((status) => { if (status.pid !== null) pids.add(status.pid); });
    await supervisor.start();
    await supervisor.waitFor(['failed'], 15_000);
    expect(pids.size).toBeGreaterThanOrEqual(4);
    await until(() => [...pids].every((pid) => !pidAlive(pid)), 5000);
  });

  it('turns not-ready after consecutive failed probes without restarting the child', async () => {
    let healthy = true;
    const supervisor = make(() => node(SLEEP, { ready: async () => healthy }), { readiness: { intervalMs: 10, startTimeoutMs: 5000, unhealthyAfter: 3 } });
    await supervisor.start();
    await supervisor.waitFor(['running'], 5000);
    const pid = supervisor.status().pid;
    healthy = false;
    await until(() => !supervisor.status().ready, 3000);
    expect(supervisor.status()).toMatchObject({ state: 'running', pid });
    healthy = true;
    await until(() => supervisor.status().ready, 3000);
  });
});

describe('environment, arguments and captured output', () => {
  const SECRET = 'eyJhIjoiYWNjb3VudCIsInQiOiJ0dW5uZWwiLCJzIjoic2VjcmV0In0=';

  it('gives the child exactly the environment it was prepared with, and the secret never appears in argv', async () => {
    const script = 'process.stdout.write(JSON.stringify({ only: process.env.ONLY_THIS, token: process.env.TUNNEL_TOKEN, leak: process.env.SUPERVISOR_SPEC_LEAK, argv: process.argv.slice(1) }) + "\\n"); setInterval(() => {}, 1000)';
    const supervisor = make(() => node(script, { env: { ...baseEnv(), ONLY_THIS: 'yes', TUNNEL_TOKEN: SECRET }, secrets: [SECRET] }));
    process.env['SUPERVISOR_SPEC_LEAK'] = 'leaked';
    try {
      await supervisor.start();
      await supervisor.waitFor(['running'], 5000);
      await until(() => supervisor.logs().length > 0, 5000);
    } finally {
      delete process.env['SUPERVISOR_SPEC_LEAK'];
    }
    const text = supervisor.logs().map((line) => line.text).join('\n');
    expect(text).toContain('"only":"yes"');
    expect(text).not.toContain('leaked');
    expect(text).not.toContain(SECRET);
    expect(text).toContain(REDACTED);
    expect(supervisor.logs().every((line) => !line.text.includes(SECRET))).toBe(true);
    expect(JSON.stringify(supervisor.status())).not.toContain(SECRET);
  });

  it('keeps the output bounded', async () => {
    const supervisor = make(() => node('for (let i = 0; i < 5000; i++) console.log("line " + i + " ".repeat(40)); setInterval(() => {}, 1000)'), { log: { maxLines: 50, maxChars: 4000 } });
    await supervisor.start();
    await until(() => supervisor.logs().some((line) => line.text.startsWith('line 4999')), 8000);
    const lines = supervisor.logs();
    expect(lines.length).toBeLessThanOrEqual(50);
    expect(lines.reduce((sum, line) => sum + line.text.length, 0)).toBeLessThanOrEqual(4000 + 100);
    expect(lines.at(-1)?.text).toMatch(/^line 4999/);
  });

  it('waitFor rejects when the state is not reached in time', async () => {
    const supervisor = make(() => node(SLEEP));
    await expect(supervisor.waitFor(['running'], 30)).rejects.toThrow(/did not reach running/);
  });
});

describe('redaction', () => {
  it('scrubs connector tokens, assignments and literal secrets', () => {
    const redact = createRedactor(['plain-secret-value']);
    expect(redact('token eyJhIjoiYWNjb3VudCIsInQiOiJ0dW5uZWwifQ== end')).toBe(`token ${REDACTED} end`);
    expect(redact('TUNNEL_TOKEN=abc123 and --token xyz789')).toBe(`TUNNEL_TOKEN=${REDACTED} and --token ${REDACTED}`);
    expect(redact('x plain-secret-value y plain-secret-value')).toBe(`x ${REDACTED} y ${REDACTED}`);
    expect(redact('nothing to hide')).toBe('nothing to hide');
    expect(createRedactor(['abc'])('abc stays')).toBe('abc stays'); // too short to be a literal secret
  });
});

describe('the log buffer', () => {
  const redact = createRedactor(['literal-secret']);

  it('redacts a secret split across two chunks, because lines are stored only when complete', () => {
    const buffer = createLogBuffer({}, redact);
    buffer.push('stdout', 'connecting with eyJhIjoiYWNjb3VudCIs');
    expect(buffer.lines()).toEqual([]);
    buffer.push('stdout', 'InQiOiJ0dW5uZWwifQ== now\nliteral-sec');
    buffer.push('stdout', 'ret again\n');
    expect(buffer.lines().map((line) => line.text)).toEqual([`connecting with ${REDACTED} now`, `${REDACTED} again`]);
  });

  it('drops the oldest lines past the line and character bounds and cuts long lines', () => {
    const buffer = createLogBuffer({ maxLines: 3, maxChars: 40, maxLineChars: 64 }, redact);
    for (let i = 0; i < 10; i += 1) buffer.push('stderr', `message number ${i}\n`);
    expect(buffer.lines().length).toBeLessThanOrEqual(3);
    expect(buffer.lines().at(-1)?.text).toBe('message number 9');
    buffer.clear();
    buffer.push('stdout', `${'a'.repeat(500)}\nnext\n`);
    const [long, next] = buffer.lines();
    expect((long?.text.length ?? 0)).toBeLessThanOrEqual(64 + 20);
    expect(next?.text).toBe('next');
  });

  it('never keeps the start of a token a cut line would have split', () => {
    const buffer = createLogBuffer({ maxLineChars: 100 }, redact);
    buffer.push('stdout', `${'x'.repeat(70)} eyJhIjoiYWNjb3VudCIsInQiOiJ0dW5uZWwiLCJzIjoic2VjcmV0In0= tail\n`);
    expect(buffer.lines().map((line) => line.text).join('')).not.toContain('eyJ');
  });
});
