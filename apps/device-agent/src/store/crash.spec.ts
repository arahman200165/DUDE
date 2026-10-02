import { spawn } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';

afterEach(cleanupTemp);

describe('hard-kill durability', () => {
  it('keeps every journaled record without a Hub revision paired with exactly one outbox op', async () => {
    const work = tempDir();
    const bundle = path.join(work, 'crash-writer.cjs');
    await build({
      entryPoints: [path.resolve(__dirname, '../testing/crash-writer.ts')],
      outfile: bundle,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      logLevel: 'silent',
    });

    const dbDir = path.join(work, 'store');
    const child = spawn(process.execPath, [bundle, dbDir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let commits = 0;
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`writer too slow (${commits} commits). ${stderr}`)), 30_000);
      child.stdout.on('data', (d: Buffer) => {
        commits += d.toString().split('\n').filter((l) => l.startsWith('commit')).length;
        if (commits >= 50) { clearTimeout(timer); resolve(); }
      });
      child.once('exit', () => { clearTimeout(timer); reject(new Error(`writer exited early. ${stderr}`)); });
    });
    child.kill('SIGKILL');
    await exited;

    const store = openReady(dbDir, { machineGuid: null });
    expect(store.db.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
    const unsent = store.db.prepare(
      `SELECT r.entity_id FROM records r WHERE r.hub_revision IS NULL AND r.entity_type = 'favorite'
         AND (SELECT COUNT(*) FROM outbox o WHERE o.entity_type = r.entity_type AND o.entity_id = r.entity_id AND o.op_kind = 'upsert') <> 1`,
    ).all();
    expect(unsent).toEqual([]);
    const orphanOps = store.db.prepare(
      `SELECT o.entity_id FROM outbox o WHERE o.op_kind = 'upsert'
         AND NOT EXISTS (SELECT 1 FROM records r WHERE r.entity_type = o.entity_type AND r.entity_id = o.entity_id)`,
    ).all();
    expect(orphanOps).toEqual([]);
    const recordCount = (store.db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n;
    expect(recordCount).toBeGreaterThan(0);
  }, 60_000);
});
