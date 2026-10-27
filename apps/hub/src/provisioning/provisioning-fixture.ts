import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hubPaths } from '../config/data-dir.js';
import type { HubPaths } from '../config/data-dir.js';
import type { ProvisioningOptions } from './engine.js';
import type { ProvisioningProbes } from './types.js';

/** Spec fixtures for the provisioning engine (never imported by production code). */
export const GIB = 1024 ** 3;

export const roots: string[] = [];
export function cleanRoots(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

export function tempPaths(label = 'prov'): HubPaths {
  const root = mkdtempSync(path.join(os.tmpdir(), `dude-hub-${label}-`));
  roots.push(root);
  return hubPaths(root);
}

/** Probes that touch nothing: no process, no library, plenty of disk. Vector is unavailable the way it is on Docker. */
export function fakeProbes(overrides: Partial<ProvisioningProbes> = {}): ProvisioningProbes {
  return {
    sqliteVec: () => ({ available: false, reason: 'no pinned sqlite-vec library for linux-x64' }),
    fts5: () => 'fts5',
    workerPing: () => Promise.resolve('node re-spawn, one message exchanged'),
    freeBytes: () => 50 * GIB,
    ...overrides,
  };
}

/** Linux platform so the secret store uses its 0600-file fallback (Docker parity) and never PowerShell. */
export function engineOptions(overrides: Partial<ProvisioningOptions> = {}): ProvisioningOptions {
  return { platform: 'linux', probes: fakeProbes(), now: () => Date.parse('2026-10-27T12:00:00.000Z'), ...overrides };
}

/**
 * A restored data directory (backup restore, Phase 31G): `savesphere.db` is carried over (its `meta` is a kept table), while the
 * machine-bound secrets, the storage directories and the cache are absent and `hub.json` keeps only the port and names.
 */
export function restoreInto(source: HubPaths): HubPaths {
  const target = tempPaths('restored');
  mkdirSync(target.dataDir, { recursive: true });
  mkdirSync(target.configDir, { recursive: true });
  cpSync(source.saveSphereDbPath, target.saveSphereDbPath);
  for (const suffix of ['-wal', '-shm']) if (existsSync(source.saveSphereDbPath + suffix)) cpSync(source.saveSphereDbPath + suffix, target.saveSphereDbPath + suffix);
  writeFileSync(target.configFile, JSON.stringify({ port: 8443, bind: 'loopback', exposure: { mode: 'private', names: ['hub.example.test'] } }));
  return target;
}
