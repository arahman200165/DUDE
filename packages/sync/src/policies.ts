import type { SyncCategory } from './categories.js';

export const SYNC_ENTITY_TYPES = [
  'setting', 'favorite', 'pipeline', 'user-script', 'project', 'workspace-template', 'home-layout', 'usage',
  'workspace-layout', 'scratchpad',
] as const;

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

/** lww: last write by Hub order wins. merge3: field-level three-way merge, else a conflict. per-device: one record per device. */
export type ConflictPolicy = 'lww' | 'merge3' | 'per-device';
/** live: applied immediately. next-launch: applied on the next app launch. */
export type ApplyMode = 'live' | 'next-launch';
/**
 * How a field changed differently on both sides resolves instead of conflicting:
 * - 'max-iso': take the later ISO-8601 string.
 * - 'text': merge the two strings three ways against the base (PD-102); only when the base has the field.
 * - keyed list: an array of objects with a unique `key`; items are matched by key, added and removed per side (a removal
 *   wins over a concurrent edit, as in the collaborative document), `text` fields merge as text and every other item
 *   field must not conflict.
 */
export type FieldRule = 'max-iso' | 'text' | { readonly keyedList: string; readonly text: readonly string[] };

export interface SyncPolicy {
  category: SyncCategory;
  conflict: ConflictPolicy;
  apply: ApplyMode;
  fieldRules?: Record<string, FieldRule>;
}

export const SYNC_POLICIES: Record<SyncEntityType, SyncPolicy> = {
  setting: { category: 'settings', conflict: 'lww', apply: 'live' },
  favorite: { category: 'favorites', conflict: 'lww', apply: 'live' },
  pipeline: { category: 'pipelines', conflict: 'merge3', apply: 'live' },
  'user-script': { category: 'pipelines', conflict: 'merge3', apply: 'live', fieldRules: { body: 'text', updatedAt: 'max-iso' } },
  project: { category: 'projects', conflict: 'merge3', apply: 'live', fieldRules: { lastActivatedAt: 'max-iso' } },
  'workspace-template': { category: 'workspaces', conflict: 'merge3', apply: 'live' },
  'home-layout': { category: 'home', conflict: 'merge3', apply: 'live' },
  usage: { category: 'usage', conflict: 'per-device', apply: 'live' },
  'workspace-layout': { category: 'workspace-layout', conflict: 'lww', apply: 'next-launch' },
  scratchpad: { category: 'scratchpad', conflict: 'merge3', apply: 'live', fieldRules: { snippets: { keyedList: 'id', text: ['title', 'body'] } } },
};

/**
 * Entities with a fixed codec id ('default'), where "keep both" is not offered in conflict resolution.
 * Note: usage also has a fixed codec id but is per-device (entity id = deviceId), so it never forks.
 */
export const SINGLETON_ENTITY_TYPES: readonly SyncEntityType[] = ['home-layout', 'scratchpad', 'workspace-layout'];

export function isSyncEntityType(x: unknown): x is SyncEntityType {
  return typeof x === 'string' && (SYNC_ENTITY_TYPES as readonly string[]).includes(x);
}

export function syncPolicyFor(entityType: string): SyncPolicy | undefined {
  return isSyncEntityType(entityType) ? SYNC_POLICIES[entityType] : undefined;
}

export function categoryOf(entityType: string): SyncCategory | undefined {
  return syncPolicyFor(entityType)?.category;
}
