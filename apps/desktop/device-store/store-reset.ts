import { ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { QuarantinePreviewResult, ResetApplyError, ResetApplyResult, ResetKind, ResetPreviewResult } from '@dude/contracts';
import { ConfirmationStore, digestOf } from '../mutation-core';
import type { StoredPlanBase } from '../mutation-core';
import type { DeviceStoreHost } from './agent-host';
import { getDeviceStoreHost } from './store-client';

/**
 * Settings > This Device reset and recovery, under the Destructive-Action Contract. Consequence
 * classes: `clear-data` and `reset-device` are `database-write` (irreversible: no undo), and
 * quarantine moves the store aside inside the Device Agent (`filesystem-write`, recoverable by hand from the quarantine folder).
 *
 * Preview never mutates. It returns a 60 s single-use token bound to the requesting window and to
 * the agent's digest of what the preview showed. Apply consumes the token (success or not) and the
 * agent re-checks the digest inside its transaction, so data that changed since the preview is
 * reported as `stale-preview` instead of being wiped unseen. Main chooses every path; nothing the
 * renderer sends is used as one.
 */

export const RESET_TOKEN_TTL_MS = 60_000;
const DB_FILE = 'dude-device.db';
const STORE_FILES = [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`] as const;
const FORBIDDEN: ResetApplyError = 'forbidden';

interface ResetPlan extends StoredPlanBase { readonly kind: ResetKind | 'quarantine' }

export interface StoreResetDeps {
  host: () => DeviceStoreHost | null;
  /** Starts a fresh agent and installs it as the current host. */
  restartHost: () => Promise<DeviceStoreHost | null>;
  /** The device-store directory, chosen by main from userData. */
  storeDir: () => string;
  openPath: (path: string) => Promise<string>;
  now: () => Date;
}

const isKind = (value: unknown): value is ResetKind => value === 'clear-data' || value === 'reset-device';

const planId = (kind: ResetKind | 'quarantine', ownerId: number): string => `${kind}:${ownerId}`;

async function listStoreFiles(dir: string): Promise<Array<{ name: string; sizeBytes: number }>> {
  const files: Array<{ name: string; sizeBytes: number }> = [];
  for (const name of STORE_FILES) {
    try { files.push({ name, sizeBytes: (await fs.stat(join(dir, name))).size }); } catch { /* absent */ }
  }
  return files;
}

/**
 * Fallback only, for when no agent is connected: moves the database and its WAL/SHM files to
 * `<dir>/quarantine/<ts>/`, the same layout the agent uses. While an agent is connected it holds the
 * files open (Windows refuses to rename them), so the move runs inside the agent (`store.quarantine`).
 */
async function moveToQuarantine(dir: string, now: Date): Promise<string> {
  const target = join(dir, 'quarantine', now.toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(target, { recursive: true });
  for (const name of STORE_FILES) {
    try { await fs.rename(join(dir, name), join(target, name)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return target;
}

export function registerStoreResetHandlers(window: BrowserWindow, deps: StoreResetDeps): void {
  const own = (sender: unknown): boolean => sender === window.webContents;
  const ownerOf = (): number => window.webContents.id;
  const store = new ConfirmationStore<ResetPlan>({ tokenTtlMs: RESET_TOKEN_TTL_MS, maxPlans: 8, maxTokens: 8 });

  const consume = (kind: ResetKind | 'quarantine', token: unknown): ResetPlan | ResetApplyError => {
    try {
      return store.consume(ownerOf(), planId(kind, ownerOf()), token);
    } catch {
      return typeof token === 'string' ? 'expired' : 'invalid-token';
    }
  };

  const reload = (): void => { if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.reload(); };

  ipcMain.handle('dude:store:reset:preview', async (event, kind: unknown): Promise<ResetPreviewResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    if (!isKind(kind)) return { ok: false, error: 'failed' };
    const host = deps.host();
    if (!host || host.status() !== 'ready') return { ok: false, error: 'unavailable' };
    try {
      const preview = await host.call('reset.preview', { kind });
      const id = planId(kind, ownerOf());
      store.addPlan({ id, ownerId: ownerOf(), digest: preview.digest, expires: Date.now() + RESET_TOKEN_TTL_MS, kind });
      const issued = store.issueToken(ownerOf(), id);
      if (!issued.ok) return { ok: false, error: 'failed' };
      return { ok: true, kind, token: issued.token, counts: preview.counts, expiresAt: issued.expiresAt, keepsIdentity: preview.keepsIdentity, wipesSecrets: preview.wipesSecrets };
    } catch {
      return { ok: false, error: 'failed' };
    }
  });

  ipcMain.handle('dude:store:reset:apply', async (event, request: unknown): Promise<ResetApplyResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    const { kind, token } = (request && typeof request === 'object' ? request : {}) as { kind?: unknown; token?: unknown };
    if (!isKind(kind)) return { ok: false, error: 'invalid-token' };
    const plan = consume(kind, token);
    if (typeof plan === 'string') return { ok: false, error: plan };
    store.deletePlan(plan.id);
    const host = deps.host();
    if (!host || host.status() !== 'ready') return { ok: false, error: 'unavailable' };
    try {
      const result = await host.call('reset.apply', { kind, digest: plan.digest });
      if (!result.ok) return { ok: false, error: result.error === 'stale-preview' ? 'stale-preview' : 'failed' };
    } catch {
      return { ok: false, error: 'failed' };
    }
    // Secrets are read from the store on demand (secrets-bridge keeps no cache), so a reload is all main needs to do.
    reload();
    return { ok: true };
  });

  // The folder is always the device-store directory; any argument the renderer passes is ignored.
  ipcMain.handle('dude:store:recovery:openFolder', async (event): Promise<{ ok: boolean }> => {
    if (!own(event.sender)) return { ok: false };
    try {
      const failure = await deps.openPath(deps.storeDir());
      return { ok: failure === '' };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('dude:store:recovery:quarantinePreview', async (event): Promise<QuarantinePreviewResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    const host = deps.host();
    if (host && host.status() === 'ready') return { ok: false, error: 'not-needed' };
    try {
      const files = await listStoreFiles(deps.storeDir());
      const id = planId('quarantine', ownerOf());
      store.addPlan({ id, ownerId: ownerOf(), digest: digestOf(files), expires: Date.now() + RESET_TOKEN_TTL_MS, kind: 'quarantine' });
      const issued = store.issueToken(ownerOf(), id);
      if (!issued.ok) return { ok: false, error: 'failed' };
      return { ok: true, token: issued.token, files, expiresAt: issued.expiresAt };
    } catch {
      return { ok: false, error: 'failed' };
    }
  });

  ipcMain.handle('dude:store:recovery:quarantineApply', async (event, token: unknown): Promise<ResetApplyResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    const plan = consume('quarantine', token);
    if (typeof plan === 'string') return { ok: false, error: plan };
    store.deletePlan(plan.id);
    const host = deps.host();
    if (host && host.status() === 'ready') return { ok: false, error: 'failed' };
    try {
      const dir = deps.storeDir();
      if (digestOf(await listStoreFiles(dir)) !== plan.digest) return { ok: false, error: 'stale-preview' };
      if (host && (host.status() === 'corrupt' || host.status() === 'incompatible')) {
        // The agent closes the database, moves the files and exits; main never renames files the agent holds open.
        await host.call('store.quarantine', {});
        await host.shutdown();
      } else {
        if (host) await host.shutdown();
        await moveToQuarantine(dir, deps.now());
      }
      await deps.restartHost();
    } catch {
      return { ok: false, error: 'failed' };
    }
    reload();
    return { ok: true };
  });
}

export function defaultStoreResetDeps(userDataDir: () => string, restartHost: StoreResetDeps['restartHost']): StoreResetDeps {
  return {
    host: getDeviceStoreHost,
    restartHost,
    storeDir: () => join(userDataDir(), 'device-store'),
    openPath: (path) => shell.openPath(path),
    now: () => new Date(),
  };
}
