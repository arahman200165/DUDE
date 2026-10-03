import { merge3, deepEqual } from '../merge3.js';
import type { SyncPolicy } from '../policies.js';
import { SINGLETON_ENTITY_TYPES } from '../policies.js';
import { SETTING_ENTITY } from './ops.js';

export type BrowserConflictResolution =
  /** `matchesHub` is true when the merge equals the Hub's version (nothing to push). */
  | { kind: 'merged'; payload: unknown; matchesHub: boolean }
  | { kind: 'conflict'; fields: string[] }
  /** The browser's version wins on the Hub's current revision (lww and per-device policies, or both sides deleted). */
  | { kind: 'take-mine' };

export interface BrowserConflictInput {
  readonly policy: SyncPolicy;
  /** The last Hub payload the edit started from; null when unknown. */
  readonly base: unknown;
  /** The browser's version; null when it deleted the entity. */
  readonly mine: unknown;
  /** The Hub's current version; null when the Hub holds a tombstone. */
  readonly theirs: unknown;
}

/**
 * Decides a revision conflict reported by the Hub (PD-052). lww and per-device re-commit the browser's version on the
 * new base; merge3 runs the shared three-way merge. An edit against a delete (either side) is a real conflict.
 */
export function resolveBrowserConflict(input: BrowserConflictInput): BrowserConflictResolution {
  const { policy, base, mine, theirs } = input;
  if (policy.conflict !== 'merge3') return { kind: 'take-mine' };
  if (mine === null && theirs === null) return { kind: 'take-mine' };
  if (mine === null || theirs === null) return { kind: 'conflict', fields: ['*'] };
  const result = merge3(base, mine, theirs, policy.fieldRules);
  if (result.kind === 'conflict') return { kind: 'conflict', fields: result.fields };
  return { kind: 'merged', payload: result.value, matchesHub: deepEqual(result.value, theirs) };
}

/** Suffix of a "keep both" copy; the same as the desktop conflict inbox. */
export const KEEP_BOTH_SUFFIX = ' (conflict copy)';
const NO_FORK = new Set<string>([...SINGLETON_ENTITY_TYPES, SETTING_ENTITY, 'favorite', 'usage']);

/** Whether "keep both" is offered: not for singletons, settings, favorites or usage. */
export const canKeepBoth = (entityType: string): boolean => !NO_FORK.has(entityType);

/** The copy a "keep both" saves under a new id: `id` replaced, a string `name` suffixed. Null when the payload cannot fork. */
export function forkPayload(payload: unknown, newId: string): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const copy: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  if (Object.hasOwn(copy, 'id')) copy['id'] = newId;
  if (typeof copy['name'] === 'string') copy['name'] = `${copy['name']}${KEEP_BOTH_SUFFIX}`;
  return copy;
}
