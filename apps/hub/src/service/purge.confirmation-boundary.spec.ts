import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { PURGE_CONSEQUENCE_CLASS, PURGE_PHRASE, PURGE_TTL_MS, purgeConfirmFile, readOnlyCounts, runPurge } from './purge.js';
import type { PurgeDeps } from './purge.js';

/** The Destructive-Action Contract's confirmation-boundary spec for `dude-hub purge`. */
function hubRoot() {
  const root = ensureLayout(tempDir('hub-purge-'));
  const opened = openHubDb({ dbFile: root.dbFile, preMigrationDir: root.preMigrationDir });
  if (opened.status !== 'ready') throw new Error('db');
  opened.hub.close();
  writeFileSync(path.join(root.logsDir, 'hub.log'), 'line\n');
  writeFileSync(path.join(root.storageDir, 'blob.bin'), 'abcdef');
  writeFileSync(path.join(root.backupsDir, 'backup.db'), 'backup');
  return root;
}

function harness(over: PurgeDeps = {}) {
  const out: string[] = [];
  const err: string[] = [];
  let clock = 1_000_000;
  const deps: PurgeDeps = {
    platform: 'linux',
    stdout: (t) => void out.push(t),
    stderr: (t) => void err.push(t),
    now: () => clock,
    isRunning: async () => false,
    ...over,
  };
  return { out, err, deps, advance: (ms: number) => { clock += ms; }, json: () => JSON.parse(out.join('')) as Record<string, any> };
}

const present = (root: ReturnType<typeof hubRoot>) => ({
  data: existsSync(root.dbFile),
  config: existsSync(root.configDir),
  storage: existsSync(root.storageDir),
  logs: existsSync(root.logsDir),
  backups: existsSync(root.backupsDir),
});
const ALL = { data: true, config: true, storage: true, logs: true, backups: true };

async function preview(root: ReturnType<typeof hubRoot>, extra: { includeBackups?: boolean } = {}, over: PurgeDeps = {}) {
  const h = harness(over);
  const code = await runPurge({ dataDir: root.root, ...extra }, h.deps);
  return { h, code, token: h.json()['confirmToken'] as string };
}

