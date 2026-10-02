import { APPEARANCE_KEY, APP_SETTINGS_NAMESPACE } from '@dude/tool-engine/core/persistence/app-settings';
import { buildStorageKey } from '@dude/tool-engine/core/persistence/persistence-keys';

export const APPEARANCE_PREPAINT_KEY = buildStorageKey(APP_SETTINGS_NAMESPACE, APPEARANCE_KEY);

/**
 * Desktop keeps appearance in the Device Store, but index.html's synchronous pre-paint script can only
 * read window.localStorage. This writes a read-only copy there; nothing reads it back into the app.
 */
export function mirrorAppearanceForPrepaint(value: unknown, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? window.localStorage).setItem(APPEARANCE_PREPAINT_KEY, JSON.stringify(value));
  } catch {
    /* Quota or blocked storage only costs a flash of the default theme. */
  }
}
