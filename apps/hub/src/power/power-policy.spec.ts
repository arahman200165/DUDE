import { afterEach, describe, expect, it } from 'vitest';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { SCRUBBED_META_PREFIXES } from '../backup/snapshot.js';
import { createJobRegistry } from '../jobs/job-status.js';
import { tempDir } from '../server/test-helpers.js';
import { POWER_POLICY_META_PREFIX, readPowerState, writePowerState } from './policy-state.js';
import { PowerChangeError, createPowerPolicy, mergePrevious } from './power-policy.js';
import type { PowerPolicy } from './power-policy.js';
import type { PowerRunner } from './powercfg.js';
import { QUERY_EN } from './power-fixture.js';
import { HIBERNATEIDLE_GUID, STANDBYIDLE_GUID } from './powercfg.js';

const opened: HubDb[] = [];
afterEach(() => { for (const h of opened.splice(0)) { try { h.close(); } catch { /* closed */ } } });

const T0 = Date.UTC(2026, 9, 29, 10, 0, 0);
const HOUR = 3600_000;
const hex = (minutes: number): string => (minutes * 60).toString(16).padStart(8, '0');

/** A fake Windows power plan: `powercfg /query` reads it and `/change` writes it, like the real tool. */
function machine(initial: { sleep: number; hibernate: number | null }, options: { failChange?: boolean; ignoreChange?: boolean } = {}) {
  const plan = { ...initial };
  const calls: string[][] = [];
  const runner: PowerRunner = (args) => {
    calls.push([...args]);
    const [verb, name, value] = args;
    if (verb === '/query') {
      if (args[3] === 'STANDBYIDLE') return Promise.resolve({ code: 0, stderr: '', stdout: QUERY_EN(STANDBYIDLE_GUID, 'Sleep after', hex(plan.sleep), hex(10)) });
      if (plan.hibernate === null) return Promise.resolve({ code: 1, stderr: '', stdout: '' });
      return Promise.resolve({ code: 0, stderr: '', stdout: QUERY_EN(HIBERNATEIDLE_GUID, 'Hibernate after', hex(plan.hibernate), hex(180)) });
    }
    if (verb === '/a') return Promise.resolve({ code: 0, stderr: '', stdout: 'The following sleep states are available on this system:\n    Standby (S3)\n    Hibernate\n\nThe following sleep states are not available on this system:\n' });
    if (verb === '/change') {
      if (options.failChange === true) return Promise.resolve({ code: 1, stderr: 'Access is denied.', stdout: '' });
      if (options.ignoreChange !== true) {
        if (name === 'standby-timeout-ac') plan.sleep = Number(value);
        if (name === 'hibernate-timeout-ac') plan.hibernate = Number(value);
      }
      return Promise.resolve({ code: 0, stderr: '', stdout: '' });
    }
    return Promise.reject(new Error(`unexpected powercfg ${args.join(' ')}`));
  };
  return { plan, calls, runner };
}

function setup(initial: { sleep: number; hibernate: number | null }, extra: { needed?: boolean; failChange?: boolean; ignoreChange?: boolean; platform?: NodeJS.Platform; withJob?: boolean } = {}) {
  const paths = ensureLayout(tempDir('hub-power-'));
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error('not ready');
  opened.push(result.hub);
  const clock = { t: T0 };
  const m = machine(initial, { ...(extra.failChange !== undefined ? { failChange: extra.failChange } : {}), ...(extra.ignoreChange !== undefined ? { ignoreChange: extra.ignoreChange } : {}) });
  const jobs = createJobRegistry({ db: result.hub.db, now: () => clock.t });
  const needed = { value: extra.needed ?? false };
  const policy: PowerPolicy = createPowerPolicy({
    db: result.hub.db, now: () => clock.t, platform: extra.platform ?? 'win32', runner: m.runner, needed: () => needed.value,
    ...(extra.withJob ? { job: jobs.handle('power-policy') } : {}),
  });
  const auditRows = (): Array<{ event: string; outcome: string; detail: Record<string, unknown> | null }> =>
    (result.hub.db.prepare("SELECT event, outcome, detail_json AS detail FROM audit_events WHERE event LIKE 'power.%' ORDER BY seq").all() as Array<{ event: string; outcome: string; detail: string | null }>)
      .map((r) => ({ event: r.event, outcome: r.outcome, detail: r.detail === null ? null : (JSON.parse(r.detail) as Record<string, unknown>) }));
  return { db: result.hub.db, clock, machine: m, policy, jobs, needed, auditRows };
}

