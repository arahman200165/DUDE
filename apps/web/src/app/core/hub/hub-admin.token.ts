import { InjectionToken, inject } from '@angular/core';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PlatformService } from '../platform/platform.service';
import { createDesktopHubAdmin } from './desktop-hub-admin.adapter';
import { HubAdminPort } from './hub-admin.port';
import { createHubWebAdmin } from './hub-web-admin.adapter';
import { loadHubClient } from './hub-client-loader';
import { createUnavailableHubAdmin } from './unavailable-hub-admin.adapter';

/**
 * Hub administration for the current host: the main-process bridge on desktop, the Hub's own origin in the
 * Hub-served web build, and a port that rejects everything with `unavailable` on the standalone web build.
 */
export const HUB_ADMIN = new InjectionToken<HubAdminPort>('DUDE Hub administration', {
  providedIn: 'root',
  factory: () => {
    const platform = inject(PlatformService);
    const bridge = inject(PLATFORM_BRIDGE);
    switch (platform.hostKind) {
      case 'desktop':
        return createDesktopHubAdmin(() => bridge.get()?.hub);
      case 'hub-web':
        return createHubWebAdmin({ loadApiClient: loadHubClient });
      default:
        return createUnavailableHubAdmin();
    }
  },
});
