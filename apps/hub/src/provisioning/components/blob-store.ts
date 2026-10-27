import { createHash, randomBytes } from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createLocalBlobStore } from '../../blobs/local-blob-store.js';
import { formatBytes } from '../format.js';
import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext } from '../types.js';

/** Below this much free space on the Hub's volume the component reports `degraded` (uploads refuse earlier, at their own guard). */
export const BLOB_LOW_DISK_BYTES = 1024 * 1024 * 1024;

const RUN = 'Run "dude-hub provision".';

/**
 * Proves the blob write path on the real volume without touching the real tree: a throwaway store under `storage/staging` writes a
 * random blob, reads it back and verifies it (which exercises the stage, fsync, hard-link and read paths), then the scratch
 * directory is removed. The real `blobs/` directory never gains a probe file, so repeated runs leave nothing behind.
 */
async function roundTrip(stagingDir: string): Promise<void> {
  const scratch = mkdtempSync(path.join(stagingDir, '.probe-'));
  try {
    const store = createLocalBlobStore({ blobsDir: path.join(scratch, 'blobs'), stagingDir: path.join(scratch, 'staging') });
    const bytes = randomBytes(1024);
    const put = await store.put(bytes);
    if (put.sha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('hash mismatch');
    const chunks: Buffer[] = [];
    for await (const chunk of await store.open(put.sha256)) chunks.push(chunk as Buffer);
    if (!Buffer.concat(chunks).equals(bytes)) throw new Error('read-back mismatch');
    if ((await store.verify(put.sha256)) !== 'ok') throw new Error('verify failed');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** `storage/blobs` and `storage/staging`: present, writable, with free space and a working round trip. */
export const blobStoreComponent: ProvisioningComponent = {
  id: 'blob-store',
  core: true,
  provision(context: ProvisioningContext): string[] {
    const created: string[] = [];
    for (const [name, dir] of [['storage/blobs', context.paths.blobsDir], ['storage/staging', context.paths.stagingDir]] as const) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        created.push(name);
      }
    }
    return created;
  },
  async check(context: ProvisioningContext): Promise<ComponentOutcome> {
    const { blobsDir, stagingDir } = context.paths;
    if (!existsSync(blobsDir) || !existsSync(stagingDir)) {
      return { state: 'not-configured', detail: 'The blob directories have not been created yet.', nextAction: RUN };
    }
    try {
      accessSync(blobsDir, constants.W_OK);
      accessSync(stagingDir, constants.W_OK);
    } catch {
      return { state: 'needs-attention', detail: 'The blob directories exist but the Hub cannot write to them.', nextAction: 'Give the Hub service account write access to its storage directory.' };
    }
    try {
      await roundTrip(stagingDir);
    } catch {
      return { state: 'needs-attention', detail: 'A test blob could not be written and read back on this volume.', nextAction: 'Check the disk and permissions of the Hub storage directory, then run "dude-hub provision".' };
    }
    const free = context.probes.freeBytes(blobsDir);
    if (free === null) return { state: 'ready', detail: 'Blob storage is writable and a test blob round-tripped (free space unknown).' };
    if (free < BLOB_LOW_DISK_BYTES) {
      return { state: 'degraded', detail: `Blob storage works but only ${formatBytes(free)} is free on its volume.`, nextAction: 'Free disk space on the Hub machine before storing more attachments.' };
    }
    return { state: 'ready', detail: `Blob storage is writable, a test blob round-tripped and ${formatBytes(free)} is free.` };
  },
};
