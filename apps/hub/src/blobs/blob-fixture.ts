import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hubPaths } from '../config/data-dir.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import { createLocalBlobStore } from './local-blob-store.js';
import { addBlobRef, recordBlob } from './registry.js';

/** Spec fixture: a real `savesphere.db`, a real local blob store and a controllable clock. */
export function openBlobFixture(start = '2026-10-27T12:00:00.000Z') {
  const paths = hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-blobfx-')));
  const opened = openSaveSphereDb(paths);
  if (opened.status !== 'ready') throw new Error('expected ready');
  const store = createLocalBlobStore(paths);
  let clock = Date.parse(start);
  const db = opened.store.db;
  return {
    paths,
    db,
    store,
    close: () => opened.store.close(),
    now: () => clock,
    advance: (ms: number) => { clock += ms; },
    /** Stores `text`, catalogues it and optionally references it; returns its hash. */
    async add(text: string, ownerId?: string): Promise<string> {
      const put = await store.put(Buffer.from(text));
      recordBlob(db, { sha256: put.sha256, size: put.size, now: clock, created: put.created });
      if (ownerId !== undefined) addBlobRef(db, { sha256: put.sha256, ownerKind: 'attachment', ownerId, now: clock });
      return put.sha256;
    },
  };
}
