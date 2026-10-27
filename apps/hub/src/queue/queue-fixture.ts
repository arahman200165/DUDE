import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hubPaths } from '../config/data-dir.js';
import type { HubPaths } from '../config/data-dir.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import type { SaveSphereDb } from '../savesphere-db/open.js';
import { createJobQueue } from './job-queue.js';
import type { JobQueueOptions } from './job-queue.js';

export const TEST_KINDS = [
  'noop.echo', 'blobs.verify', 'blobs.staging-sweep',
  'test.echo', 'test.sleep', 'test.fail', 'test.permanent', 'test.crash', 'test.oom', 'test.flaky', 'test.env', 'test.scratch',
  'inline.ok', 'inline.fail', 'inline.slow', 'inline.permanent', 'inline.attention',
];

/** Spec fixture: a real `savesphere.db` in a temp directory, a controllable clock and a queue over it that accepts the test kinds. */
export function openQueueFixture(options: Partial<Omit<JobQueueOptions, 'db'>> = {}, root = mkdtempSync(path.join(os.tmpdir(), 'ss-queue-'))) {
  const paths: HubPaths = hubPaths(root);
  const opened = openSaveSphereDb(paths);
  if (opened.status !== 'ready') throw new Error('expected ready');
  const store: SaveSphereDb = opened.store;
  let clock = Date.parse('2026-10-27T12:00:00.000Z');
  const now = (): number => clock;
  const queue = createJobQueue({ db: store.db, now, kinds: TEST_KINDS, ...options });
  return {
    paths,
    store,
    db: store.db,
    queue,
    now,
    advance: (ms: number) => { clock += ms; },
    close: () => store.close(),
    /** A second connection to the same file (another claimer). */
    reopen: () => {
      const second = openSaveSphereDb(paths);
      if (second.status !== 'ready') throw new Error('expected ready');
      return { store: second.store, queue: createJobQueue({ db: second.store.db, now, kinds: TEST_KINDS, ...options }) };
    },
    row: (id: string) => store.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown>,
  };
}
