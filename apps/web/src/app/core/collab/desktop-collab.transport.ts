import { inject } from '@angular/core';
import { createRelayCollabTransport } from '@dude/collab-doc';
import type { CollabTransport } from '@dude/collab-doc';
import type { DesktopCollabHubBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PlatformService } from '../platform/platform.service';

/**
 * Hub collaboration on the desktop (PD-106, PD-114): the `CollabTransport` over `window.dude.collabHub`. The Y.Doc and the editor binding live
 * in the renderer; the resident Device Agent holds the pinned Hub socket and main relays opaque frames, so this adapter never sees a credential
 * or a certificate. The link itself (welcome, retry and refusal handling, backoff, base64) is `createRelayCollabTransport` in `@dude/collab-doc`.
 * The bridge is looked up per call, so it may appear after preload. The transport is editable while down: the editor saves locally and the outbox
 * syncs it later.
 */
export function createDesktopCollabTransport(bridge: () => DesktopCollabHubBridge | undefined): CollabTransport {
  return createRelayCollabTransport(bridge);
}

/** The desktop transport when this build is the desktop app and its preload exposes `collabHub`; null everywhere else (Pages, standalone web, Hub web, an older desktop). */
export function desktopCollabTransport(): CollabTransport | null {
  const platform = inject(PlatformService);
  const bridge = inject(PLATFORM_BRIDGE);
  return platform.hostKind === 'desktop' && bridge.get()?.collabHub !== undefined ? createDesktopCollabTransport(() => bridge.get()?.collabHub) : null;
}