describe('purge confirmation boundary', () => {
  it('is tagged with the irreversible-destruction consequence classes', () => {
    expect(PURGE_CONSEQUENCE_CLASS).toEqual(['filesystem-write', 'database-write']);
  });

  it('the preview deletes nothing, lists exact paths and sizes, keeps backups unless asked, and stages a hashed single-use token', async () => {
    const root = hubRoot();
    const { h, code, token } = await preview(root);
    expect(code).toBe(0);
    expect(present(root)).toEqual(ALL);
    const report = h.json();
    expect(report['previewOnly']).toBe(true);
    expect(report['consequenceClass']).toEqual(['filesystem-write', 'database-write']);
    expect(report['willDelete'].map((e: { name: string }) => e.name)).toEqual(['data', 'config', 'storage', 'logs']);
    expect(report['willDelete'].find((e: { name: string }) => e.name === 'storage')).toMatchObject({ path: root.storageDir, files: 1, bytes: 6 });
    expect(report['backupsKept']).toBe(true);
    expect(report['counts']).toMatchObject({ devices: 0, sessions: 0 });
    const staged = readFileSync(purgeConfirmFile(root.root), 'utf8');
    expect(staged).not.toContain(token);
    expect(JSON.parse(staged)).toMatchObject({ v: 1, expiresAt: 1_000_000 + PURGE_TTL_MS });

    const withBackups = await preview(root, { includeBackups: true });
    expect(withBackups.h.json()['willDelete'].map((e: { name: string }) => e.name)).toContain('backups');
    expect(present(root)).toEqual(ALL);
  });

  it('refuses a confirm without a preview', async () => {
    const root = hubRoot();
    const h = harness();
    expect(await runPurge({ dataDir: root.root, confirm: 'anything', type: PURGE_PHRASE }, h.deps)).toBe(1);
    expect(h.err.join('')).toMatch(/no pending preview/);
    expect(present(root)).toEqual(ALL);
  });

  it('refuses a wrong token, an expired token and a replayed token', async () => {
    const root = hubRoot();
    const first = await preview(root);
    const wrong = harness();
    expect(await runPurge({ dataDir: root.root, confirm: 'wrong-token', type: PURGE_PHRASE }, wrong.deps)).toBe(1);
    expect(wrong.err.join('')).toMatch(/not valid/);
    expect(present(root)).toEqual(ALL);
    // the wrong attempt consumed the staged token, so even the right one is now refused
    expect(await runPurge({ dataDir: root.root, confirm: first.token, type: PURGE_PHRASE }, harness().deps)).toBe(1);

    const second = await preview(root);
    const late = harness({ now: () => 1_000_000 + PURGE_TTL_MS + 1 });
    expect(await runPurge({ dataDir: root.root, confirm: second.token, type: PURGE_PHRASE }, late.deps)).toBe(1);
    expect(late.err.join('')).toMatch(/expired/);
    expect(present(root)).toEqual(ALL);

    const third = await preview(root);
    expect(await runPurge({ dataDir: root.root, confirm: third.token, type: PURGE_PHRASE }, harness().deps)).toBe(0);
    expect(present(root).data).toBe(false);
    // replay after success: the staged token is gone
    const replay = harness();
    expect(await runPurge({ dataDir: root.root, confirm: third.token, type: PURGE_PHRASE }, replay.deps)).not.toBe(0);
  });

  it('refuses a missing or incorrect typed phrase without consuming the preview', async () => {
    const root = hubRoot();
    const { token } = await preview(root);
    for (const type of [undefined, '', 'delete hub data', 'DELETE HUB DATA ', 'yes']) {
      const h = harness();
      expect(await runPurge({ dataDir: root.root, confirm: token, ...(type !== undefined ? { type } : {}) }, h.deps)).toBe(1);
      expect(h.err.join('')).toMatch(/--type/);
      expect(present(root)).toEqual(ALL);
    }
    expect(await runPurge({ dataDir: root.root, confirm: token, type: PURGE_PHRASE }, harness().deps)).toBe(0);
  });

  it('refuses when anything changed since the preview', async () => {
    const root = hubRoot();
    const { token } = await preview(root);
    writeFileSync(path.join(root.storageDir, 'late.bin'), 'x');
    const h = harness();
    expect(await runPurge({ dataDir: root.root, confirm: token, type: PURGE_PHRASE }, h.deps)).toBe(1);
    expect(h.err.join('')).toMatch(/changed since the preview/);
    expect(present(root)).toEqual(ALL);

    const other = await preview(root);
    const mismatch = harness();
    // a different scope (backups) than the preview is also a different digest
    expect(await runPurge({ dataDir: root.root, includeBackups: true, confirm: other.token, type: PURGE_PHRASE }, mismatch.deps)).toBe(1);
    expect(present(root)).toEqual(ALL);
  });

  it('refuses while the Hub is running, at both steps', async () => {
    const root = hubRoot();
    const running = harness({ isRunning: async () => true });
    expect(await runPurge({ dataDir: root.root }, running.deps)).toBe(1);
    expect(running.err.join('')).toMatch(/running/);
    expect(existsSync(purgeConfirmFile(root.root))).toBe(false);

    const { token } = await preview(root);
    expect(await runPurge({ dataDir: root.root, confirm: token, type: PURGE_PHRASE }, harness({ isRunning: async () => true }).deps)).toBe(1);
    expect(present(root)).toEqual(ALL);
  });

  it('refuses unsafe targets: no directory, a drive root, or a directory that is not a Hub', async () => {
    const h = harness();
    expect(await runPurge({}, h.deps)).toBe(2);
    expect(await runPurge({ dataDir: path.parse(process.cwd()).root }, harness().deps)).toBe(2);
    expect(await runPurge({ dataDir: tempDir('not-a-hub-') }, harness().deps)).toBe(2);
  });

  it('with the right token and phrase deletes data, config, storage and logs, keeps backups and writes a log outside the tree', async () => {
    const root = hubRoot();
    const { token } = await preview(root);
    const h = harness();
    expect(await runPurge({ dataDir: root.root, confirm: token, type: PURGE_PHRASE }, h.deps)).toBe(0);
    expect(present(root)).toEqual({ data: false, config: false, storage: false, logs: false, backups: true });
    const result = h.json();
    expect(result['purged']).toBe(true);
    expect(result['removed'].map((r: { name: string }) => r.name)).toEqual(['data', 'config', 'storage', 'logs']);
    expect(existsSync(purgeConfirmFile(root.root))).toBe(false);
    const logs = readdirSync(root.root).filter((f) => f.startsWith('purge-') && f.endsWith('.log'));
    expect(logs).toHaveLength(1);
    expect(readFileSync(path.join(root.root, logs[0]!), 'utf8')).toMatch(/purge completed removed=data/);
  });

  it('--include-backups removes backups too', async () => {
    const root = hubRoot();
    const { token } = await preview(root, { includeBackups: true });
    expect(await runPurge({ dataDir: root.root, includeBackups: true, confirm: token, type: PURGE_PHRASE }, harness().deps)).toBe(0);
    expect(present(root).backups).toBe(false);
  });

  it('reads counts from the database read-only', () => {
    const root = hubRoot();
    expect(readOnlyCounts(root.dbFile)).toEqual({ devices: 0, activeDevices: 0, sessions: 0 });
    expect(readOnlyCounts(path.join(root.root, 'missing.db'))).toMatchObject({ devices: 0 });
    const garbage = path.join(root.root, 'garbage.db');
    writeFileSync(garbage, 'not a database');
    expect(readOnlyCounts(garbage).devices).toBeNull();
  });
});
