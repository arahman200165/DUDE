import { existsSync, mkdirSync } from 'node:fs';
import { openSqliteDatabase, runMigrations } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { createLocalBlobStore } from '../../blobs/local-blob-store.js';
import { createDefaultJobHandlers } from '../../queue/handlers.js';
import { createJobQueue } from '../../queue/job-queue.js';
import { JOB_KINDS } from '../../queue/job-kinds.js';
import { SAVESPHERE_MIGRATIONS } from '../../savesphere-db/migrations/index.js';
import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext } from '../types.js';

/**
 * A `noop.echo` job through the real queue code and the real handler, against a throwaway in-memory database with the real
 * `savesphere.db` migrations. The live `jobs` table is never written (a probe row would race the running runner and leave a
 * residue after every run), yet the enqueue, atomic claim, handler and completion paths all run.
 */
async function echoRoundTrip(): Promise<void> {
  const scratch: Db = openSqliteDatabase(':memory:');
  try {
    runMigrations(scratch, SAVESPHERE_MIGRATIONS, { backupDir: '', now: () => new Date() });
    const queue = createJobQueue({ db: scratch });
    const { id } = queue.enqueue({ kind: 'noop.echo', payload: { probe: 'provisioning' }, maxAttempts: 1 });
    const claimed = queue.claim('provisioning-probe', { kinds: ['noop.echo'] });
    if (claimed?.id !== id) throw new Error('the probe job was not claimed');
    const handler = createDefaultJobHandlers({ db: scratch, blobs: createLocalBlobStore({ blobsDir: '', stagingDir: '' }) })['noop.echo'];
    if (handler?.isolation !== 'inline') throw new Error('noop.echo has no inline handler');
    const result = await handler.run({ job: { id: claimed.id, kind: claimed.kind, payload: claimed.payload, attempt: claimed.attempt }, signal: new AbortController().signal, progress: () => undefined });
    if (!queue.complete(id, 'provisioning-probe', result)) throw new Error('the probe job could not be completed');
    if (queue.status().counts.succeeded !== 1) throw new Error('the probe job did not finish');
  } finally {
    scratch.close();
  }
}

/**
 * The durable queue over `savesphere.db` (`jobs`, migration 0003): the table exists, every declared job kind has a handler and a
 * `noop.echo` job runs end to end. A Hub that started before the store existed has no runner until it restarts, which is reported
 * as needing attention rather than ready.
 */
export const queueComponent: ProvisioningComponent = {
  id: 'queue',
  core: true,
  async check(context: ProvisioningContext): Promise<ComponentOutcome> {
    const { store } = context;
    if (store.state === 'absent') return { state: 'not-configured', detail: 'The job queue lives in the content store, which has not been created yet.', nextAction: 'Run "dude-hub provision".' };
    if (store.state !== 'ready') return { state: 'needs-attention', detail: 'The job queue is unavailable because the content store is not usable.', nextAction: 'Fix the content store first.' };
    const table = store.db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'jobs'").get();
    if (table === undefined) return { state: 'needs-attention', detail: 'The content store has no jobs table.', nextAction: 'Run "dude-hub provision" to apply the store migrations.' };
    const handlers = createDefaultJobHandlers({ db: store.db, blobs: createLocalBlobStore(context.paths) });
    const missing = JOB_KINDS.filter((kind) => !Object.hasOwn(handlers, kind));
    if (missing.length > 0) return { state: 'needs-attention', detail: `${missing.length} job kind${missing.length === 1 ? ' has' : 's have'} no handler registered.`, nextAction: 'Update the Hub.' };
    try {
      await echoRoundTrip();
    } catch {
      return { state: 'needs-attention', detail: 'A test job could not be queued, claimed and completed.', nextAction: 'Update the Hub; if it persists, restore the content store from a backup.' };
    }
    const counts = createJobQueue({ db: store.db }).status().counts;
    const waiting = `${counts.queued} queued, ${counts.running} running`;
    if (context.queueRunning === false) {
      return { state: 'needs-attention', detail: `The queue is ready (${waiting}) but this Hub started without it, so no jobs run yet.`, nextAction: 'Restart the Hub service so the queue runner starts.' };
    }
    return { state: 'ready', detail: `A test job ran end to end (${waiting}).` };
  },
};

/**
 * Isolated workers: the Hub executable re-spawned in internal worker mode exchanges one message with its parent (the Milestone 830
 * proof). A failure leaves the inline jobs working and only blocks work that needs isolation.
 */
export const workersComponent: ProvisioningComponent = {
  id: 'workers',
  core: true,
  provision(context: ProvisioningContext): string[] {
    if (existsSync(context.paths.workersDir)) return [];
    mkdirSync(context.paths.workersDir, { recursive: true });
    return ['storage/workers'];
  },
  async check(context: ProvisioningContext): Promise<ComponentOutcome> {
    try {
      const how = await context.probes.workerPing();
      return { state: 'ready', detail: `A worker process started and answered (${how}).` };
    } catch {
      return { state: 'degraded', detail: 'A worker process could not be started, so work that needs isolation cannot run.', nextAction: 'Reinstall or update the Hub; check that antivirus is not blocking its executable.' };
    }
  },
};
