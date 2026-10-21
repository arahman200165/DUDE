import { useEffect } from 'react';
import { AppState } from 'react-native';
import { installBackgroundWipe } from './background-wipe';
import { toolInputStore } from './tool-input-store';

/** Mounted once at the app root. */
export function useBackgroundWipe(): void {
  useEffect(() => installBackgroundWipe({ appState: AppState, store: toolInputStore }), []);
}
