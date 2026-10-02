import { isDevMode } from '@angular/core';

export type StorageKind = 'local' | 'session';

export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(prefix: string): string[];
}

function resolveStorage(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function warn(action: string, error: unknown): void {
  if (isDevMode()) {
    console.warn(`[PersistenceService] failed to ${action}`, error);
  }
}

export function createStorageBackend(kind: StorageKind): StorageBackend {
  return {
    get(key: string): string | null {
      try {
        return resolveStorage(kind)?.getItem(key) ?? null;
      } catch (error) {
        warn(`read "${key}"`, error);
        return null;
      }
    },

    set(key: string, value: string): boolean {
      try {
        const storage = resolveStorage(kind);
        if (!storage) return false;
        storage.setItem(key, value);
        return true;
      } catch (error) {
        warn(`write "${key}"`, error);
        return false;
      }
    },

    remove(key: string): void {
      try {
        resolveStorage(kind)?.removeItem(key);
      } catch (error) {
        warn(`remove "${key}"`, error);
      }
    },

    keys(prefix: string): string[] {
      try {
        const storage = resolveStorage(kind);
        if (!storage) return [];

        const matched: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key?.startsWith(prefix)) {
            matched.push(key);
          }
        }
        return matched;
      } catch (error) {
        warn(`enumerate keys with prefix "${prefix}"`, error);
        return [];
      }
    },
  };
}
