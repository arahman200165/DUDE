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
/** 'max-iso': on a both-sides change take the later ISO-8601 string. */
export type FieldRule = 'max-iso';

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
  'user-script': { category: 'pipelines', conflict: 'merge3', apply: 'live' },
  project: { category: 'projects', conflict: 'merge3', apply: 'live', fieldRules: { lastActivatedAt: 'max-iso' } },
  'workspace-template': { category: 'workspaces', conflict: 'merge3', apply: 'live' },
  'home-layout': { category: 'home', conflict: 'merge3', apply: 'live' },
  usage: { category: 'usage', conflict: 'per-device', apply: 'live' },
  'workspace-layout': { category: 'workspace-layout', conflict: 'lww', apply: 'next-launch' },
  scratchpad: { category: 'scratchpad', conflict: 'merge3', apply: 'live' },
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
