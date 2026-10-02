import type { StorageBackend } from './storage-backend';
import { createWindowStorageBackend } from './window-storage-backend';

let installed: StorageBackend | null = null;
let fallback: StorageBackend | null = null;

/** Replaces the `local` backend for the rest of the page's life (desktop: the Device Store cache). Call before bootstrap. */
export function installLocalBackend(backend: StorageBackend): void {
  installed = backend;
}

/** Test seam: back to window.localStorage. */
export function resetLocalBackend(): void {
  installed = null;
}

export function activeLocalBackend(): StorageBackend {
  return installed ?? (fallback ??= createWindowStorageBackend('local'));
}

/** True once a non-window backend (device store or degraded in-memory) owns `local`. */
export function hasInstalledLocalBackend(): boolean {
  return installed !== null;
}
