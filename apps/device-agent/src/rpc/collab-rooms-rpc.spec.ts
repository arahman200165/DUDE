import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubApiError } from '@dude/api-client';
import type { HubClient } from '@dude/api-client';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import type { HubRuntime } from '../hub/index.js';
import { createRpcServer } from './server.js';

afterEach(cleanupTemp);

const NOW = new Date('2026-10-24T12:00:00.000Z');
const ROOM = { id: 'room_1', name: 'Notes', participants: 0, createdAt: NOW.toISOString() };

/** An RPC server whose Hub runtime records which credential each call used and with which options. */
function server(api: Partial<Record<keyof HubClient, unknown>>, options: { deviceStatus?: number } = {}) {
  const withOwner = vi.fn(async (fn: (client: HubClient, token: string) => Promise<unknown>) => fn(api as unknown as HubClient, 'owner-token'));
  const deviceCall = vi.fn(async (fn: (client: HubClient, token: string) => Promise<unknown>, _opts?: { authRetryOn403?: boolean }) => {
    if (options.deviceStatus !== undefined) throw new HubApiError(options.deviceStatus, 'forbidden', 'Kept documents need the Markdown documents sync category enabled.');
    return fn(api as unknown as HubClient, 'device-token');
  });
  const manager = { owner: { status: () => ({ signedIn: true, displayName: null, expiresAt: null }), withOwner }, deviceCall };
  const rpc = createRpcServer(openReady(tempDir()), { now: () => NOW, randomBytes: (n) => new Uint8Array(randomBytes(n)), hub: { manager } as unknown as HubRuntime });
  const call = (method: string, params: unknown) => rpc.handle({ id: 1, method, params: params as never } as never);
  return { call, withOwner, deviceCall };
}

describe('collab.rooms.* and collab.documents.* (PD-104)', () => {
  it('always uses the device token, even with the owner signed in, and never retries a 403 as a stale token', async () => {
    const api = {
      listCollabRooms: vi.fn(async () => ({ rooms: [ROOM] })),
      createCollabRoom: vi.fn(async () => ROOM),
      keepCollabRoom: vi.fn(async () => ({ entityId: 'doc1' })),
      listCollabDocuments: vi.fn(async () => ({ documents: [] })),
      deleteCollabDocument: vi.fn(async () => ({ ok: true as const })),
    };
    const { call, withOwner, deviceCall } = server(api);
    expect(await call('collab.rooms.list', {})).toMatchObject({ ok: true, result: { rooms: [ROOM] } });
    expect(await call('collab.rooms.create', { name: 'Notes' })).toMatchObject({ ok: true, result: ROOM });
    expect(await call('collab.rooms.keep', { roomId: 'room_1', title: 'Weekly' })).toMatchObject({ ok: true, result: { entityId: 'doc1' } });
    expect(await call('collab.documents.list', {})).toMatchObject({ ok: true, result: { documents: [] } });
    expect(await call('collab.documents.delete', { id: 'doc1' })).toMatchObject({ ok: true, result: { ok: true } });
    expect(api.listCollabRooms).toHaveBeenCalledExactlyOnceWith('device-token');
    expect(api.createCollabRoom).toHaveBeenCalledExactlyOnceWith('device-token', 'Notes');
    expect(api.keepCollabRoom).toHaveBeenCalledExactlyOnceWith('device-token', 'room_1', 'Weekly');
    expect(api.listCollabDocuments).toHaveBeenCalledExactlyOnceWith('device-token');
    expect(api.deleteCollabDocument).toHaveBeenCalledExactlyOnceWith('device-token', 'doc1');
    expect(withOwner).not.toHaveBeenCalled();
    expect(deviceCall).toHaveBeenCalledTimes(5);
    for (const [, opts] of deviceCall.mock.calls) expect(opts).toEqual({ authRetryOn403: false });
  });

  it('maps a Hub consent refusal to hub-forbidden', async () => {
    const { call } = server({ listCollabDocuments: vi.fn() }, { deviceStatus: 403 });
    expect(await call('collab.documents.list', {})).toMatchObject({ ok: false, error: { code: 'hub-forbidden' } });
  });

  it('rejects malformed parameters before the Hub is called', async () => {
    const api = { createCollabRoom: vi.fn(), keepCollabRoom: vi.fn(), deleteCollabDocument: vi.fn() };
    const { call, deviceCall } = server(api);
    const bad: Array<[string, unknown]> = [
      ['collab.rooms.create', {}], ['collab.rooms.create', { name: '' }], ['collab.rooms.create', { name: 5 }], ['collab.rooms.create', { name: 'x'.repeat(81) }],
      ['collab.rooms.keep', { roomId: 'r1' }], ['collab.rooms.keep', { roomId: 'r/1', title: 'T' }], ['collab.rooms.keep', { roomId: 'r1', title: '' }],
      ['collab.rooms.keep', { roomId: 'r1', title: 'x'.repeat(201) }], ['collab.rooms.keep', { roomId: 'x'.repeat(65), title: 'T' }],
      ['collab.documents.delete', {}], ['collab.documents.delete', { id: '' }], ['collab.documents.delete', { id: 'a b' }], ['collab.documents.delete', { id: 7 }],
    ];
    for (const [method, params] of bad) expect(await call(method, params), `${method} ${JSON.stringify(params).slice(0, 40)}`).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
    expect(deviceCall).not.toHaveBeenCalled();
  });
});

