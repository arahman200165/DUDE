// Test helper: opens a store in the directory given as argv[2] and commits journaled entities forever,
// printing one line per commit. The crash spec bundles this file, spawns it and SIGKILLs it.
import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@dude/persistence';
import { openDeviceStore } from '../store/open-store.js';
import { commitEntity } from '../store/entity-commit.js';

const dir = process.argv[2];
const result = openDeviceStore({
  dir,
  machineGuid: null,
  appInfo: { appVersion: '0.0.0', platform: 'windows', os: 'win32', arch: 'x64' },
  capabilities: {},
  now: () => new Date(),
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
});
if (result.status !== 'ready') {
  console.error(`not ready: ${result.message}`);
  process.exit(2);
}
const { store } = result;
const ctx = {
  deviceId: store.device.deviceId,
  environmentId: 'env-crash',
  now: () => new Date(),
  newOpId: () => uuidv7((n) => new Uint8Array(randomBytes(n)), () => Date.now()),
};

let i = 0;
for (;;) {
  const id = `item-${i % 40}`;
  const order = i;
  const outcome = i % 7 === 6
    ? commitEntity(store.db, ctx, { entityType: 'favorite', entityId: `tool:${id}`, op: 'delete' })
    : commitEntity(store.db, ctx, { entityType: 'favorite', entityId: `tool:${id}`, op: 'upsert', payload: { id: `tool:${id}`, kind: 'tool', targetId: id, order } });
  if (!outcome.ok) throw new Error(outcome.error);
  process.stdout.write(`commit ${i}\n`);
  i++;
}
