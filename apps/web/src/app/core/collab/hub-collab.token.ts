import { InjectionToken } from '@angular/core';
import type { CollabTransport } from '@dude/collab-doc';

/** Pages, standalone web and a desktop without a Hub adapter: every document reports `unavailable`. */
export const UNAVAILABLE_COLLAB_TRANSPORT: CollabTransport = {
  editableWhenDown: false,
  start: (events) => {
    events.down({ kind: 'terminal', reason: 'unavailable' });
    return { sendControl: () => undefined, sendFrame: () => undefined, stop: () => undefined };
  },
};

/**
 * Hub collaboration for the current environment (PD-114): environment infrastructure like sync, not a platform capability. The root
 * default is unavailable; the Hub-served web build provides its socket adapter next to the other Hub web services
 * (`hubWebProviders`).
 */
export const HUB_COLLAB = new InjectionToken<CollabTransport>('DUDE Hub collaboration', {
  providedIn: 'root',
  factory: () => UNAVAILABLE_COLLAB_TRANSPORT,
});
