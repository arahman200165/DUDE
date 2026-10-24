import { InjectionToken } from '@angular/core';
import type { CollabTransport } from '@dude/collab-doc';
import { desktopCollabTransport } from './desktop-collab.transport';

/** Pages, standalone web and a desktop without a Hub adapter: every document reports `unavailable`. */
export const UNAVAILABLE_COLLAB_TRANSPORT: CollabTransport = {
  editableWhenDown: false,
  start: (events) => {
    events.down({ kind: 'terminal', reason: 'unavailable' });
    return { sendControl: () => undefined, sendFrame: () => undefined, stop: () => undefined };
  },
};

/**
 * Hub collaboration for the current environment (PD-114): environment infrastructure like sync, not a platform capability. The desktop
 * answers through the Device Agent's relay (`window.dude.collabHub`, PD-106; an unpaired or not-yet-synced device is refused with a reason
 * and the document reports it); the Hub-served web build provides its socket adapter next to the other Hub web services
 * (`hubWebProviders`); everything else (Pages, standalone, a desktop build without the bridge) is unavailable.
 */
export const HUB_COLLAB = new InjectionToken<CollabTransport>('DUDE Hub collaboration', {
  providedIn: 'root',
  factory: () => desktopCollabTransport() ?? UNAVAILABLE_COLLAB_TRANSPORT,
});
