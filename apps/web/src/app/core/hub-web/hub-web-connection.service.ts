import { Injectable, computed, signal } from '@angular/core';

export type HubWebConnectionState = 'live' | 'reconnecting' | 'unreachable' | 'session-expired' | 'incompatible';

export const HUB_WRITE_REFUSED: Readonly<Record<Exclude<HubWebConnectionState, 'live'>, string>> = {
  reconnecting: 'Hub unreachable — change not saved',
  unreachable: 'Hub unreachable — change not saved',
  'session-expired': 'Your Hub session expired — sign in again. Change not saved',
  incompatible: 'This page and the Hub are out of date with each other — reload. Change not saved',
};

/**
 * Whether shared state can be written right now (PD-053: Hub web writes are online-only). The boot code creates one
 * instance before bootstrap and provides it; on other hosts the root default stays `live` and nothing changes it.
 */
@Injectable({ providedIn: 'root' })
export class HubWebConnectionService {
  private readonly current = signal<HubWebConnectionState>('live');
  readonly state = this.current.asReadonly();
  readonly live = computed(() => this.current() === 'live');
  private readonly listeners = new Set<(state: HubWebConnectionState) => void>();

  /** Plain-callback change feed for non-Angular code (the browser sync adapter). Returns the unsubscribe. */
  subscribe(listener: (state: HubWebConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(state: HubWebConnectionState): void {
    // A locked state is only left by a full page load (sign-in) or a reload.
    const now = this.current();
    if ((now === 'session-expired' || now === 'incompatible') && state !== now) return;
    if (now === state) return;
    this.current.set(state);
    for (const listener of this.listeners) listener(state);
  }
}
