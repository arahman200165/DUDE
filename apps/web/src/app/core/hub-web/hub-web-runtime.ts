import { ApplicationRef, createComponent, type Provider } from '@angular/core';
import { Router } from '@angular/router';
import type { AgentAppliedChange } from '@dude/contracts';
import { HUB_APP_ENTRY, hardNavigateEntry } from '../hub/hub-app-entry';
import { PersistenceService } from '../persistence/persistence.service';
import { RemoteChangesService } from '../sync/remote-changes.service';
import { HubRealtimeClient } from './hub-realtime.client';
import { HubWebConnectionService } from './hub-web-connection.service';
import { HubWebFeedback } from './hub-web-feedback';
import { startOfflineRetry } from './hub-web-retry';
import { HubWebSyncInfo } from './hub-web-sync-info';
import { HubWebOverlay } from './hub-web-overlay';
import { pageSnapshot, type HubWebBootResult } from './hub-web-boot';
import { HUB_WEB_BOOT } from './hub-web.types';

/** DI values for the application: the boot result, the connection state and the feedback queue created before bootstrap. */
export function hubWebProviders(result: HubWebBootResult): Provider[] {
  return [
    { provide: HUB_WEB_BOOT, useValue: result.boot },
    { provide: HubWebConnectionService, useValue: result.connection },
    { provide: HubWebFeedback, useValue: result.feedback },
    { provide: HubWebSyncInfo, useValue: result.sync },
    // Sign-in, setup and recovery end in a full page load so the boot code attaches this browser to the Hub.
    { provide: HUB_APP_ENTRY, useFactory: hardNavigateEntry },
  ];
}

/**
 * After bootstrap, signed in: wires reverted/Hub-decided kv values to the open signals, mounts the notice and conflict
 * overlay, and starts the realtime link. Returns null when this page did not attach to a Hub (not signed in). When the
 * Hub was unreachable at boot (read-only offline mode) it starts the 15 s retry loop instead, which reloads the page
 * as soon as the Hub answers.
 */
export function startHubWebRuntime(appRef: ApplicationRef, result: HubWebBootResult): HubRealtimeClient | null {
  const boot = result.boot;
  if (!boot) return null;
  const injector = appRef.injector;
  const persistence = injector.get(PersistenceService);
  const remote = injector.get(RemoteChangesService);
  const router = injector.get(Router);

  result.kv?.setAdopter((namespace, key, value) => persistence.adoptRemote(namespace, key, value));

  const overlay = createComponent(HubWebOverlay, { environmentInjector: injector });
  appRef.attachView(overlay.hostView);
  document.body.appendChild(overlay.location.nativeElement);

  if (result.mode === 'offline' && result.probe) {
    result.sync.onStop(startOfflineRetry({ probe: result.probe, reload: () => location.reload() }));
    return null;
  }

  const realtime = new HubRealtimeClient({
    engine: boot.engine,
    access: boot.access,
    cursor: boot.cursor,
    apply: (changes) => remote.apply(changes as AgentAppliedChange[]),
    snapshot: () => pageSnapshot(boot.engine.client),
    goToSignIn: () => void router.navigate(['/hub/sign-in'], { queryParams: { returnUrl: router.url } }),
    reload: () => location.reload(),
    onPulling: (pulling) => result.sync.setPulling(pulling),
    onProgress: ({ cursor, head }) => result.sync.notePull(cursor, head),
  });
  result.sync.pullNow = () => realtime.pull();
  result.sync.onStop(() => realtime.stop());
  realtime.start();
  return realtime;
}
