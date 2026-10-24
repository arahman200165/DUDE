import { deepEqual, merge3 } from './merge3.js';
import { syncPolicyFor } from './policies.js';

/**
 * What an open editor should do when the entity it is editing changes on another device (PD-113).
 * - `unchanged`: the remote value is the one the editor already started from; nothing to do.
 * - `adopt`: the editor has no edits of its own, so it takes the remote value without a notice.
 * - `merged`: disjoint edits; the editor state becomes `value` and the new base is the remote value.
 * - `conflict`: both sides changed the same fields; the draft stays untouched and the user chooses.
 * - `deleted`: the entity was removed elsewhere; the draft stays, and saving behaves as it does today.
 */
export type OpenEditorMerge<T> =
  | { kind: 'unchanged' }
  | { kind: 'adopt'; value: T }
  | { kind: 'merged'; value: T }
  | { kind: 'conflict'; fields: readonly string[] }
  | { kind: 'deleted' };

export interface OpenEditorMergeOptions<T> {
  /** Rejects a clean merge whose result the editor cannot hold (for example an invalid layout); it is then reported as a conflict. */
  readonly accept?: (merged: T) => boolean;
  /** Bookkeeping fields (for example `updatedAt`) that never count as an edit: left out of the comparison, taken from `remote`. */
  readonly ignore?: readonly string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Entities are JSON documents: a round trip drops `undefined` keys so a draft built in memory compares equal to its stored form. */
const canon = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function without<T>(value: T, ignore: readonly string[]): T {
  if (ignore.length === 0 || !isObject(value)) return value;
  const copy: Record<string, unknown> = { ...value };
  for (const key of ignore) delete copy[key];
  return copy as T;
}

function withFrom<T>(value: T, source: unknown, ignore: readonly string[]): T {
  if (ignore.length === 0 || !isObject(value) || !isObject(source)) return value;
  const copy: Record<string, unknown> = { ...value };
  for (const key of ignore) if (Object.prototype.hasOwnProperty.call(source, key)) copy[key] = source[key];
  return copy as T;
}

/**
 * Pure decision for one remote change to an entity an editor holds open. `base` is the stored value the editor loaded
 * or last saved, `draft` the editor's current state as an entity value and `remote` the new stored value (null when it
 * was deleted). Field rules (for example `max-iso`) come from the entity's sync policy, so a live merge resolves
 * exactly like the sync merge would.
 */
export function mergeIntoOpenEditor<T>(
  entityType: string,
  base: T | null,
  draft: T,
  remote: T | null,
  options: OpenEditorMergeOptions<T> = {},
): OpenEditorMerge<T> {
  if (remote === null) return { kind: 'deleted' };
  const ignore = options.ignore ?? [];
  const r = canon(remote);
  const b = base === null ? null : without(canon(base), ignore);
  const d = without(canon(draft), ignore);
  const rr = without(r, ignore);
  if (b !== null && deepEqual(b, rr)) return { kind: 'unchanged' };
  if (b !== null && deepEqual(b, d)) return { kind: 'adopt', value: r };
  const result = merge3(b, d, rr, syncPolicyFor(entityType)?.fieldRules);
  if (result.kind === 'conflict') return { kind: 'conflict', fields: result.fields };
  const value = withFrom(result.value as T, r, ignore);
  if (options.accept && !options.accept(value)) return { kind: 'conflict', fields: ['*'] };
  return { kind: 'merged', value };
}
