import { mkdirSync, symlinkSync, utimesSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkProvisioning, provision } from './engine.js';
import { cacheStats, sweepCache } from './cache.js';
import { blobStoreComponent, BLOB_LOW_DISK_BYTES } from './components/blob-store.js';
import { cleanRoots, engineOptions, fakeProbes, tempPaths } from './provisioning-fixture.js';
import type { ProvisioningProbes } from './types.js';

afterEach(cleanRoots);

async function component(id: string, probes: Partial<ProvisioningProbes>, platform: NodeJS.Platform = 'linux') {
  const paths = tempPaths();
  const run = await provision(paths, engineOptions({ platform, probes: fakeProbes(probes) }));
  return run.report.components.find((c) => c.id === id)!;
}

describe('vector component', () => {
  it('is ready with the version when the pinned library loads', async () => {
    const vector = await component('vector', { sqliteVec: () => ({ available: true, version: 'v0.1.9', path: 'C:\\hub\\vec0.dll' }) }, 'win32');
    expect(vector).toMatchObject({ state: 'ready' });
    expect(vector.detail).toContain('v0.1.9');
    expect(vector.detail).not.toContain('vec0.dll');
  });

  it('is unavailable by design on Docker, with a reason and no next action, and never an error', async () => {
    const vector = await component('vector', { sqliteVec: () => ({ available: false, reason: 'no pinned sqlite-vec library for linux-x64' }) });
    expect(vector.state).toBe('unavailable');
    expect(vector.detail).toMatch(/not available in this deployment/);
    expect(vector.nextAction).toBeUndefined();
    const paths = tempPaths();
    const run = await provision(paths, engineOptions());
    expect(run.report.overall).toBe('ready');
  });

  it.each([
    ['vec0.dll not found at C:\\Program Files\\DUDE Hub\\vec0.dll', /was not found beside the Hub/],
    ['vec0.dll hash mismatch (abcdef0123); it was not loaded', /did not match its pinned hash/],
    ['loadExtension failed: C:\\x\\vec0.dll is not a valid Win32 application', /could not be loaded/],
  ])('maps the Windows reason %s to a fixed sentence with no path', async (reason, expected) => {
    const vector = await component('vector', { sqliteVec: () => ({ available: false, reason }) }, 'win32');
    expect(vector.state).toBe('unavailable');
    expect(vector.detail).toMatch(expected);
    expect(`${vector.detail} ${vector.nextAction ?? ''}`).not.toMatch(/Program Files|C:\\|abcdef0123/);
    expect(vector.nextAction).toBeDefined();
  });

  it('survives a probe that throws', async () => {
    const vector = await component('vector', { sqliteVec: () => { throw new Error('boom'); } }, 'win32');
    expect(vector.state).toBe('unavailable');
  });
});

describe('blob-store component', () => {
  it('reports the free-disk figure and degrades under the low-disk line', async () => {
    const ok = await component('blob-store', { freeBytes: () => 12.5 * 1024 ** 3 });
    expect(ok.state).toBe('ready');
    expect(ok.detail).toMatch(/12\.5 GiB is free/);
    const low = await component('blob-store', { freeBytes: () => BLOB_LOW_DISK_BYTES - 1 });
    expect(low.state).toBe('degraded');
  });

  it('is ready without a figure when the volume cannot be read', async () => {
    const unknown = await component('blob-store', { freeBytes: () => null });
    expect(unknown.state).toBe('ready');
    expect(unknown.detail).toMatch(/free space unknown/);
  });

  it('needs attention when the directories are not writable', async () => {
    if (process.platform === 'win32' || (process.getuid?.() ?? 1) === 0) return; // chmod does not deny the owner on Windows or root
    const paths = tempPaths();
    await provision(paths, engineOptions());
    chmodSync(paths.blobsDir, 0o500);
    try {
      const report = await checkProvisioning(paths, engineOptions());
      expect(report.components.find((c) => c.id === 'blob-store')?.state).toBe('needs-attention');
    } finally {
      chmodSync(paths.blobsDir, 0o700);
    }
  });

  it('has no probe residue in the real blob directory and is core (a missing directory means provisioning)', async () => {
    expect(blobStoreComponent.core).toBe(true);
    const paths = tempPaths();
    await provision(paths, engineOptions());
    const report = await checkProvisioning(paths, engineOptions());
    expect(report.components.find((c) => c.id === 'blob-store')?.state).toBe('ready');
    expect(existsSync(path.join(paths.stagingDir, '.probe-'))).toBe(false);
  });
});

