import { drainFsJournal } from '../fs-mutation';
import { drainSysJournal } from '../sys-mutation';
import { reconcileFsSnapshotIndex } from '../fs-snapshots';
import { reconcileSysSnapshotIndex } from '../sys-snapshots';
import { importLegacyPowerShellHistory } from '../powershell-workbench';
import { importLegacyUserData } from './legacy-import';
import { app } from 'electron';
import { getDeviceStoreHost, isDeviceStoreReady } from './store-client';

/**
 * Work that moves desktop state into the Device State Store once it is healthy: drain JSON journals
 * (pre-31B entries and any written while degraded), reconcile snapshot header rows with the files on
 * disk, and the one-shot PowerShell history import. Every step is independent and logged, never thrown.
 */
let running: Promise<void> | null = null;

export function runStoreMaintenance(): Promise<void> {
  if (!isDeviceStoreReady()) return Promise.resolve();
  if (!running) running = runSteps().finally(() => { running = null; });
  return running;
}

async function runSteps(): Promise<void> {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['legacy userData import', () => importLegacyUserData(app.getPath('userData'))],
    ['fs journal drain', drainFsJournal],
    ['sys journal drain', drainSysJournal],
    ['fs snapshot index', reconcileFsSnapshotIndex],
    ['sys snapshot index', reconcileSysSnapshotIndex],
    ['powershell history import', importLegacyPowerShellHistory],
  ];
  for (const [label, step] of steps) {
    try { await step(); } catch (error) { console.error(`[device-store] ${label} failed:`, error instanceof Error ? error.message : error); }
  }
}

/** Fire-and-forget at startup, and again whenever the store comes back after a restart. */
export function startStoreMaintenance(): void {
  void runStoreMaintenance();
  getDeviceStoreHost()?.onHealth((health) => {
    if (health.status === 'ready') void runStoreMaintenance();
  });
}
