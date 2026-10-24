import { Injectable } from '@angular/core';
import { parseNotificationEvent } from '@dude/contracts/hub';
import type { NotificationEventData } from '@dude/contracts/hub';

/**
 * The seam between the Hub web realtime link and the notifications port (PD-109): the link publishes the Hub's `notification` events here and
 * the adapter subscribes. A payload that is not exactly an id, a known kind and severity, and a bounded title is dropped. A plain class: on
 * other hosts the root default is never touched.
 */
@Injectable({ providedIn: 'root' })
export class HubWebNotificationEvents {
  private readonly listeners = new Set<(notification: NotificationEventData) => void>();

  /** Live `notification` events from the Hub. Returns the unsubscribe function. */
  subscribe(listener: (notification: NotificationEventData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(payload: unknown): void {
    const notification = parseNotificationEvent(payload);
    if (notification === null) return;
    for (const listener of [...this.listeners]) {
      try {
        listener(notification);
      } catch {
        // a listener must not break the realtime link
      }
    }
  }
}