describe('queue component', () => {
  it('runs a noop.echo job end to end without writing the live jobs table', async () => {
    const paths = tempPaths();
    const run = await provision(paths, engineOptions());
    const queue = run.report.components.find((c) => c.id === 'queue')!;
    expect(queue.state).toBe('ready');
    expect(queue.detail).toMatch(/A test job ran end to end \(0 queued, 0 running\)/);
  });
});

describe('secrets component', () => {
  it('is not-configured with no secrets, never needs provisioning for that alone, and reports presence per purpose only', async () => {
    const paths = tempPaths();
    const run = await provision(paths, engineOptions());
    expect(run.report.components.find((c) => c.id === 'secrets')?.state).toBe('not-configured');
    expect(run.report.secrets.map((s) => s.purpose)).toEqual(['tunnel.connectorToken', 'oidc.clientSecret', 'backup.s3.credentials', 'backup.drive.refreshToken', 'backup.onedrive.refreshToken']);
    expect(run.report.secrets.every((s) => !s.present && !s.needsReentry)).toBe(true);
    expect(run.report.overall).toBe('ready');
  });
});

describe('cache', () => {
  const filesIn = (dir: string, count: number, size: number): string[] => {
    mkdirSync(dir, { recursive: true });
    return Array.from({ length: count }, (_, i) => {
      const file = path.join(dir, `f${i}.bin`);
      writeFileSync(file, Buffer.alloc(size, 1));
      const time = new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000);
      utimesSync(file, time, time);
      return file;
    });
  };

  it('sweeps the oldest files first until the cache is within its bound, and does nothing when it already is', () => {
    const dir = path.join(tempPaths().cacheDir, 'previews');
    const files = filesIn(dir, 5, 100);
    expect(cacheStats(path.dirname(dir))).toEqual({ files: 5, bytes: 500, truncated: false });
    expect(sweepCache(path.dirname(dir), 500)).toBe(0);
    expect(sweepCache(path.dirname(dir), 250)).toBe(3);
    expect(existsSync(files[0]!)).toBe(false);
    expect(existsSync(files[2]!)).toBe(false);
    expect(existsSync(files[3]!)).toBe(true);
    expect(existsSync(files[4]!)).toBe(true);
  });

  it('tolerates a missing directory and never follows a link out of the cache', () => {
    const paths = tempPaths();
    expect(sweepCache(paths.cacheDir, 0)).toBe(0);
    const outside = path.join(paths.root, 'outside');
    const [kept] = filesIn(outside, 1, 100);
    mkdirSync(paths.cacheDir, { recursive: true });
    try {
      symlinkSync(outside, path.join(paths.cacheDir, 'link'), 'junction');
    } catch {
      return; // no link privilege on this machine
    }
    expect(sweepCache(paths.cacheDir, 0)).toBe(0);
    expect(existsSync(kept!)).toBe(true);
  });

  it('is swept back under its bound by a provisioning run', async () => {
    const paths = tempPaths();
    await provision(paths, engineOptions());
    expect(paths.cacheDir.startsWith(paths.storageDir)).toBe(true);
    const report = await checkProvisioning(paths, engineOptions());
    expect(report.components.find((c) => c.id === 'cache')?.detail).toMatch(/within its bound/);
  });
});
