import { isDevMode } from '@angular/core';
import { APP_SETTINGS_NAMESPACE, APPEARANCE_KEY } from '@dude/tool-engine/core/persistence/app-settings';
import { NAMESPACE_PREFIX, buildStorageKey } from '@dude/tool-engine/core/persistence/persistence-keys';
import { parseStorageKey, toStorageKey, type DeviceKvBackend } from './device-kv-backend';

export const RENDERER_IMPORT_NAMESPACE = '__renderer-import__';
export const RENDERER_IMPORT_DONE_KEY = 'done';
/** index.html's synchronous pre-paint script reads this key, so the import leaves it in window.localStorage. */
export const APPEARANCE_MIRROR_KEY = buildStorageKey(APP_SETTINGS_NAMESPACE, APPEARANCE_KEY);

export interface LegacyImportResult {
  readonly alreadyDone: boolean;
  readonly imported: number;
  readonly skipped: number;
}

/**
 * One-shot copy of this origin's `dude:v1:*` window.localStorage entries into the Device Store cache.
 * The marker is written in the same batch; the source keys are cleared (except the appearance mirror)
 * only after that batch committed, so a failed commit retries the whole import on the next launch.
 */
export async function importRendererLegacyStorage(backend: DeviceKvBackend, storage: Storage = window.localStorage): Promise<LegacyImportResult> {
  const doneKey = toStorageKey(RENDERER_IMPORT_NAMESPACE, RENDERER_IMPORT_DONE_KEY);
  if (backend.get(doneKey) !== null) return { alreadyDone: true, imported: 0, skipped: 0 };

  const sourceKeys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(`${NAMESPACE_PREFIX}:`)) sourceKeys.push(key);
  }

  const copied: string[] = [];
  let skipped = 0;
  for (const key of sourceKeys) {
    const value = storage.getItem(key);
    if (value === null || !parseStorageKey(key) || !backend.set(key, value, { policy: 'local' })) {
      skipped++;
      if (isDevMode()) console.warn(`[renderer-legacy-import] skipped "${key}"`);
      continue;
    }
    copied.push(key);
  }
  backend.set(doneKey, 'true', { policy: 'local' });
  await backend.flush();

  if (backend.pendingCount() === 0) {
    for (const key of copied) if (key !== APPEARANCE_MIRROR_KEY) storage.removeItem(key);
  }
  return { alreadyDone: false, imported: copied.length, skipped };
}
