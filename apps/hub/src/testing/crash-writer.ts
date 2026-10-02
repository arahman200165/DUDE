// Test helper: opens the Hub DB at argv[2] and commits canonical favorites forever, printing `commit <revision>` after
// each committed write. The crash spec bundles this file, spawns it and SIGKILLs it.
import path from 'node:path';
import { openHubDb } from '../db/open-hub-db.js';
import { commitCanonical } from '../db/canonical-repository.js';

const dir = process.argv[2];
const opened = openHubDb({ dbFile: path.join(dir, 'dude.db'), preMigrationDir: path.join(dir, 'pre-migration') });
if (opened.status !== 'ready') {
  console.error(`not ready: ${opened.message}`);
  process.exit(2);
}
const { db } = opened.hub;
db.prepare("INSERT OR IGNORE INTO environment(environment_id, display_name, created_at) VALUES('env-crash', 'Crash', '2026-01-01T00:00:00.000Z')").run();

let i = 0;
for (;;) {
  const targetId = `item-${i % 40}`;
  const entityId = `tool:${targetId}`;
  const result = i % 7 === 6
    ? commitCanonical(db, { environmentId: 'env-crash', entityType: 'favorite', entityId, op: 'delete', opId: `op-${i}`, now: new Date().toISOString() })
    : commitCanonical(db, {
      environmentId: 'env-crash', entityType: 'favorite', entityId, op: 'upsert', opId: `op-${i}`, now: new Date().toISOString(),
      payload: { id: entityId, kind: 'tool', targetId, order: i },
    });
  process.stdout.write(`commit ${result.revision}\n`);
  i++;
}
