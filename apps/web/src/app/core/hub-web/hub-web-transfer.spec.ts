import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFetchHubTransport } from '../hub/fetch-hub-transport';
import { hubTransferredSeen, isTransferredResponse, noteHubTransferred, onHubTransferred, resetHubTransferredSignal } from '../hub/hub-transferred-signal';
import { AUTHORITY_STORAGE_KEY, readAuthorityRecord } from './hub-web-authority';
import { HUB_WRITE_REFUSED } from './hub-web-connection.service';
import { HubWebSyncInfo } from './hub-web-sync-info';
import { HubWebConnectionService } from './hub-web-connection.service';
import { installTransferLock, mountAuthorityNotice, showAuthorityGate } from './hub-web-runtime';
import type { HubWebBootResult } from './hub-web-boot';
import { phaseOf } from './hub-web-sync.adapter';
import { createWindowStorageBackend } from '../persistence/window-storage-backend';
import { apiError, makeRig } from './testing/fake-hub';

const transferredBody = { error: { code: 'hub-transferred', message: 'This Hub was transferred.' } };
const jsonResponse = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('transferred signal at the transport', () => {
  beforeEach(resetHubTransferredSignal);
  afterEach(resetHubTransferredSignal);

  it('recognises only a 503 with the hub-transferred code', () => {
    expect(isTransferredResponse(503, transferredBody)).toBe(true);
    expect(isTransferredResponse(503, { error: { code: 'unavailable' } })).toBe(false);
    expect(isTransferredResponse(500, transferredBody)).toBe(false);
    expect(isTransferredResponse(503, null)).toBe(false);
    expect(isTransferredResponse(503, undefined)).toBe(false);
  });

  it('notifies once per sighting and replays to a late subscriber', () => {
    const early = vi.fn();
    const off = onHubTransferred(early);
    expect(hubTransferredSeen()).toBe(false);
    noteHubTransferred();
    expect(early).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    onHubTransferred(late);
    expect(late).toHaveBeenCalledTimes(1);
    off();
    noteHubTransferred();
    expect(early).toHaveBeenCalledTimes(1);
  });

  it('the fetch transport reports a hub-transferred answer and still returns it to the client; other 503s do not', async () => {
    const seen = vi.fn();
    onHubTransferred(seen);
    const answers = [jsonResponse(503, { error: { code: 'unavailable', message: 'down' } }), jsonResponse(503, transferredBody), jsonResponse(200, { ok: true })];
    const transport = createFetchHubTransport({ csrfToken: () => undefined, fetch: (async () => answers.shift()) as unknown as typeof fetch });
    expect((await transport.request({ method: 'GET', path: '/api/v1/hello' })).status).toBe(503);
    expect(seen).not.toHaveBeenCalled();
    const transferred = await transport.request({ method: 'GET', path: '/api/v1/web/changes' });
    expect(transferred).toMatchObject({ status: 503, body: transferredBody });
    expect(seen).toHaveBeenCalledTimes(1);
    expect((await transport.request({ method: 'GET', path: '/api/v1/hello' })).status).toBe(200);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('transferred Hub at the write engine', () => {
  it('a push answered hub-transferred locks the connection for good and refuses the write with the transferred text', async () => {
    const rig = makeRig();
    rig.hub.failWith = apiError(503, 'hub-transferred');
    const outcome = await rig.engine.commit({ entityType: 'pipeline', entityId: 'p', schemaVersion: 1, payload: { name: 'P' } });
    expect(outcome).toEqual({ ok: false, error: HUB_WRITE_REFUSED.transferred });
    expect(rig.connection.state()).toBe('transferred');

    // No further push is attempted: later writes are refused locally and the Hub is not called again.
    const pushes = rig.hub.pushes.length;
    rig.hub.failWith = null;
    expect(await rig.engine.commit({ entityType: 'pipeline', entityId: 'q', schemaVersion: 1, payload: { name: 'Q' } })).toEqual({ ok: false, error: HUB_WRITE_REFUSED.transferred });
    expect(rig.hub.pushes).toHaveLength(pushes);
  });

  it('maps to the blocked sync phase, not offline', () => {
    expect(phaseOf('transferred', false)).toBe('needs-reconcile');
  });
});

describe('transfer lock on a running page', () => {
  let appRef: ApplicationRef;
  let connection: HubWebConnectionService;
  let sync: HubWebSyncInfo;

  beforeEach(() => {
    resetHubTransferredSignal();
    TestBed.configureTestingModule({});
    appRef = TestBed.inject(ApplicationRef);
    connection = new HubWebConnectionService();
    sync = new HubWebSyncInfo();
    const root = document.createElement('app-root');
    document.body.appendChild(root);
  });
  afterEach(() => {
    document.querySelectorAll('app-hub-authority-notice, app-root').forEach((el) => el.remove());
    resetHubTransferredSignal();
  });

  const notice = (): Element | null => document.querySelector('app-hub-authority-notice');

  it('locks on a transport sighting: stops what sign-out would stop, makes the app inert and shows the moved notice', () => {
    const stopped = vi.fn();
    sync.onStop(stopped);
    const reload = vi.fn();
    installTransferLock(appRef, { connection, sync }, reload);
    expect(notice()).toBeNull();

    noteHubTransferred();
    appRef.tick();

    expect(connection.state()).toBe('transferred');
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(document.querySelector('app-root')?.hasAttribute('inert')).toBe(true);
    expect(notice()?.textContent).toContain('This Hub was moved');
    expect(notice()?.textContent).toContain('Nothing on this page can change data here.');

    (notice()?.querySelector('[data-testid="check-again"]') as HTMLButtonElement).click();
    expect(reload).toHaveBeenCalledTimes(1);

    // A second sighting does not stack a second notice.
    noteHubTransferred();
    appRef.tick();
    expect(document.querySelectorAll('app-hub-authority-notice')).toHaveLength(1);
  });

  it('locks when the connection state becomes transferred (realtime 4004 or a refused push)', () => {
    installTransferLock(appRef, { connection, sync }, vi.fn());
    connection.set('transferred');
    appRef.tick();
    expect(notice()).not.toBeNull();
  });

  it('locks at once when a call during boot already saw the Hub transferred', () => {
    noteHubTransferred();
    installTransferLock(appRef, { connection, sync }, vi.fn());
    appRef.tick();
    expect(connection.state()).toBe('transferred');
    expect(notice()).not.toBeNull();
  });

  it('the older notice shows both epochs and its forget button reports the choice', () => {
    const forget = vi.fn();
    const checkAgain = vi.fn();
    const remove = mountAuthorityNotice(appRef, { kind: 'older', storedEpoch: 4, seenEpoch: 2, seen: { hubInstanceId: 'b', authorityEpoch: 2 } }, { checkAgain, forget });
    appRef.tick();
    expect(notice()?.textContent).toContain('This Hub is older than the one this browser used before');
    expect(notice()?.textContent).toContain('epoch 4');
    expect(notice()?.textContent).toContain('epoch 2');
    (notice()?.querySelector('[data-testid="forget"]') as HTMLButtonElement).click();
    expect(forget).toHaveBeenCalledTimes(1);
    (notice()?.querySelector('[data-testid="check-again"]') as HTMLButtonElement).click();
    expect(checkAgain).toHaveBeenCalledTimes(1);
    remove();
    expect(notice()).toBeNull();
  });

  it('the transferred notice has no forget button', () => {
    mountAuthorityNotice(appRef, { kind: 'transferred' }, { checkAgain: vi.fn(), forget: vi.fn() });
    appRef.tick();
    expect(notice()?.querySelector('[data-testid="forget"]')).toBeNull();
    expect(notice()?.querySelector('[data-testid="check-again"]')?.textContent).toContain('Check again');
  });
});

describe('boot gate notice (blocked boot)', () => {
  const local = createWindowStorageBackend('local');
  afterEach(() => {
    document.querySelectorAll('app-hub-authority-notice').forEach((el) => el.remove());
    local.remove(AUTHORITY_STORAGE_KEY);
  });

  const blockedResult = (blocked: HubWebBootResult['blocked']): HubWebBootResult => ({
    mode: 'blocked', boot: null, connection: new HubWebConnectionService(), feedback: undefined as never, sync: new HubWebSyncInfo(), kv: null, blocked,
  });

  it('"Forget the previous Hub and continue" stores the seen Hub, then reloads; "Check again" only reloads', async () => {
    local.set(AUTHORITY_STORAGE_KEY, JSON.stringify({ hubInstanceId: 'a', authorityEpoch: 5 }));
    const reload = vi.fn();
    await showAuthorityGate(blockedResult({ kind: 'older', storedEpoch: 5, seenEpoch: 2, seen: { hubInstanceId: 'b', authorityEpoch: 2 } }), reload);
    const host = document.querySelector('app-hub-authority-notice') as HTMLElement;
    expect(host).not.toBeNull();

    (host.querySelector('[data-testid="check-again"]') as HTMLButtonElement).click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(readAuthorityRecord(local)).toEqual({ hubInstanceId: 'a', authorityEpoch: 5 });

    (host.querySelector('[data-testid="forget"]') as HTMLButtonElement).click();
    expect(reload).toHaveBeenCalledTimes(2);
    expect(readAuthorityRecord(local)).toEqual({ hubInstanceId: 'b', authorityEpoch: 2 });
  });
});
