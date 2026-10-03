import { Injectable } from '@angular/core';

/**
 * What the browser sync adapter reports that is not part of the connection state: the Hub revision this page has read,
 * the Hub head it last saw, when it last pulled or pushed, and whether a pull is running. A plain class (created before
 * bootstrap by the boot code, then provided) so the boot, the realtime link and the sign-out path can feed and stop it.
 * On other hosts the root default is never touched.
 */
@Injectable({ providedIn: 'root' })
export class HubWebSyncInfo {
  cursor = 0;
  head: number | null = null;
  lastPullAt: string | null = null;
  lastPushAt: string | null = null;
  pulling = false;
  /** Reads the change feed now; set by the runtime once the realtime link exists. */
  pullNow: () => Promise<void> = () => Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private readonly stoppers: (() => void)[] = [];

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  notePull(cursor: number, head: number | null): void {
    this.cursor = cursor;
    if (head !== null) this.head = head;
    this.lastPullAt = new Date().toISOString();
    this.changed();
  }

  notePush(): void {
    this.lastPushAt = new Date().toISOString();
    this.changed();
  }

  setPulling(pulling: boolean): void {
    if (this.pulling === pulling) return;
    this.pulling = pulling;
    this.changed();
  }

  /** Registers something sign-out must stop (the realtime link, the kv backend's timers). */
  onStop(stop: () => void): void {
    this.stoppers.push(stop);
  }

  stopAll(): void {
    for (const stop of this.stoppers.splice(0)) {
      try {
        stop();
      } catch {
        // a failing stopper must not block the wipe
      }
    }
  }
}
