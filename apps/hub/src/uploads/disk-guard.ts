import { statfsSync } from 'node:fs';
import path from 'node:path';

const MIB = 1024 * 1024;

/** The floor of the free-disk guard: an upload (or a chunk) is refused when taking it would leave less than this much room, or 5% of the volume, whichever is more. */
export const UPLOAD_MIN_FREE_BYTES = 512 * MIB;
export const UPLOAD_MIN_FREE_FRACTION = 0.05;

export interface VolumeSpace {
  freeBytes: number;
  totalBytes: number;
}

/** Measures the volume holding the uploads directory; null when the platform cannot say (the guard then does not refuse, a real write failure still maps to storage-full). */
export type VolumeProbe = () => VolumeSpace | null;

export interface DiskGuardOptions {
  probe: VolumeProbe;
  minFreeBytes?: number;
  minFreeFraction?: number;
}

export interface DiskGuardVerdict {
  ok: boolean;
  freeBytes: number | null;
  reserveBytes: number;
}

export interface DiskGuard {
  /** Whether `incomingBytes` more can be stored while still leaving the reserve free. */
  check(incomingBytes: number): DiskGuardVerdict;
}

/** `statfs` of the nearest existing ancestor of `dir` (the uploads directory is created lazily). Same arithmetic as the provisioning probe. */
export function createVolumeProbe(dir: string): VolumeProbe {
  return () => {
    let current = path.resolve(dir);
    for (let depth = 0; depth < 32; depth += 1) {
      try {
        const stats = statfsSync(current);
        return { freeBytes: Number(stats.bavail) * Number(stats.bsize), totalBytes: Number(stats.blocks) * Number(stats.bsize) };
      } catch (error) {
        const parent = path.dirname(current);
        if (parent === current || (error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
        current = parent;
      }
    }
    return null;
  };
}

export function createDiskGuard(options: DiskGuardOptions): DiskGuard {
  const minBytes = options.minFreeBytes ?? UPLOAD_MIN_FREE_BYTES;
  const fraction = options.minFreeFraction ?? UPLOAD_MIN_FREE_FRACTION;
  return {
    check(incomingBytes) {
      const space = options.probe();
      if (space === null) return { ok: true, freeBytes: null, reserveBytes: minBytes };
      const reserveBytes = Math.max(minBytes, Math.ceil(space.totalBytes * fraction));
      return { ok: space.freeBytes - incomingBytes >= reserveBytes, freeBytes: space.freeBytes, reserveBytes };
    },
  };
}
