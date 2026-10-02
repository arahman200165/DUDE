import { mkdtempSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { uuidv7 } from '@dude/persistence';
import { openDeviceStore } from '../store/open-store.js';
import type { DeviceStore, OpenStoreOptions } from '../store/open-store.js';
import type { CommitContext } from '../store/entity-commit.js';

const dirs: string[] = [];
const stores: DeviceStore[] = [];

export function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dude-device-agent-'));
  dirs.push(dir);
  return dir;
}

export function openOptions(dir: string, overrides: Partial<OpenStoreOptions> = {}): OpenStoreOptions {
  return {
    dir,
    machineGuid: 'guid-A',
    appInfo: { appVersion: '1.0.0', platform: 'windows', os: 'win32', arch: 'x64' },
    capabilities: {},
    now: () => new Date(),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    ...overrides,
  };
}

export function openReady(dir: string, overrides: Partial<OpenStoreOptions> = {}): DeviceStore {
  const result = openDeviceStore(openOptions(dir, overrides));
  if (result.status !== 'ready') throw new Error(`store not ready: ${result.status} ${result.message}`);
  stores.push(result.store);
  return result.store;
}

export function commitContext(store: DeviceStore, overrides: Partial<CommitContext> = {}): CommitContext {
  return {
    deviceId: store.device.deviceId,
    environmentId: 'env-1',
    now: () => new Date(),
    newOpId: () => uuidv7((n) => new Uint8Array(randomBytes(n)), () => Date.now()),
    ...overrides,
  };
}

/** Close every opened store before removing directories (Windows holds file locks). */
export function cleanupTemp(): void {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}
