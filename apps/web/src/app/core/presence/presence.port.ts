import { InjectionToken, inject } from '@angular/core';
import type { PresenceActivity } from '@dude/contracts/hub';
import type { DesktopPresenceBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import { HubWebPresence } from '../hub-web/hub-web-presence';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PlatformService } from '../platform/platform.service';

/** Where this device's current activity goes (PD-108). Fire and forget: a failed delivery is dropped, the next change sends again. */
export interface PresencePort {
  setActivity(activity: PresenceActivity | null): void;
}

/** Desktop adapter over `window.dude.presence`: main validates and hands it to the Device Agent. The bridge is looked up per call. */
export function createDesktopPresenceAdapter(bridge: () => DesktopPresenceBridge | undefined): PresencePort {
  return {
    setActivity: (activity) => {
      void bridge()?.setActivity(activity).catch(() => undefined);
    },
  };
}

/** Hub web adapter: hands the activity to the realtime link, which sends it once its welcome shows a Hub that understands it. */
export function createHubWebPresenceAdapter(link: Pick<HubWebPresence, 'setActivity'>): PresencePort {
  return { setActivity: (activity) => link.setActivity(activity) };
}

/**
 * Presence for the current host: the desktop bridge, the Hub-served browser's realtime link, or null (Pages build, standalone web, a
 * desktop without the bridge), where nothing can be shared and the setting is not offered.
 */
export const PRESENCE_PORT = new InjectionToken<PresencePort | null>('DUDE presence', {
  providedIn: 'root',
  factory: () => {
    const platform = inject(PlatformService);
    const bridge = inject(PLATFORM_BRIDGE);
    if (platform.hostKind === 'hub-web') return createHubWebPresenceAdapter(inject(HubWebPresence));
    if (platform.hostKind === 'desktop' && bridge.get()?.presence !== undefined) return createDesktopPresenceAdapter(() => bridge.get()?.presence);
    return null;
  },
});
