import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { currentPlatformBridge } from '../../platform/platform-bridge.adapter';

export interface OutboxStatus {
  readonly pending: number;
  readonly maxRows: number;
  readonly backpressure: boolean;
}

/** Outbox depth and backpressure from the device store; `null` on web, where there is no outbox. */
@Injectable({ providedIn: 'root' })
export class OutboxStatusService {
  private readonly bridge = currentPlatformBridge();
  private readonly state = signal<OutboxStatus | null>(null);
  readonly status = this.state.asReadonly();
  private running: Promise<void> | null = null;
  private again = false;

  constructor() {
    const store = this.bridge?.store;
    if (!store) return;
    const unsubscribe = store.onHealth((health) => this.state.set({ ...health.outbox }));
    inject(DestroyRef).onDestroy(unsubscribe);
    void this.refresh();
  }

  /** Re-reads the status; calls arriving while one is in flight collapse into a single follow-up. */
  refresh(): Promise<void> {
    const store = this.bridge?.store;
    if (!store) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          try {
            this.state.set({ ...(await store.status()).outbox });
          } catch {
            // Status is informational; a failed read keeps the last value.
          }
        } while (this.again);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /** Applies a backpressure flag a commit already reported, then refreshes the counts. */
  noteCommit(backpressure?: boolean): void {
    if (backpressure !== undefined) this.state.update((s) => (s ? { ...s, backpressure } : s));
    void this.refresh();
  }
}