describe('power policy service', () => {
  it('check records an ok machine and never audits it; a machine that stays ok stays quiet', async () => {
    const f = setup({ sleep: 0, hibernate: 0 });
    const first = await f.policy.check();
    expect(first).toMatchObject({ newlyRegressed: false, status: { verdict: 'ok', applied: false, regressed: false } });
    expect(readPowerState(f.db)).toMatchObject({ lastOkAt: new Date(T0).toISOString() });
    f.clock.t += HOUR;
    await f.policy.check();
    expect(f.auditRows()).toEqual([]);
  });

  it('reports a regression once per episode: ok, then changed back (audit power.regressed), still changed (silent), ok again, changed again (a new episode)', async () => {
    const f = setup({ sleep: 0, hibernate: 0 });
    await f.policy.check();
    f.machine.plan.sleep = 30;
    f.clock.t += HOUR;
    const regressed = await f.policy.check();
    expect(regressed).toMatchObject({ newlyRegressed: true, status: { verdict: 'needs-change', regressed: true, sleepAcMinutes: 30 } });
    expect(f.auditRows()).toEqual([{ event: 'power.regressed', outcome: 'failure', detail: { reason: 'regressed', sleepAcMinutes: 30, hibernateAcMinutes: 0 } }]);
    f.clock.t += HOUR;
    expect((await f.policy.check()).newlyRegressed).toBe(false);
    expect(f.auditRows()).toHaveLength(1);
    f.machine.plan.sleep = 0;
    f.clock.t += HOUR;
    expect((await f.policy.check()).status.regressed).toBe(false);
    f.machine.plan.hibernate = 60;
    f.clock.t += HOUR;
    expect((await f.policy.check()).newlyRegressed).toBe(true);
    expect(f.auditRows().map((r) => r.event)).toEqual(['power.regressed', 'power.regressed']);
  });

  it('a Hub restart does not repeat a report (the episode is stored)', async () => {
    const f = setup({ sleep: 0, hibernate: null });
    await f.policy.check();
    f.machine.plan.sleep = 15;
    await f.policy.check();
    const again = createPowerPolicy({ db: f.db, now: () => f.clock.t, platform: 'win32', runner: f.machine.runner });
    expect((await again.check()).newlyRegressed).toBe(false);
    expect(f.auditRows()).toHaveLength(1);
  });

  it('a machine that never had the policy is reported only while a tunnel or a backup schedule needs it, and as not-applied', async () => {
    const f = setup({ sleep: 30, hibernate: 0 });
    expect((await f.policy.check()).newlyRegressed).toBe(false);
    expect(f.auditRows()).toEqual([]);
    f.needed.value = true;
    expect(await f.policy.check()).toMatchObject({ newlyRegressed: true, status: { regressed: true } });
    expect(f.auditRows()).toEqual([{ event: 'power.regressed', outcome: 'failure', detail: { reason: 'not-applied', sleepAcMinutes: 30, hibernateAcMinutes: 0 } }]);
  });

  it('unsupported and unknown verdicts never report a regression', async () => {
    const linux = setup({ sleep: 30, hibernate: 30 }, { platform: 'linux', needed: true });
    expect(await linux.policy.check()).toMatchObject({ newlyRegressed: false, status: { verdict: 'unsupported', regressed: false } });
    expect(linux.machine.calls).toEqual([]);
    expect(linux.auditRows()).toEqual([]);
  });

  it('apply: records the replaced values first, runs only the needed commands, verifies, audits power.changed and clears any regression', async () => {
    const f = setup({ sleep: 30, hibernate: 0 }, { needed: true });
    await f.policy.check(); // opens a not-applied episode
    const reading = await f.policy.read();
    const plan = f.policy.planApply(reading);
    expect(plan.commands.map((c) => c.display)).toEqual(['powercfg /change standby-timeout-ac 0']);
    expect(plan.previous).toEqual({ standby: 30 });
    const after = await f.policy.apply(plan);
    expect(after).toMatchObject({ verdict: 'ok', sleepAcMinutes: 0 });
    expect(f.machine.calls.filter((c) => c[0] === '/change')).toEqual([['/change', 'standby-timeout-ac', '0']]);
    const state = readPowerState(f.db);
    expect(state).toMatchObject({ previous: { standby: 30 }, appliedAt: new Date(T0).toISOString(), lastOkAt: new Date(T0).toISOString() });
    expect(state.regressedAt).toBeUndefined();
    expect(f.auditRows().at(-1)).toEqual({ event: 'power.changed', outcome: 'success', detail: expect.objectContaining({ commands: ['powercfg /change standby-timeout-ac 0'], sleepAcBefore: 30, sleepAcAfter: 0 }) });
    expect(f.policy.lastStatus()).toMatchObject({ verdict: 'ok', applied: true });
  });

  it('apply of both settings, then revert restores both recorded values and opts out of regression notices', async () => {
    const f = setup({ sleep: 20, hibernate: 180 });
    const plan = f.policy.planApply(await f.policy.read());
    expect(plan.commands.map((c) => c.display)).toEqual(['powercfg /change standby-timeout-ac 0', 'powercfg /change hibernate-timeout-ac 0']);
    await f.policy.apply(plan);
    expect(f.machine.plan).toEqual({ sleep: 0, hibernate: 0 });
    const revertPlan = f.policy.planRevert(await f.policy.read())!;
    expect(revertPlan.commands.map((c) => c.display)).toEqual(['powercfg /change standby-timeout-ac 20', 'powercfg /change hibernate-timeout-ac 180']);
    await f.policy.revert(revertPlan);
    expect(f.machine.plan).toEqual({ sleep: 20, hibernate: 180 });
    expect(readPowerState(f.db)).toMatchObject({ optedOut: true });
    expect(readPowerState(f.db).previous).toBeUndefined();
    expect(readPowerState(f.db).appliedAt).toBeUndefined();
    expect(f.auditRows().map((r) => `${r.event}:${r.outcome}`)).toEqual(['power.changed:success', 'power.reverted:success']);
    // opted out: a needs-change machine that needs the policy is not reported
    f.needed.value = true;
    expect((await f.policy.check()).newlyRegressed).toBe(false);
    expect(f.policy.planRevert(await f.policy.read())).toBeNull();
  });

  it('a failed powercfg audits a failure and throws without echoing powercfg output; the recorded values survive for a revert', async () => {
    const f = setup({ sleep: 25, hibernate: 0 }, { failChange: true });
    const plan = f.policy.planApply(await f.policy.read());
    const error = await f.policy.apply(plan).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PowerChangeError);
    expect((error as PowerChangeError).reason).toBe('powercfg-failed');
    expect((error as Error).message).not.toContain('Access is denied');
    expect(readPowerState(f.db)).toMatchObject({ previous: { standby: 25 } });
    expect(readPowerState(f.db).appliedAt).toBeUndefined();
    expect(f.auditRows()).toEqual([{ event: 'power.changed', outcome: 'failure', detail: expect.objectContaining({ reason: 'powercfg-failed' }) }]);
  });

  it('a change that powercfg accepted but the read-back does not show (a group policy) is a not-verified failure, not a success', async () => {
    const f = setup({ sleep: 25, hibernate: 0 }, { ignoreChange: true });
    const error = await f.policy.apply(f.policy.planApply(await f.policy.read())).catch((e: unknown) => e);
    expect((error as PowerChangeError).reason).toBe('not-verified');
    expect(readPowerState(f.db).appliedAt).toBeUndefined();
    expect(f.auditRows().at(-1)).toMatchObject({ event: 'power.changed', outcome: 'failure', detail: { reason: 'not-verified' } });
  });

  it('keeps the original values when apply is run again after a partial failure', () => {
    expect(mergePrevious({ standby: 30 }, { sleepAcMinutes: 0, hibernateAcMinutes: 120 })).toEqual({ standby: 30, hibernate: 120 });
    expect(mergePrevious(undefined, { sleepAcMinutes: 0, hibernateAcMinutes: null })).toEqual({});
    expect(mergePrevious({ standby: 30 }, { sleepAcMinutes: 45, hibernateAcMinutes: 0 })).toEqual({ standby: 45 });
  });

  it('plans nothing when the machine is already ok, and status never writes', async () => {
    const f = setup({ sleep: 0, hibernate: 0 });
    expect(f.policy.planApply(await f.policy.read()).commands).toEqual([]);
    const before = f.db.prepare('SELECT COUNT(*) AS n FROM meta').get();
    expect(await f.policy.status()).toMatchObject({ verdict: 'ok' });
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM meta').get()).toEqual(before);
  });

  it('runs as the power-policy job: success when ok, failed on a regression, skipped off Windows; the timer is the hourly check', async () => {
    const f = setup({ sleep: 0, hibernate: 0 }, { withJob: true });
    await f.policy.runOnce();
    expect(f.jobs.list().find((j) => j.id === 'power-policy')).toMatchObject({ lastOutcome: 'success', lastSummary: 'Sleep and hibernate are off on AC power.' });
    f.machine.plan.sleep = 10;
    f.clock.t += HOUR;
    await f.policy.runOnce();
    expect(f.jobs.list().find((j) => j.id === 'power-policy')).toMatchObject({ lastOutcome: 'failed' });
    const off = setup({ sleep: 0, hibernate: 0 }, { withJob: true, platform: 'linux' });
    await off.policy.runOnce();
    expect(off.jobs.list().find((j) => j.id === 'power-policy')).toMatchObject({ lastOutcome: 'skipped' });

    let tick: (() => void) | undefined;
    const timed = createPowerPolicy({ db: f.db, now: () => f.clock.t, platform: 'win32', runner: f.machine.runner, setTimer: (fn, ms) => { tick = fn; expect(ms).toBe(HOUR); return 1; }, clearTimer: () => { tick = undefined; } });
    timed.start();
    timed.start();
    expect(tick).toBeDefined();
    timed.stop();
    expect(tick).toBeUndefined();
  });

  it('keeps its state in meta under a prefix a backup scrubs (the settings belong to this computer)', () => {
    const f = setup({ sleep: 0, hibernate: 0 });
    writePowerState(f.db, { previous: { standby: 30 }, optedOut: true });
    const key = (f.db.prepare("SELECT key FROM meta WHERE key LIKE 'power_policy%'").get() as { key: string }).key;
    expect(key.startsWith(POWER_POLICY_META_PREFIX)).toBe(true);
    expect(SCRUBBED_META_PREFIXES.some((prefix) => key.startsWith(prefix))).toBe(true);
    // a damaged value reads as no state
    f.db.prepare('UPDATE meta SET value = ? WHERE key = ?').run('{not json', key);
    expect(readPowerState(f.db)).toEqual({});
    f.db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(JSON.stringify({ previous: { standby: -5, hibernate: 99999999 }, appliedAt: 7 }), key);
    expect(readPowerState(f.db)).toEqual({});
  });
});
