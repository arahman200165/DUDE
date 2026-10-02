import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getDeviceStoreHost, isDeviceStoreReady } from './device-store/store-client';

/**
 * Crash detection (DUDE_PRD.md §21 Phase 25 Item 6) -- mirrors `window-state.ts`'s shape exactly: a
 * small marker written at `whenReady()` and flipped back to clean by the quit coordinator
 * (`device-store/quit-coordinator.ts`). An unclean exit (crash, force-kill, OS shutdown) is simply
 * "the marker still says unclean at next launch" -- nothing more elaborate than that.
 *
 * Phase 31B: when the device store is ready its `last_clean_exit` meta marker is authoritative
 * (`store.cleanExit`); the JSON file is still written as a mirror and is the fallback when the
 * store is degraded, and decides the very first launch after upgrading (store has no marker yet).
 */
function path(): string {
  return join(app.getPath('userData'), 'crash-state.json');
}

async function readCleanExit(): Promise<boolean> {
  try {
    const stored = JSON.parse(await fs.readFile(path(), 'utf8')) as { cleanExit: boolean };
    return stored.cleanExit;
  } catch {
    return true; // First launch has no prior record -- nothing to report.
  }
}

async function writeCleanExit(cleanExit: boolean): Promise<void> {
  await fs.writeFile(path(), JSON.stringify({ cleanExit }), 'utf8').catch(() => {});
}

/**
 * Call once during `whenReady()`, before `createWindow()`. Returns whether the *previous* launch
 * exited uncleanly, then immediately marks the new one unclean until `markCleanExit()` runs.
 */
export async function checkAndMarkLaunch(): Promise<boolean> {
  const wasCleanJson = await readCleanExit();
  await writeCleanExit(false);
  const host = getDeviceStoreHost();
  if (host && isDeviceStoreReady()) {
    try {
      const { previous } = await host.call('store.cleanExit', { action: 'launch' });
      if (previous !== 'none') return previous === 'unclean';
    } catch { /* fall back to the JSON marker */ }
  }
  return !wasCleanJson;
}

/** Called once by the quit coordinator after the renderer has flushed. Resolves when both markers are written. */
export function markCleanExit(): Promise<void> {
  const json = writeCleanExit(true);
  const host = getDeviceStoreHost();
  const store = host && isDeviceStoreReady()
    ? host.call('store.cleanExit', { action: 'quit' }).then(() => undefined, () => undefined)
    : Promise.resolve();
  return Promise.all([json, store]).then(() => undefined);
}
