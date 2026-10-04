import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { resolveNativeTheme, type NativeTheme } from '@dude/domain/core/appearance/native-theme';
import { createMemoryWorkbench, type WorkbenchActions, type WorkbenchBackend, type WorkbenchSnapshot } from './workbench-model';

export interface WorkbenchContextValue {
  readonly snapshot: WorkbenchSnapshot;
  readonly actions: WorkbenchActions;
  readonly theme: NativeTheme;
}
const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children, backend }: PropsWithChildren<{ readonly backend?: WorkbenchBackend }>) {
  const [memory] = useState(createMemoryWorkbench);
  const source = backend ?? memory;
  const subscribe = useMemo(() => (listener: () => void) => source.subscribe(listener), [source]);
  const getSnapshot = useMemo(() => () => source.getSnapshot(), [source]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const scheme = useColorScheme();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => undefined);
    void AccessibilityInfo.isHighTextContrastEnabled().then(value => { if (active) setHighContrast(value); }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const contrast = AccessibilityInfo.addEventListener('highTextContrastChanged', setHighContrast);
    return () => { active = false; motion.remove(); contrast.remove(); };
  }, []);
  const theme = useMemo(() => resolveNativeTheme(snapshot.appearance, {
    prefersLight: scheme === 'light', prefersMoreContrast: highContrast, prefersReducedMotion: reducedMotion,
  }), [snapshot.appearance, scheme, highContrast, reducedMotion]);
  return <WorkbenchContext.Provider value={{ snapshot, actions: source.actions, theme }}>{children}</WorkbenchContext.Provider>;
}
export function useWorkbench(): WorkbenchContextValue {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error('useWorkbench requires WorkbenchProvider');
  return value;
}
