import { ipcMain } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import { isRootGranted } from './fs-bridge';
import { resolveInRoot } from './fs-grants';

/** Ephemeral watches for open tools, scoped to granted roots. */

interface WatchEntry {
  readonly watcher: FSWatcher;
  readonly senderId: number;
}

const watches = new Map<string, WatchEntry>();
let nextWatchId = 1;

type WatchResult = { readonly ok: true; readonly watchId: string } | { readonly ok: false; readonly error: string };

export function registerFileWatchHandlers(): void {
  ipcMain.handle('dude:fileWatch:watch', (event, rootPath: string, relativePath: string, recursive = false): WatchResult => {
    if (!isRootGranted(rootPath)) return { ok: false, error: 'not-granted' };
    if (typeof recursive !== 'boolean') return { ok: false, error: 'invalid-options' };

    const absolute = resolveInRoot(rootPath, relativePath);
    if (!absolute) return { ok: false, error: 'invalid-path' };

    const watchId = `watch-${nextWatchId++}`;
    const sender = event.sender;

    try {
      const watcher = watch(absolute, { recursive }, (_eventType, filename) => {
        if (!sender.isDestroyed()) sender.send('dude:fileWatch:event', {
          id: watchId, kind: 'changed', relativePath: filename?.toString().replaceAll('\\', '/') ?? null,
        });
      });
      watcher.on('error', (error) => {
        if (!sender.isDestroyed()) {
          sender.send('dude:fileWatch:event', { id: watchId, kind: 'error', error: error instanceof Error ? error.message : 'Watch error' });
        }
      });
      watches.set(watchId, { watcher, senderId: sender.id });
      sender.once('destroyed', () => {
        watcher.close();
        watches.delete(watchId);
      });
      return { ok: true, watchId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not watch this file.' };
    }
  });

  ipcMain.handle('dude:fileWatch:unwatch', (event, watchId: string): { ok: true } => {
    const entry = watches.get(watchId);
    if (entry?.senderId !== event.sender.id) return { ok: true };
    entry.watcher.close();
    watches.delete(watchId);
    return { ok: true };
  });
}

export function closeAllFileWatches(): void {
  for (const entry of watches.values()) entry.watcher.close();
  watches.clear();
}
