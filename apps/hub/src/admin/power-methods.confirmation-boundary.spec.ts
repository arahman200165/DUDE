import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { POWER_APPLY_ACTION, POWER_CONSEQUENCE_CLASS, POWER_REVERT_ACTION } from '@dude/contracts/hub';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { createPowerPolicy } from '../power/power-policy.js';
import type { PowerPolicy } from '../power/power-policy.js';
import { QUERY_EN } from '../power/power-fixture.js';
import { readPowerState } from '../power/policy-state.js';
import { HIBERNATEIDLE_GUID, STANDBYIDLE_GUID } from '../power/powercfg.js';
import type { PowerRunner } from '../power/powercfg.js';
import { ConfirmationStore, CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { startTestHub, tempDir } from '../server/test-helpers.js';
import { AdminError } from './admin-endpoint.js';
import { buildAdminMethods } from './methods.js';

/**
 * The Destructive-Action Contract's confirmation-boundary spec for `dude-hub power apply|revert` (32-SS1, Milestone 851, PD-142): the
 * preview writes and runs nothing, the confirmation is bound to the observed settings, single-use and short-lived, only the previewed
 * commands run (and only as fixed `powercfg` argument vectors), the change is read back and audited, and nothing but the admin pipe
 * can issue the confirmation or run `powercfg`.
 */
const T0 = Date.parse('2026-10-29T12:00:00Z');
const hex = (minutes: number): string => (minutes * 60).toString(16).padStart(8, '0');

const opened: HubDb[] = [];
afterEach(() => { for (const h of opened.splice(0)) { try { h.close(); } catch { /* closed */ } } });

interface Options { sleep?: number; hibernate?: number | null; platform?: NodeJS.Platform; failChange?: boolean; unreadable?: boolean }

function fixture(options: Options = {}) {
  const paths = ensureLayout(tempDir('hub-power-bnd-'));
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error('not ready');
  opened.push(result.hub);
  const db = result.hub.db;
  const plan = { sleep: options.sleep ?? 30, hibernate: options.hibernate === undefined ? 180 : options.hibernate };
  const calls: string[][] = [];
  const runner: PowerRunner = (args) => {
    calls.push([...args]);
    if (args[0] === '/query') {
      if (options.unreadable === true) return Promise.resolve({ code: 0, stderr: '', stdout: 'not powercfg output' });
      if (args[3] === 'STANDBYIDLE') return Promise.resolve({ code: 0, stderr: '', stdout: QUERY_EN(STANDBYIDLE_GUID, 'Sleep after', hex(plan.sleep), hex(10)) });
      if (plan.hibernate === null) return Promise.resolve({ code: 1, stderr: '', stdout: '' });
      return Promise.resolve({ code: 0, stderr: '', stdout: QUERY_EN(HIBERNATEIDLE_GUID, 'Hibernate after', hex(plan.hibernate), hex(180)) });
    }
    if (args[0] === '/a') return Promise.resolve({ code: 0, stderr: '', stdout: 'Available:\n    Standby (S3)\n\nNot available:\n' });
    if (args[0] === '/change') {
      if (options.failChange === true) return Promise.resolve({ code: 1, stderr: 'Access is denied.', stdout: '' });
      if (args[1] === 'standby-timeout-ac') plan.sleep = Number(args[2]);
      if (args[1] === 'hibernate-timeout-ac') plan.hibernate = Number(args[2]);
      return Promise.resolve({ code: 0, stderr: '', stdout: '' });
    }
    return Promise.reject(new Error(`unexpected powercfg ${args.join(' ')}`));
  };
  let clock = T0;
  const power: PowerPolicy = createPowerPolicy({ db, now: () => clock, platform: options.platform ?? 'win32', runner });
  const confirmations = new ConfirmationStore();
  const methods = buildAdminMethods({
    db, hubVersion: 't', hubInstanceId: result.hub.hubInstanceId, bind: 'loopback', getPort: () => 47600, startedAt: 0, configDir: paths.configDir,
    spkiSha256: 'S'.repeat(43), now: () => clock, confirmations, power,
  });
  const call = (name: string, params: unknown): Promise<unknown> => Promise.resolve().then(() => methods[name]!(params));
  const fail = async (name: string, params: unknown): Promise<AdminError> => {
    try { await call(name, params); } catch (error) { return error as AdminError; }
    throw new Error(`${name} did not fail`);
  };
  const preview = async (action: 'apply' | 'revert') =>
    (await call('power.preview', { action })) as { confirmToken: string; expiresAt: string; consequenceClass: string[]; summary: Record<string, unknown> };
  const changes = (): string[][] => calls.filter((c) => c[0] === '/change');
  const audits = (): Array<{ event: string; outcome: string; detail: string | null }> =>
    db.prepare("SELECT event, outcome, detail_json AS detail FROM audit_events WHERE event LIKE 'power.%' ORDER BY seq").all() as never;
  return {
    db, plan, calls, changes, audits, call, fail, preview, confirmations, power, advance: (ms: number) => { clock += ms; },
    now: () => clock, staged: (): Map<string, unknown> => (confirmations as unknown as { staged: Map<string, unknown> }).staged,
  };
}

describe('power policy confirmation boundary', () => {
  it('tags the consequence class (system-config) and previews the exact commands, the before and after values and the undo', async () => {
    expect([...POWER_CONSEQUENCE_CLASS]).toEqual(['system-config']);
    const f = fixture();
    const preview = await f.preview('apply');
    expect(preview.consequenceClass).toEqual(['system-config']);
    expect(preview.expiresAt).toBe(ConfirmationStore.expiresAt(T0));
    expect(preview.summary).toMatchObject({
      action: 'apply', before: { sleepAcMinutes: 30, hibernateAcMinutes: 180 }, after: { sleepAcMinutes: 0, hibernateAcMinutes: 0 },
      commands: ['powercfg /change standby-timeout-ac 0', 'powercfg /change hibernate-timeout-ac 0'],
      revertCommands: ['powercfg /change standby-timeout-ac 30', 'powercfg /change hibernate-timeout-ac 180'], revertWith: 'dude-hub power revert', restartRequired: false,
    });
  });

  it('only changes a setting that is set: a machine that already never hibernates gets one command', async () => {
    const f = fixture({ sleep: 15, hibernate: 0 });
    expect((await f.preview('apply')).summary['commands']).toEqual(['powercfg /change standby-timeout-ac 0']);
  });

  it('the preview writes nothing: no state, no audit row, no powercfg change, one staged confirmation', async () => {
    const f = fixture();
    const auditBefore = f.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get();
    await f.preview('apply');
    expect(f.changes()).toEqual([]);
    expect(readPowerState(f.db)).toEqual({});
    expect(f.audits()).toEqual([]);
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get()).toEqual(auditBefore);
    expect(f.plan).toEqual({ sleep: 30, hibernate: 180 });
    expect(f.staged().size).toBe(1);
  });

  it('keeps only the hash of a token; it is single-use and expires after 60 seconds', async () => {
    const f = fixture();
    const { confirmToken } = await f.preview('apply');
    const stored = [...f.staged().keys()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify([...f.staged().values()])).not.toContain(confirmToken);
    expect(CONFIRMATION_TTL_MS).toBe(60_000);

    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('power.apply', { confirmToken })).code).toBe('confirmation-required');
    expect(f.changes()).toEqual([]);

    const fresh = (await f.preview('apply')).confirmToken;
    f.advance(CONFIRMATION_TTL_MS - 1);
    await expect(f.call('power.apply', { confirmToken: fresh })).resolves.toMatchObject({ action: 'apply', verdict: 'ok' });
    expect((await f.fail('power.apply', { confirmToken: fresh })).code).toMatch(/confirmation-required|conflict/);
    // the replay found nothing to change, or no confirmation: either way nothing ran twice
    expect(f.changes()).toHaveLength(2);
  });

  it('refuses a missing, empty, forged, foreign-action or foreign-binding token, and one action\'s token cannot drive the other', async () => {
    const f = fixture();
    for (const confirmToken of [undefined, '', 'forged', 42]) {
      const error = await f.fail('power.apply', { confirmToken });
      expect(['bad-request', 'confirmation-required']).toContain(error.code);
    }
    const otherAction = f.confirmations.issue({ action: 'owner.reset', digest: 'x', bindingId: 'cli', now: f.now() });
    expect((await f.fail('power.apply', { confirmToken: otherAction })).code).toBe('confirmation-required');
    const wrongBinding = f.confirmations.issue({ action: POWER_APPLY_ACTION, digest: 'x', bindingId: 'session-hash', now: f.now() });
    expect((await f.fail('power.apply', { confirmToken: wrongBinding })).code).toBe('confirmation-required');
    expect(f.changes()).toEqual([]);

    const applyToken = (await f.preview('apply')).confirmToken;
    expect((await f.fail('power.revert', { confirmToken: applyToken })).code).toMatch(/conflict|confirmation-required/);
    expect(f.changes()).toEqual([]);
    await f.call('power.apply', { confirmToken: (await f.preview('apply')).confirmToken });
    const revertToken = (await f.preview('revert')).confirmToken;
    expect((await f.fail('power.apply', { confirmToken: revertToken })).code).toMatch(/conflict|confirmation-required/);
    expect(f.plan).toEqual({ sleep: 0, hibernate: 0 });
    await expect(f.call('owner.reset.apply', { confirmToken: revertToken })).rejects.toMatchObject({ code: expect.stringMatching(/not-bootstrapped|confirmation-required/) });
  });

  it('binds the confirmation to the observed settings: a change since the preview refuses and runs nothing', async () => {
    const f = fixture();
    const { confirmToken } = await f.preview('apply');
    f.plan.sleep = 45; // the owner (or a group policy) changed it after the preview
    const error = await f.fail('power.apply', { confirmToken });
    expect(error.code).toBe('conflict');
    expect(f.changes()).toEqual([]);
    expect(readPowerState(f.db)).toEqual({});
    expect(f.audits()).toEqual([]);
  });

  it('apply runs exactly the previewed commands as fixed argument vectors, reads the settings back, records the old values and audits power.changed', async () => {
    const f = fixture();
    const { confirmToken } = await f.preview('apply');
    const result = await f.call('power.apply', { confirmToken });
    expect(result).toMatchObject({ action: 'apply', verdict: 'ok', before: { sleepAcMinutes: 30, hibernateAcMinutes: 180 }, after: { sleepAcMinutes: 0, hibernateAcMinutes: 0 } });
    expect(f.changes()).toEqual([['/change', 'standby-timeout-ac', '0'], ['/change', 'hibernate-timeout-ac', '0']]);
    // Every powercfg call is one of the fixed forms: a query, /a or a /change with an integer.
    for (const call of f.calls) expect(call.join(' ')).toMatch(/^(\/query SCHEME_CURRENT SUB_SLEEP (STANDBYIDLE|HIBERNATEIDLE)|\/a|\/change (standby|hibernate)-timeout-ac \d+)$/);
    expect(readPowerState(f.db)).toMatchObject({ previous: { standby: 30, hibernate: 180 }, appliedAt: new Date(T0).toISOString() });
    expect(f.audits()).toHaveLength(1);
    expect(f.audits()[0]).toMatchObject({ event: 'power.changed', outcome: 'success' });
  });

  it('revert is two steps too: it restores the recorded values only with its own confirmation, audits power.reverted and clears the record', async () => {
    const f = fixture();
    await f.call('power.apply', { confirmToken: (await f.preview('apply')).confirmToken });
    const before = f.changes().length;
    const preview = await f.preview('revert');
    expect(preview.consequenceClass).toEqual(['system-config']);
    expect(preview.summary).toMatchObject({ action: 'revert', commands: ['powercfg /change standby-timeout-ac 30', 'powercfg /change hibernate-timeout-ac 180'], restores: { standby: 30, hibernate: 180 } });
    expect(f.changes()).toHaveLength(before);
    expect(f.plan).toEqual({ sleep: 0, hibernate: 0 });

    await expect(f.call('power.revert', { confirmToken: preview.confirmToken })).resolves.toMatchObject({ action: 'revert', after: { sleepAcMinutes: 30, hibernateAcMinutes: 180 } });
    expect(f.plan).toEqual({ sleep: 30, hibernate: 180 });
    expect(f.audits().map((a) => `${a.event}:${a.outcome}`)).toEqual(['power.changed:success', 'power.reverted:success']);
    expect(readPowerState(f.db)).toMatchObject({ optedOut: true });
    expect(readPowerState(f.db).previous).toBeUndefined();
    // with nothing recorded any more there is nothing to revert, and no confirmation is issued for it
    expect((await f.fail('power.preview', { action: 'revert' })).code).toBe('conflict');
    expect((await f.fail('power.revert', { confirmToken: preview.confirmToken })).code).toBe('conflict');
  });

  it('a revert preview is refused when the Hub never applied the policy, and a moved recorded state invalidates a staged revert', async () => {
    const f = fixture();
    const none = await f.fail('power.preview', { action: 'revert' });
    expect(none.code).toBe('conflict');
    expect(f.staged().size).toBe(0);
    await f.call('power.apply', { confirmToken: (await f.preview('apply')).confirmToken });
    const { confirmToken } = await f.preview('revert');
    f.plan.sleep = 5; // changed by someone else after the preview
    expect((await f.fail('power.revert', { confirmToken })).code).toBe('conflict');
    expect(f.plan.sleep).toBe(5);
  });

  it('issues no confirmation when there is nothing to change, off Windows, or when powercfg cannot be understood', async () => {
    const ok = fixture({ sleep: 0, hibernate: 0 });
    expect((await ok.fail('power.preview', { action: 'apply' })).code).toBe('conflict');
    expect(ok.staged().size).toBe(0);
    const linux = fixture({ platform: 'linux' });
    expect((await linux.fail('power.preview', { action: 'apply' })).code).toBe('unsupported');
    expect(linux.staged().size).toBe(0);
    expect(linux.calls).toEqual([]);
    const unreadable = fixture({ unreadable: true });
    expect((await unreadable.fail('power.preview', { action: 'apply' })).code).toBe('unavailable');
    expect(unreadable.staged().size).toBe(0);
    expect((await ok.fail('power.preview', { action: 'sideways' })).code).toBe('bad-request');
    expect((await ok.fail('power.preview', undefined)).code).toBe('bad-request');
  });

  it('reports a failing powercfg as power-failed without powercfg output, audits the failure and keeps the old values for a revert', async () => {
    const f = fixture({ failChange: true });
    const { confirmToken } = await f.preview('apply');
    const error = await f.fail('power.apply', { confirmToken });
    expect(error.code).toBe('power-failed');
    expect(JSON.stringify(error)).not.toContain('Access is denied');
    expect(f.audits()).toEqual([expect.objectContaining({ event: 'power.changed', outcome: 'failure' })]);
    expect(readPowerState(f.db)).toMatchObject({ previous: { standby: 30, hibernate: 180 } });
    expect(readPowerState(f.db).appliedAt).toBeUndefined();
  });

  it('status needs no confirmation and writes nothing', async () => {
    const f = fixture();
    const status = (await f.call('power.status', {})) as Record<string, unknown>;
    expect(status).toMatchObject({ verdict: 'needs-change', sleepAcMinutes: 30, hibernateAcMinutes: 180, revertAvailable: false, applied: false });
    expect(f.changes()).toEqual([]);
    expect(readPowerState(f.db)).toEqual({});
    expect(f.audits()).toEqual([]);
    await f.call('power.apply', { confirmToken: (await f.preview('apply')).confirmToken });
    expect(await f.call('power.status', {})).toMatchObject({ verdict: 'ok', applied: true, revertAvailable: true, previous: { standby: 30, hibernate: 180 } });
  });

  it('is reachable only over the admin pipe: no HTTP route can issue or consume the confirmation or run powercfg', async () => {
    const hub = await startTestHub();
    try {
      expect(hub.app.printRoutes({ commonPrefix: false })).not.toMatch(/power/i);
    } finally {
      await hub.close();
    }
    const srcRoot = path.resolve(import.meta.dirname, '..');
    const offenders: string[] = [];
    for (const dir of ['server', 'auth', 'realtime', 'devices', 'security', 'collab', 'notifications']) {
      for (const entry of readdirSync(path.join(srcRoot, dir), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts') || /\.spec\.ts$/.test(entry.name) || entry.name === 'test-helpers.ts') continue;
        const file = path.join(entry.parentPath, entry.name);
        if (/POWER_APPLY_ACTION|POWER_REVERT_ACTION|['"]power\.(apply|revert|preview|status)|admin\/power-methods|power\/power-policy|power\/powercfg|powercfg/.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(srcRoot, file));
      }
    }
    expect(offenders).toEqual([]);
    expect(POWER_REVERT_ACTION).toBe('power.revert');
  });
});
