import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { TOOL_METADATA } from '@dude/tool-registry';
import { toolInputStore } from '../tools-host/tool-input-store';
import { useWorkbench } from '../state/workbench-provider';
import { defaultPreferenceDecode, ToolPreferenceStore } from './tool-preference-store';

export { resolveToolPreference, PREFS_KEY } from './tool-preference-store';
export type { PreferenceResolution, ToolSettingsPort } from './tool-preference-store';

/** Process-wide store: environment-scoped values in the active context's settings KV, everything else in memory. */
export const toolPreferenceStore = new ToolPreferenceStore(toolInputStore, TOOL_METADATA);

export interface PreferenceCodec<T> {
  /** Returns null for a stored value that is not valid; the default is used instead. */
  readonly decode: (raw: unknown) => T | null;
  /** Defaults to the identity (the bare JSON value, as on web). */
  readonly encode?: (value: T) => unknown;
}
export interface PreferenceEntry<T = unknown> { readonly key: string; readonly defaultValue: T; readonly codec?: PreferenceCodec<T> }
export type PreferenceSetter<T> = (next: T | ((previous: T) => T)) => void;

/** Binds the shared store to the active context and re-reads values after a sync delivered changes. */
function useBoundStore(): ToolPreferenceStore {
  const { toolSettings, snapshot } = useWorkbench();
  const contextId = snapshot.recovery?.contextId;
  useEffect(() => { toolPreferenceStore.bind(toolSettings ?? null, contextId); }, [toolSettings, contextId]);
  const { phase, pending } = snapshot.sync;
  useEffect(() => { void toolPreferenceStore.refresh(); }, [phase, pending]);
  return toolPreferenceStore;
}

function decodeEntry<T>(entry: PreferenceEntry<T>, raw: unknown): T {
  if (raw === undefined) return entry.defaultValue;
  const decoded = (entry.codec?.decode ?? defaultPreferenceDecode(entry.defaultValue))(raw);
  return decoded ?? entry.defaultValue;
}

/** Several preferences of one tool. `entries` must have a fixed set of keys for the lifetime of the component. */
export function useToolPreferences(toolId: string, entries: readonly PreferenceEntry[]): readonly [Readonly<Record<string, unknown>>, (key: string, value: unknown) => void] {
  const store = useBoundStore();
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const last = useRef<readonly unknown[]>([]);
  const getRaw = useCallback((): readonly unknown[] => {
    const next = entriesRef.current.map(entry => store.read(toolId, entry.key));
    if (next.length === last.current.length && next.every((value, index) => Object.is(value, last.current[index]))) return last.current;
    last.current = next;
    return next;
  }, [store, toolId]);
  const raws = useSyncExternalStore(store.subscribe, getRaw, getRaw);
  const keys = entries.map(entry => entry.key).join('\u0000');
  useEffect(() => { for (const entry of entriesRef.current) void store.hydrate(toolId, entry.key); }, [store, toolId, keys]);
  const values: Record<string, unknown> = {};
  entries.forEach((entry, index) => { values[entry.key] = decodeEntry(entry, raws[index]); });
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const set = useCallback((key: string, value: unknown) => {
    const entry = entriesRef.current.find(candidate => candidate.key === key);
    const encode = entry?.codec?.encode as ((value: unknown) => unknown) | undefined;
    store.write(toolId, key, encode ? encode(value) : value);
  }, [store, toolId]);
  return [values, set];
}

/**
 * One tool preference. Persists and syncs only when the manifest declares `persistence.preferences: 'local'` and the
 * key's scope resolves to `environment` (the web rule); otherwise it lives in memory for the app session.
 */
export function useToolPreference<T>(toolId: string, key: string, defaultValue: T, codec?: PreferenceCodec<T>): readonly [T, PreferenceSetter<T>] {
  const [values, setValue] = useToolPreferences(toolId, [{ key, defaultValue, codec } as PreferenceEntry]);
  const valueRef = useRef(values[key] as T);
  valueRef.current = values[key] as T;
  const set = useCallback<PreferenceSetter<T>>(next => {
    setValue(key, typeof next === 'function' ? (next as (previous: T) => T)(valueRef.current) : next);
  }, [setValue, key]);
  return [valueRef.current, set];
}
