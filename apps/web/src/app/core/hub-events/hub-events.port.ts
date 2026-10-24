import { Injectable, InjectionToken, inject } from '@angular/core';
import { isOwnerViewTopic } from '@dude/contracts/hub';
import type { OwnerViewTopic } from '@dude/contracts/hub';
import type { DesktopHubBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PlatformService } from '../platform/platform.service';

/** The owner admin views a page can refetch (PD-113). */
export type HubViewTopic = OwnerViewTopic;

/**
 * Live "this owner view changed" signal from the Hub (PD-113). The Hub sends a contentless `owner-view-changed` event with a topic;
 * a page reacts by refetching what it already shows. Nothing here carries Hub data and nothing fires on hosts without a live Hub link.
 */
export interface HubEventsPort {
  /** Calls `listener` each time the Hub reports one of `topics` changed. Returns the unsubscribe function. */
  subscribe(topics: readonly HubViewTopic[], listener: (topic: HubViewTopic) => void): () => void;
}

/**
 * The in-memory fan-out the adapters share: a source calls `notify` (anything outside the closed topic list is dropped) and the pages
 * subscribed to that topic hear it. A throwing listener never breaks the source or the other listeners. It is the Hub web adapter as
 * is (the realtime link is the source), the core of the desktop adapter, and, with no source, the inert default.
 */
@Injectable({ providedIn: 'root' })
export class HubEventsFeed implements HubEventsPort {
  private readonly listeners = new Set<{ readonly topics: ReadonlySet<HubViewTopic>; readonly listener: (topic: HubViewTopic) => void }>();

  subscribe(topics: readonly HubViewTopic[], listener: (topic: HubViewTopic) => void): () => void {
    const entry = { topics: new Set(topics), listener };
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  notify(topic: unknown): void {
    if (!isOwnerViewTopic(topic)) return;
    for (const entry of [...this.listeners]) {
      if (!entry.topics.has(topic)) continue;
      try {
        entry.listener(topic);
      } catch {
        // a page must not break the realtime link
      }
    }
  }

  get listening(): number {
    return this.listeners.size;
  }
}

/** Standalone web, Pages and a desktop without the bridge: no Hub link, so nothing ever fires. */
export function createInertHubEvents(): HubEventsPort {
  return { subscribe: () => () => undefined };
}

/**
 * Desktop adapter over `window.dude.hub.onViewChanged`: main forwards the Device Agent's relayed event only to this window. The bridge
 * is attached while at least one page is subscribed and looked up at that moment (it may appear after preload).
 */
export function createDesktopHubEvents(bridge: () => DesktopHubBridge | undefined): HubEventsPort {
  const feed = new HubEventsFeed();
  let detach: (() => void) | null = null;
  return {
    subscribe: (topics, listener) => {
      const off = feed.subscribe(topics, listener);
      if (detach === null) detach = bridge()?.onViewChanged?.((topic) => feed.notify(topic)) ?? null;
      return () => {
        off();
        if (feed.listening === 0 && detach !== null) {
          detach();
          detach = null;
        }
      };
    },
  };
}

/** Hub events for the current host: the desktop bridge, the Hub-served browser's realtime link, or inert. */
export const HUB_EVENTS = new InjectionToken<HubEventsPort>('DUDE Hub events', {
  providedIn: 'root',
  factory: () => {
    const platform = inject(PlatformService);
    const bridge = inject(PLATFORM_BRIDGE);
    switch (platform.hostKind) {
      case 'hub-web':
        return inject(HubEventsFeed);
      case 'desktop':
        return createDesktopHubEvents(() => bridge.get()?.hub);
      default:
        return createInertHubEvents();
    }
  },
});
