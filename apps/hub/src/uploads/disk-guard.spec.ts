import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UPLOAD_MIN_FREE_BYTES, createDiskGuard, createVolumeProbe } from './disk-guard.js';

const MIB = 1024 * 1024;

describe('upload disk guard', () => {
  it('keeps the larger of 512 MiB and 5% of the volume free', () => {
    const small = createDiskGuard({ probe: () => ({ freeBytes: 1000 * MIB, totalBytes: 2000 * MIB }) }); // 5% = 100 MiB, so the 512 MiB floor rules
    expect(small.check(488 * MIB).ok).toBe(true);
    expect(small.check(489 * MIB).ok).toBe(false);
    expect(small.check(1).reserveBytes).toBe(UPLOAD_MIN_FREE_BYTES);
    const big = createDiskGuard({ probe: () => ({ freeBytes: 2000 * MIB, totalBytes: 20_000 * MIB }) }); // 5% = 1000 MiB
    expect(big.check(1000 * MIB).ok).toBe(true);
    expect(big.check(1001 * MIB).ok).toBe(false);
  });

  it('is injectable, and an unmeasurable volume does not refuse', () => {
    expect(createDiskGuard({ probe: () => null }).check(2 ** 50).ok).toBe(true);
    expect(createDiskGuard({ probe: () => ({ freeBytes: 10, totalBytes: 100 }), minFreeBytes: 5, minFreeFraction: 0 }).check(5).ok).toBe(true);
  });

  it('measures the nearest existing ancestor of a directory that does not exist yet', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'ss-guard-'));
    const space = createVolumeProbe(path.join(root, 'storage', 'uploads'))();
    expect(space).not.toBeNull();
    expect(space!.totalBytes).toBeGreaterThan(0);
    expect(space!.freeBytes).toBeLessThanOrEqual(space!.totalBytes);
  });
});
