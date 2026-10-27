import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { DEFAULT_CACHE_MAX_BYTES, cacheStats, sweepCache } from '../cache.js';
import { formatBytes } from '../format.js';
import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext } from '../types.js';

/** `storage/cache`: created on provision and swept back under its bound; a check reports its size against the bound. */
export const cacheComponent: ProvisioningComponent = {
  id: 'cache',
  core: true,
  provision(context: ProvisioningContext): string[] {
    const created: string[] = [];
    if (!existsSync(context.paths.cacheDir)) {
      mkdirSync(context.paths.cacheDir, { recursive: true });
      created.push('storage/cache');
    }
    sweepCache(context.paths.cacheDir, DEFAULT_CACHE_MAX_BYTES);
    return created;
  },
  check(context: ProvisioningContext): ComponentOutcome {
    const dir = context.paths.cacheDir;
    if (!existsSync(dir)) return { state: 'not-configured', detail: 'The cache directory has not been created yet.', nextAction: 'Run "dude-hub provision".' };
    try {
      accessSync(dir, constants.W_OK);
    } catch {
      return { state: 'needs-attention', detail: 'The cache directory exists but the Hub cannot write to it.', nextAction: 'Give the Hub service account write access to its storage directory.' };
    }
    const stats = cacheStats(dir);
    const used = `${stats.truncated ? 'At least ' : ''}${formatBytes(stats.bytes)} of ${formatBytes(DEFAULT_CACHE_MAX_BYTES)}`;
    if (stats.bytes > DEFAULT_CACHE_MAX_BYTES) {
      return { state: 'degraded', detail: `The cache is over its bound (${used}).`, nextAction: 'Run "dude-hub provision"; it removes the oldest cache files until the cache is under its bound.' };
    }
    return { state: 'ready', detail: `The cache is writable and within its bound (${used}).` };
  },
};
