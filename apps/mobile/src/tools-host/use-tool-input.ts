import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { toolInputStore, type ToolInput, type ToolInputStore } from './tool-input-store';

/**
 * In-memory input for one tool. Stored values override `initial`; `initial` is never written back,
 * so a background wipe returns the tool to its defaults.
 */
export function useToolInput<T extends ToolInput>(toolId: string, initial: T, store: ToolInputStore = toolInputStore): readonly [T, (partial: Partial<T>) => void, () => void] {
  const stored = useSyncExternalStore(store.subscribe, () => store.get(toolId), () => store.get(toolId));
  const defaults = useRef(initial);
  const value = useMemo(() => ({ ...defaults.current, ...stored }) as T, [stored]);
  const update = useCallback((partial: Partial<T>) => store.set(toolId, partial), [store, toolId]);
  const reset = useCallback(() => store.clear(toolId), [store, toolId]);
  return [value, update, reset];
}