describe('collab.history.* (PD-105)', () => {
  const SNAP = { id: 'snap_1', takenAt: NOW.toISOString(), bytes: 12 };

  it('lists, previews and restores with the device token and no 403 retry', async () => {
    const api = {
      listCollabHistory: vi.fn(async () => ({ snapshots: [SNAP] })),
      getCollabSnapshot: vi.fn(async () => ({ doc: 'user-script:s1', takenAt: SNAP.takenAt, payload: { body: 'x' } })),
      restoreCollabSnapshot: vi.fn(async () => ({ ok: true as const })),
    };
    const { call, withOwner, deviceCall } = server(api);
    expect(await call('collab.history.list', { doc: 'user-script:s1' })).toMatchObject({ ok: true, result: { snapshots: [SNAP] } });
    expect(await call('collab.history.get', { snapshotId: 'snap_1' })).toMatchObject({ ok: true, result: { payload: { body: 'x' } } });
    expect(await call('collab.history.restore', { snapshotId: 'snap_1' })).toMatchObject({ ok: true, result: { ok: true } });
    expect(api.listCollabHistory).toHaveBeenCalledExactlyOnceWith('device-token', 'user-script:s1');
    expect(api.getCollabSnapshot).toHaveBeenCalledExactlyOnceWith('device-token', 'snap_1');
    expect(api.restoreCollabSnapshot).toHaveBeenCalledExactlyOnceWith('device-token', 'snap_1');
    expect(withOwner).not.toHaveBeenCalled();
    for (const [, opts] of deviceCall.mock.calls) expect(opts).toEqual({ authRetryOn403: false });
  });

  it('maps a consent refusal to hub-forbidden', async () => {
    const { call } = server({ restoreCollabSnapshot: vi.fn() }, { deviceStatus: 403 });
    expect(await call('collab.history.restore', { snapshotId: 'snap_1' })).toMatchObject({ ok: false, error: { code: 'hub-forbidden' } });
  });

  it('rejects a room key, a malformed key or snapshot id before the Hub is called', async () => {
    const { call, deviceCall } = server({ listCollabHistory: vi.fn(), getCollabSnapshot: vi.fn(), restoreCollabSnapshot: vi.fn() });
    const bad: Array<[string, unknown]> = [
      ['collab.history.list', {}], ['collab.history.list', { doc: 'room:abc' }], ['collab.history.list', { doc: 'scratchpad' }], ['collab.history.list', { doc: 'notes:a' }],
      ['collab.history.list', { doc: 'scratchpad:a/b' }], ['collab.history.list', { doc: `markdown-doc:${'a'.repeat(65)}` }], ['collab.history.list', { doc: 5 }],
      ['collab.history.get', {}], ['collab.history.get', { snapshotId: '' }], ['collab.history.get', { snapshotId: 'a/b' }], ['collab.history.get', { snapshotId: 'x'.repeat(65) }],
      ['collab.history.restore', {}], ['collab.history.restore', { snapshotId: '../x' }], ['collab.history.restore', { snapshotId: 3 }],
    ];
    for (const [method, params] of bad) expect(await call(method, params), `${method} ${JSON.stringify(params).slice(0, 40)}`).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
    expect(deviceCall).not.toHaveBeenCalled();
  });
});
