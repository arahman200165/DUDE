import { DestroyRef, inject } from '@angular/core';
import { HUB_EVENTS } from './hub-events.port';
import type { HubViewTopic } from './hub-events.port';

export const HUB_REFETCH_DEBOUNCE_MS = 300;

export interface RefetchOnHubChangeOptions {
  /** Checked when the debounce ends: return false to skip (not signed in, a locked gate, a flow that a reload would reset). */
  readonly when?: () => boolean;
  readonly debounceMs?: number;
}

/**
 * Refetches a read-only view when the Hub reports one of `topics` changed (PD-113). A burst of events collapses into one `refetch`
 * after `debounceMs` of quiet. Call it in an injection context; it stops with the owner and drops a pending refetch. The refetch
 * should be the page's quiet (no spinner, no reset of user input) reload of data it already shows.
 */
export function refetchOnHubChange(topics: HubViewTopic | readonly HubViewTopic[], refetch: () => void, options: RefetchOnHubChangeOptions = {}): void {
  const events = inject(HUB_EVENTS);
  const wait = options.debounceMs ?? HUB_REFETCH_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = events.subscribe(Array.isArray(topics) ? topics : [topics as HubViewTopic], () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (options.when?.() ?? true) refetch();
    }, wait);
  });
  inject(DestroyRef).onDestroy(() => {
    stop();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  });
}
