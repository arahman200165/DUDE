import { ipcMain } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import { isRootGranted } from './fs-bridge';
import { resolveInRoot } from './fs-grants';

/**
 * Local file watching (Phase 8 Stage 5) — infrastructure only. No tool
 * currently calls this; auto-reloading a tool's input when its source file
 * changes on disk risks silently overwriting unsaved edits, which needs its
 * own "reload / keep my edits" UX design pass before any tool wires into
 * it (flagged, not resolved, when this stage was scoped). This module just
 * exposes the capability for a future tool to opt into.
 *
 * The app's first genuinely *streaming* IPC channel: `watch()` returns a
 * `watchId` immediately, and change/error events are pushed later via a
 * separate `dude:fileWatch:event` channel, correlated by that same id —
 * mirroring the `{id, kind}` shape `core/workers/worker-protocol.ts` uses
 * for the analogous Worker request/result/cancel contract.
 *
 * Scoped to already-granted roots (Stage 2's `grantedRoots`, via
 * `isRootGranted`), not arbitrary paths a tool might request unprompted.
 */

interface WatchEntry {
  readonly watcher: FSWatcher;
}

const watches = new Map<string, WatchEntry>();
let nextWatchId = 1;

type WatchResult = { readonly ok: true; readonly watchId: string } | { readonly ok: false; readonly error: string };

export function registerFileWatchHandlers(): void {
  ipcMain.handle('dude:fileWatch:watch', (event, rootPath: string, relativePath: string): WatchResult => {
    if (!isRootGranted(rootPath)) return { ok: false, error: 'not-granted' };

    const absolute = resolveInRoot(rootPath, relativePath);
    if (!absolute) return { ok: false, error: 'invalid-path' };

    const watchId = `watch-${nextWatchId++}`;
    const sender = event.sender;

    try {
      const watcher = watch(absolute, () => {
        if (!sender.isDestroyed()) sender.send('dude:fileWatch:event', { id: watchId, kind: 'changed' });
      });
      watcher.on('error', (error) => {
        if (!sender.isDestroyed()) {
          sender.send('dude:fileWatch:event', { id: watchId, kind: 'error', error: error instanceof Error ? error.message : 'Watch error' });
        }
      });
      watches.set(watchId, { watcher });
      return { ok: true, watchId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not watch this file.' };
    }
  });

  ipcMain.handle('dude:fileWatch:unwatch', (_event, watchId: string): { ok: true } => {
    watches.get(watchId)?.watcher.close();
    watches.delete(watchId);
    return { ok: true };
  });
}

export function closeAllFileWatches(): void {
  for (const entry of watches.values()) entry.watcher.close();
  watches.clear();
}
