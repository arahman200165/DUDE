import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useWorkbench } from '../state/workbench-provider';
import { recentsStore } from './recents';

/** Binds the shared recents list to the active environment's device-local storage and returns it. */
export function useRecents(): { readonly recents: readonly string[]; readonly record: (toolId: string) => void } {
  const { localState, snapshot } = useWorkbench();
  const contextId = snapshot.recovery?.contextId;
  useEffect(() => { void recentsStore.bind(localState ?? null); }, [localState, contextId]);
  const recents = useSyncExternalStore(recentsStore.subscribe, recentsStore.list, recentsStore.list);
  const record = useCallback((toolId: string) => recentsStore.record(toolId), []);
  return { recents, record };
}
