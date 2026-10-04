import { ApplicationRef, createComponent, type Provider } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { Router } from '@angular/router';
import type { AgentAppliedChange } from '@dude/contracts';
import { HUB_APP_ENTRY, hardNavigateEntry } from '../hub/hub-app-entry';
import { onHubTransferred } from '../hub/hub-transferred-signal';
import { HubAuthorityNotice } from '../../shell/hub/hub-authority-notice';
import { createWindowStorageBackend } from '../persistence/window-storage-backend';
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
import { forgetPreviousAuthority, type HubAuthorityBlock } from './hub-web-authority';

export interface AuthorityNoticeHandlers {
  readonly checkAgain: () => void;
  readonly forget: () => void;
}

/** Shows the blocking authority notice (PD-071) in its own host element on `document.body`; returns a function that removes it. */
export function mountAuthorityNotice(appRef: ApplicationRef, block: HubAuthorityBlock, handlers: AuthorityNoticeHandlers): () => void {
  const host = document.createElement('app-hub-authority-notice');
  document.body.appendChild(host);
  const notice = createComponent(HubAuthorityNotice, { environmentInjector: appRef.injector, hostElement: host });
  appRef.attachView(notice.hostView);
  notice.setInput('block', block);
  notice.instance.checkAgain.subscribe(handlers.checkAgain);
  notice.instance.forget.subscribe(handlers.forget);
  return () => {
    notice.destroy();
    host.remove();
  };
}

/**
 * Boot gate, blocked: the Hub is transferred or older than this browser's record, so the app never starts. Only the notice
 * runs, in a minimal application of its own (no router, no shell, no Hub call). "Check again" reloads the page, which runs the
 * gate from the start; "Forget the previous Hub and continue" stores the Hub this page saw and reloads, so the next gate passes.
 */
export async function showAuthorityGate(result: HubWebBootResult, reload: () => void = () => location.reload()): Promise<void> {
  const block = result.blocked;
  if (!block) return;
  const appRef = await createApplication();
  mountAuthorityNotice(appRef, block, {
    checkAgain: reload,
    forget: () => {
      if (block.kind === 'older') forgetPreviousAuthority(createWindowStorageBackend('local'), block.seen);
      reload();
    },
  });
  appRef.tick();
}

/**
 * Running page, Hub transferred (PD-071): any Hub call that answered `hub-transferred` (the transport notifies once), a
 * realtime close 4004 or a transferred push/pull all end here. The realtime link, the offline retry loop and the kv timers
 * stop, writes are locked for good, the app behind the notice is made inert and the same blocking notice covers the page.
 * "Check again" reloads, which runs the boot gate.
 */
export function installTransferLock(appRef: ApplicationRef, result: Pick<HubWebBootResult, 'connection' | 'sync'>, reload: () => void = () => location.reload()): () => void {
  let locked = false;
  const lock = (): void => {
    if (locked) return;
    locked = true;
    result.connection.set('transferred');
    result.sync.stopAll();
    document.querySelector('app-root')?.setAttribute('inert', '');
    mountAuthorityNotice(appRef, { kind: 'transferred' }, { checkAgain: reload, forget: () => undefined });
  };
  const offState = result.connection.subscribe((state) => {
    if (state === 'transferred') lock();
  });
  const offSignal = onHubTransferred(lock);
  return () => {
    offState();
    offSignal();
  };
}

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
  installTransferLock(appRef, result);
  // A call during boot already saw the Hub transferred: the lock is up, so no realtime link or retry loop starts.
  if (result.connection.state() === 'transferred') return null;

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
