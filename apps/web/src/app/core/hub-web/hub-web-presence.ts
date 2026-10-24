import { Injectable } from '@angular/core';
import type { PresenceActivity, PresenceEntry } from '@dude/contracts/hub';

/**
 * The seam between the shell's presence service and the Hub web realtime link (PD-108). The service may report an activity before
 * the link exists (the link starts after bootstrap), so the latest value is kept here and handed to the link when it binds. Going the
 * other way, the link publishes the Hub's `presence-changed` events for the Devices view. A plain class: on other hosts the root
 * default is never touched.
 */
@Injectable({ providedIn: 'root' })
export class HubWebPresence {
  private latest: PresenceActivity | null = null;
  private sink: ((activity: PresenceActivity | null) => void) | null = null;
  private readonly listeners = new Set<(entry: PresenceEntry) => void>();

  /** What this page last asked to share (null: nothing). */
  get activity(): PresenceActivity | null {
    return this.latest;
  }

  setActivity(activity: PresenceActivity | null): void {
    this.latest = activity;
    this.sink?.(activity);
  }

  /** Called by the runtime once the realtime link exists; sends what was asked before. Returns the unbind function. */
  bind(sink: (activity: PresenceActivity | null) => void): () => void {
    this.sink = sink;
    if (this.latest !== null) sink(this.latest);
    return () => {
      if (this.sink === sink) this.sink = null;
    };
  }

  /** Live `presence-changed` events from the Hub. Returns the unsubscribe function. */
  subscribe(listener: (entry: PresenceEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(entry: PresenceEntry): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(entry);
      } catch {
        // a listener must not break the realtime link
      }
    }
  }
}
