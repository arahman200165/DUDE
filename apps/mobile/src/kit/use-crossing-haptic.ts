import { useEffect, useRef } from 'react';
import { hapticError } from './feedback';

/** Fires one error haptic each time `active` turns on (an input crossing its budget), not on every keystroke while it stays on. */
export function useCrossingHaptic(active: boolean): void {
  const previous = useRef(false);
  useEffect(() => {
    if (active && !previous.current) void hapticError();
    previous.current = active;
  }, [active]);
}
