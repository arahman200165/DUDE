import { statfsSync } from 'node:fs';
import { probeFts5, probeWorkerRespawn } from '../cli/self-test.js';
import { probeSqliteVec } from '../db/sqlite-vec.js';
import type { ProvisioningProbes } from './types.js';

/** The production probes: the Milestone 830 capability probes of `dude-hub self-test` plus the volume's free space. */
export function defaultProbes(overrides: Partial<ProvisioningProbes> = {}): ProvisioningProbes {
  return {
    sqliteVec: () => probeSqliteVec(),
    fts5: probeFts5,
    workerPing: probeWorkerRespawn,
    freeBytes: (dir) => {
      try {
        const stats = statfsSync(dir);
        return Number(stats.bavail) * Number(stats.bsize);
      } catch {
        return null;
      }
    },
    ...overrides,
  };
}
