import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { internalWorkerArgs } from './worker-mode.js';
import type { InternalWorkerCommand } from './worker-mode.js';

let bundled: Promise<string> | undefined;

/**
 * Spec helper: bundles `test-worker-entry.ts` with esbuild once per process into a temporary CJS file, so specs can spawn a real
 * worker child running the real protocol and the test handlers (a spec cannot re-spawn the TypeScript sources).
 */
export function buildTestWorkerBundle(): Promise<string> {
  bundled ??= (async () => {
    const outfile = path.join(mkdtempSync(path.join(os.tmpdir(), 'dude-test-worker-')), 'test-worker.cjs');
    await build({
      entryPoints: [path.join(import.meta.dirname, 'test-worker-entry.ts')],
      bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile, logLevel: 'silent',
    });
    return outfile;
  })();
  return bundled;
}

/** The command a pool spawns for the test worker bundle. */
export const testWorkerCommand = (bundle: string): (() => InternalWorkerCommand) => () => internalWorkerArgs('job', { sea: false, scriptPath: bundle });
